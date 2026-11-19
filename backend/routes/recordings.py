import os
import uuid
from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity, decode_token
from werkzeug.utils import secure_filename

from extensions import db
from models.meeting import Meeting
from models.recording import Recording
from utils.validation import validate_audio_file, AUDIO_EXTENSIONS

recordings_bp = Blueprint("recordings", __name__)

UPLOAD_FOLDER = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads", "recordings"
)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def _error(message, status_code):
    return jsonify({"success": False, "message": message}), status_code


def get_current_user_id():
    """
    Helper to get user identity either from JWT header or ?token= query param.
    Useful for HTML5 <audio> streaming tags.
    """
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token_str = auth_header.split(" ")[1]
    else:
        token_str = request.args.get("token")

    if not token_str:
        return None

    try:
        decoded = decode_token(token_str)
        return int(decoded.get("sub"))
    except Exception:
        return None


# 1. UPLOAD RECORDING
@recordings_bp.route("/upload", methods=["POST"])
@jwt_required()
def upload_recording():
    current_user_id = int(get_jwt_identity())

    meeting_id = request.form.get("meeting_id")
    if not meeting_id:
        return _error("Meeting ID is required", 400)

    try:
        meeting_id = int(meeting_id)
    except ValueError:
        return _error("Invalid meeting ID", 400)

    # Ensure meeting exists and belongs to current user
    meeting = Meeting.query.filter_by(id=meeting_id, user_id=current_user_id).first()
    if not meeting:
        return _error("Meeting not found or unauthorized", 404)

    if "file" not in request.files:
        return _error("No audio file provided", 400)

    file_storage = request.files["file"]
    validated_file, err = validate_audio_file(file_storage)
    if err:
        return _error(err, 400)

    raw_filename = validated_file.filename or "recording.webm"
    original_filename = secure_filename(raw_filename) or "recording.webm"
    ext = original_filename.rsplit(".", 1)[1].lower() if "." in original_filename else "webm"

    # Generate unique stored filename
    stored_filename = f"{uuid.uuid4().hex}_{original_filename}"
    file_path = os.path.join(UPLOAD_FOLDER, stored_filename)

    validated_file.save(file_path)
    file_size = os.path.getsize(file_path)

    # Optional duration sent from client (e.g. seconds recorded by browser)
    duration = 0.0
    duration_raw = request.form.get("duration")
    if duration_raw:
        try:
            duration = max(0.0, float(duration_raw))
        except (ValueError, TypeError):
            duration = 0.0

    source = request.form.get("source", "upload").strip().lower()
    if source not in ["browser", "upload"]:
        source = "upload"

    mime_type = validated_file.mimetype or f"audio/{ext}"

    new_recording = Recording(
        meeting_id=meeting.id,
        user_id=current_user_id,
        filename=stored_filename,
        original_filename=original_filename,
        file_path=file_path,
        file_size=file_size,
        duration=duration,
        mime_type=mime_type,
        source=source,
        status="ready"
    )

    try:
        db.session.add(new_recording)

        # Update meeting status if scheduled
        if meeting.status == "scheduled":
            meeting.status = "in-progress"

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Recording uploaded and attached successfully",
            "recording": new_recording.to_dict()
        }), 201
    except Exception as e:
        db.session.rollback()
        # Clean up file on filesystem if DB commit fails
        if os.path.exists(file_path):
            os.remove(file_path)
        return _error(f"Failed to save recording metadata: {str(e)}", 500)


# 2. GET RECORDINGS FOR A MEETING
@recordings_bp.route("/meeting/<int:meeting_id>", methods=["GET"])
@jwt_required()
def get_meeting_recordings(meeting_id):
    current_user_id = int(get_jwt_identity())

    meeting = Meeting.query.filter_by(id=meeting_id, user_id=current_user_id).first()
    if not meeting:
        return _error("Meeting not found", 404)

    recordings = Recording.query.filter_by(
        meeting_id=meeting_id,
        user_id=current_user_id
    ).order_by(Recording.created_at.desc()).all()

    return jsonify({
        "success": True,
        "count": len(recordings),
        "recordings": [r.to_dict() for r in recordings]
    }), 200


# 3. GET SINGLE RECORDING METADATA
@recordings_bp.route("/<int:recording_id>", methods=["GET"])
@jwt_required()
def get_recording(recording_id):
    current_user_id = int(get_jwt_identity())

    recording = Recording.query.filter_by(id=recording_id, user_id=current_user_id).first()
    if not recording:
        return _error("Recording not found", 404)

    return jsonify({
        "success": True,
        "recording": recording.to_dict()
    }), 200


# 4. STREAM / PLAY AUDIO FILE
@recordings_bp.route("/<int:recording_id>/audio", methods=["GET"])
def stream_audio(recording_id):
    user_id = get_current_user_id()
    if not user_id:
        return _error("Authentication required to stream audio", 401)

    recording = Recording.query.filter_by(id=recording_id, user_id=user_id).first()
    if not recording:
        return _error("Recording not found", 404)

    if not os.path.exists(recording.file_path):
        return _error("Audio file not found on server", 404)

    # conditional=True enables HTTP 206 Partial Content / audio seeking in browser
    return send_file(
        recording.file_path,
        mimetype=recording.mime_type or "audio/webm",
        as_attachment=False,
        conditional=True
    )


# 5. DELETE RECORDING
@recordings_bp.route("/<int:recording_id>", methods=["DELETE"])
@jwt_required()
def delete_recording(recording_id):
    current_user_id = int(get_jwt_identity())

    recording = Recording.query.filter_by(id=recording_id, user_id=current_user_id).first()
    if not recording:
        return _error("Recording not found", 404)

    file_path = recording.file_path

    try:
        db.session.delete(recording)
        db.session.commit()

        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass

        return jsonify({
            "success": True,
            "message": "Recording deleted successfully"
        }), 200
    except Exception as e:
        db.session.rollback()
        return _error(f"Failed to delete recording: {str(e)}", 500)
