import logging
import threading
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

from extensions import db
from models.meeting import Meeting
from models.recording import Recording
from models.transcript import Transcript
from services.transcription_service import transcribe_audio_file

logger = logging.getLogger(__name__)
transcriptions_bp = Blueprint("transcriptions", __name__)


def _error(message, status_code):
    return jsonify({"success": False, "message": message}), status_code


def _background_transcribe(app, meeting_id, recording_id, model_size, language, user_id):
    """Run Whisper transcription in a background thread and update the transcript record."""
    with app.app_context():
        try:
            meeting = Meeting.query.filter_by(id=meeting_id, user_id=user_id).first()
            if not meeting:
                logger.error(f"Background transcribe: meeting {meeting_id} not found for user {user_id}")
                return

            if recording_id:
                recording = Recording.query.filter_by(
                    id=recording_id,
                    meeting_id=meeting_id,
                    user_id=user_id
                ).first()
            else:
                recording = Recording.query.filter_by(
                    meeting_id=meeting_id,
                    user_id=user_id
                ).order_by(Recording.created_at.desc()).first()

            if not recording:
                logger.error(f"Background transcribe: no recording for meeting {meeting_id}")
                transcript = Transcript.query.filter_by(
                    meeting_id=meeting_id, user_id=user_id
                ).order_by(Transcript.created_at.desc()).first()
                if transcript:
                    transcript.status = "failed"
                    db.session.commit()
                return

            result = transcribe_audio_file(
                file_path=recording.file_path,
                model_size=model_size,
                language=language if language and language != "auto" else None,
            )

            full_text = result["full_text"]
            detected_language = result["language"]
            duration = result["duration"]
            segments = result["segments"]

            if not full_text.strip():
                full_text = "(No audible speech detected in this recording)"

            existing_transcript = Transcript.query.filter_by(
                meeting_id=meeting_id, user_id=user_id
            ).order_by(Transcript.created_at.desc()).first()

            if existing_transcript:
                existing_transcript.recording_id = recording.id
                existing_transcript.full_text = full_text
                existing_transcript.language = detected_language
                existing_transcript.duration = duration
                existing_transcript.segments = segments
                existing_transcript.status = "completed"
                transcript = existing_transcript
            else:
                transcript = Transcript(
                    meeting_id=meeting.id,
                    recording_id=recording.id,
                    user_id=user_id,
                    full_text=full_text,
                    language=detected_language,
                    duration=duration,
                    segments=segments,
                    status="completed"
                )
                db.session.add(transcript)

            recording.status = "transcribed"
            db.session.commit()
            logger.info(f"Background transcription completed for meeting {meeting_id}")

        except Exception as e:
            db.session.rollback()
            logger.error(f"Background transcription failed for meeting {meeting_id}: {e}", exc_info=True)
            try:
                transcript = Transcript.query.filter_by(
                    meeting_id=meeting_id, user_id=user_id
                ).order_by(Transcript.created_at.desc()).first()
                if transcript:
                    transcript.status = "failed"
                    db.session.commit()
            except Exception:
                db.session.rollback()


# 1. TRANSCRIBE MEETING AUDIO (async pipeline)
@transcriptions_bp.route("/meetings/<int:meeting_id>/transcribe", methods=["POST"])
@jwt_required()
def transcribe_meeting(meeting_id):
    current_user_id = int(get_jwt_identity())

    meeting = Meeting.query.filter_by(id=meeting_id, user_id=current_user_id).first()
    if not meeting:
        return _error("Meeting not found", 404)

    data = request.get_json() or {}
    recording_id = data.get("recording_id")
    model_size = data.get("model_size", "base")
    language = data.get("language")

    # Select target recording
    if recording_id:
        recording = Recording.query.filter_by(
            id=recording_id,
            meeting_id=meeting_id,
            user_id=current_user_id
        ).first()
        if not recording:
            return _error("Selected recording not found", 404)
    else:
        # Pick the most recent recording for this meeting
        recording = Recording.query.filter_by(
            meeting_id=meeting_id,
            user_id=current_user_id
        ).order_by(Recording.created_at.desc()).first()

        if not recording:
            return _error(
                "No audio recordings found for this meeting. Please record or upload audio first.",
                400
            )

    # Mark the transcript as processing and return immediately so the client can poll.
    existing_transcript = Transcript.query.filter_by(
        meeting_id=meeting_id, user_id=current_user_id
    ).order_by(Transcript.created_at.desc()).first()

    if existing_transcript:
        existing_transcript.recording_id = recording.id
        existing_transcript.status = "processing"
        db.session.commit()
        transcript = existing_transcript
    else:
        transcript = Transcript(
            meeting_id=meeting.id,
            recording_id=recording.id,
            user_id=current_user_id,
            full_text="",
            language="en",
            duration=0.0,
            segments=[],
            status="processing"
        )
        db.session.add(transcript)
        db.session.commit()

    thread = threading.Thread(
        target=_background_transcribe,
        args=(current_app._get_current_object(), meeting_id, recording.id, model_size, language, current_user_id),
        daemon=True,
    )
    thread.start()

    return jsonify({
        "success": True,
        "message": "Transcription started",
        "transcript": transcript.to_dict(),
        "status": "processing",
    }), 202


# 2. GET TRANSCRIPT FOR A MEETING
@transcriptions_bp.route("/meetings/<int:meeting_id>/transcript", methods=["GET"])
@jwt_required()
def get_meeting_transcript(meeting_id):
    current_user_id = int(get_jwt_identity())

    meeting = Meeting.query.filter_by(id=meeting_id, user_id=current_user_id).first()
    if not meeting:
        return _error("Meeting not found", 404)

    transcript = Transcript.query.filter_by(
        meeting_id=meeting_id,
        user_id=current_user_id
    ).order_by(Transcript.created_at.desc()).first()

    return jsonify({
        "success": True,
        "transcript": transcript.to_dict() if transcript else None
    }), 200


# 3. GET TRANSCRIPT STATUS (for polling)
@transcriptions_bp.route("/meetings/<int:meeting_id>/transcript/status", methods=["GET"])
@jwt_required()
def get_transcript_status(meeting_id):
    current_user_id = int(get_jwt_identity())

    meeting = Meeting.query.filter_by(id=meeting_id, user_id=current_user_id).first()
    if not meeting:
        return _error("Meeting not found", 404)

    transcript = Transcript.query.filter_by(
        meeting_id=meeting_id,
        user_id=current_user_id
    ).order_by(Transcript.created_at.desc()).first()

    if not transcript:
        return jsonify({
            "success": True,
            "status": "not_found",
            "transcript": None
        }), 200

    return jsonify({
        "success": True,
        "status": transcript.status or "completed",
        "transcript": transcript.to_dict()
    }), 200


# 4. DELETE TRANSCRIPT
@transcriptions_bp.route("/transcripts/<int:transcript_id>", methods=["DELETE"])
@jwt_required()
def delete_transcript(transcript_id):
    current_user_id = int(get_jwt_identity())

    transcript = Transcript.query.filter_by(
        id=transcript_id,
        user_id=current_user_id
    ).first()

    if not transcript:
        return _error("Transcript not found", 404)

    try:
        db.session.delete(transcript)
        db.session.commit()
        return jsonify({
            "success": True,
            "message": "Transcript deleted successfully"
        }), 200
    except Exception as e:
        db.session.rollback()
        return _error(f"Failed to delete transcript: {str(e)}", 500)


@transcriptions_bp.route("/transcriptions/<int:meeting_id>/save-text", methods=["POST"])
@jwt_required()
def save_live_transcript(meeting_id):
    """Save a plain-text transcript produced by Live Transcription (browser Speech API)."""
    current_user_id = get_jwt_identity()

    meeting = Meeting.query.filter_by(id=meeting_id, user_id=current_user_id).first()
    if not meeting:
        return _error("Meeting not found", 404)

    data = request.get_json(silent=True) or {}
    transcript_text = (data.get("transcript_text") or "").strip()
    if not transcript_text:
        return _error("transcript_text is required", 400)

    source = str(data.get("source") or "live").strip().lower()
    if source not in ("live", "upload", "browser"):
        source = "live"

    raw_segments = data.get("segments") or []
    segments = []
    if isinstance(raw_segments, list):
        for s in raw_segments:
            if isinstance(s, dict):
                segments.append({
                    "start": float(s.get("elapsed", s.get("start", 0.0))),
                    "end": float(s.get("elapsed", s.get("end", 0.0))),
                    "text": str(s.get("text", "")).strip(),
                    "speaker": str(s.get("speaker", "Speaker")),
                    "timestamp": str(s.get("timestamp", "")),
                })

    duration = float(data.get("duration") or (segments[-1]["end"] if segments else 0.0))

    try:
        # Upsert: update existing transcript or create a new one
        transcript = Transcript.query.filter_by(
            meeting_id=meeting_id,
            user_id=current_user_id,
        ).first()

        if transcript:
            transcript.full_text = transcript_text
            transcript.source = source
            if segments:
                transcript.segments = segments
            if duration > 0:
                transcript.duration = duration
            transcript.status = "completed"
        else:
            transcript = Transcript(
                meeting_id=meeting_id,
                user_id=current_user_id,
                full_text=transcript_text,
                source=source,
                segments=segments if segments else None,
                duration=duration,
                status="completed",
            )
            db.session.add(transcript)

        # Update meeting status to completed if scheduled/in-progress
        if meeting.status in ("scheduled", "in-progress"):
            meeting.status = "completed"

        db.session.commit()
        return jsonify({
            "success": True,
            "message": "Transcript saved successfully to meeting",
            "transcript": transcript.to_dict(),
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"save_live_transcript error: {e}")
        return _error(f"Failed to save transcript: {str(e)}", 500)
