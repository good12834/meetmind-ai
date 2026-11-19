"""
Socket.IO event handlers for the Live Meeting Assistant.
"""

import base64
import logging
from datetime import datetime
from flask import request
from flask_jwt_extended import decode_token
from flask_socketio import join_room, leave_room, emit, disconnect

from extensions import socketio
from extensions import db
from models.live_session import LiveMeetingSession
from models.live_transcript import LiveTranscriptSegment
from services.live_transcription_service import transcribe_audio_chunk
from services.live_ai_service import extract_insights

logger = logging.getLogger(__name__)


def _get_user_id_from_socket(auth=None):
    token = None
    try:
        if isinstance(auth, dict):
            token = auth.get("token")
        if not token:
            token = request.args.get("token")
        if not token:
            return None
        payload = decode_token(token)
        return int(payload["sub"])
    except Exception:
        return None


@socketio.on("connect")
def handle_connect(auth=None):
    # Accept connection; individual event handlers enforce auth if required
    return True


@socketio.on("join_session")
def handle_join_session(data):
    user_id = _get_user_id_from_socket()
    if not user_id:
        emit("error", {"message": "Authentication required"})
        return

    session_id = (data or {}).get("session_id")
    if not session_id:
        emit("error", {"message": "session_id is required"})
        return

    session = LiveMeetingSession.query.filter_by(
        id=session_id, user_id=user_id, status="active"
    ).first()
    if not session:
        emit("error", {"message": "Live session not found or not active"})
        return

    join_room(f"session_{session_id}")
    logger.info(f"User {user_id} joined live session {session_id}")
    emit("session_started", {"session": session.to_dict()}, room=f"session_{session_id}")


@socketio.on("audio_chunk")
def handle_audio_chunk(data):
    user_id = _get_user_id_from_socket()
    if not user_id:
        emit("error", {"message": "Authentication required"})
        return

    session_id = data.get("session_id")
    audio_b64 = data.get("audio_base64")
    model_size = data.get("model_size", "base")
    language = data.get("language")

    if not session_id:
        emit("error", {"message": "session_id is required"})
        return
    if not audio_b64:
        emit("error", {"message": "audio_base64 is required"})
        return

    session = LiveMeetingSession.query.filter_by(
        id=session_id, user_id=user_id
    ).first()
    if not session:
        emit("error", {"message": "Live session not found"})
        return

    try:
        audio_bytes = base64.b64decode(audio_b64)
    except Exception as e:
        emit("error", {"message": f"Invalid audio data: {str(e)}"})
        return

    result = transcribe_audio_chunk(
        audio_bytes=audio_bytes,
        model_size=model_size,
        language=language if language and language != "auto" else None,
    )

    if not result.get("text"):
        return

    segment = LiveTranscriptSegment(
        session_id=session_id,
        speaker="Speaker",
        text=result["text"],
        start_time=result.get("start", 0.0),
        end_time=result.get("end", 0.0),
        is_final=result.get("is_final", True),
    )
    db.session.add(segment)
    db.session.commit()

    segment_dict = segment.to_dict()
    emit("transcript_segment", segment_dict, room=f"session_{session_id}")

    if result.get("is_final"):
        insights = extract_insights(result["text"])
        if insights.get("key_points") or insights.get("decisions") or insights.get("action_items"):
            segment.ai_insights = insights
            db.session.commit()

            insight_payload = {
                "segment_id": segment.id,
                "session_id": session_id,
                "text": result["text"],
                "insights": insights,
            }
            emit("ai_insight", insight_payload, room=f"session_{session_id}")


@socketio.on("leave_session")
def handle_leave_session(data):
    session_id = (data or {}).get("session_id")
    if session_id:
        leave_room(f"session_{session_id}")
        logger.info(f"User left live session {session_id}")


@socketio.on("end_session")
def handle_end_session(data):
    user_id = _get_user_id_from_socket()
    if not user_id:
        emit("error", {"message": "Authentication required"})
        return

    session_id = (data or {}).get("session_id")
    if not session_id:
        emit("error", {"message": "session_id is required"})
        return

    session = LiveMeetingSession.query.filter_by(
        id=session_id, user_id=user_id
    ).first()
    if not session:
        emit("error", {"message": "Live session not found"})
        return

    try:
        session.status = "stopped"
        session.ended_at = datetime.utcnow()
        db.session.commit()
        emit("session_stopped", {"session": session.to_dict()}, room=f"session_{session_id}")
        leave_room(f"session_{session_id}")
        logger.info(f"Live session {session_id} ended by user {user_id}")
    except Exception as e:
        db.session.rollback()
        emit("error", {"message": f"Failed to end session: {str(e)}"})
