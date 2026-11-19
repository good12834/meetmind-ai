"""
Live Meeting Assistant REST endpoints.
"""

import logging
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from extensions import db
from models.meeting import Meeting
from models.live_session import LiveMeetingSession
from models.live_transcript import LiveTranscriptSegment

logger = logging.getLogger(__name__)
live_bp = Blueprint("live", __name__)


def _error(message, status_code):
    return jsonify({"success": False, "message": message}), status_code


@live_bp.route("/live/sessions", methods=["POST"])
@jwt_required()
def start_live_session():
    current_user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    meeting_id = data.get("meeting_id")

    if not meeting_id:
        return _error("meeting_id is required", 400)

    meeting = Meeting.query.filter_by(id=meeting_id, user_id=current_user_id).first()
    if not meeting:
        return _error("Meeting not found", 404)

    existing = LiveMeetingSession.query.filter_by(
        meeting_id=meeting_id, user_id=current_user_id, status="active"
    ).first()
    if existing:
        existing.status = "stopped"
        existing.ended_at = datetime.utcnow()
        db.session.commit()

    session = LiveMeetingSession(
        meeting_id=meeting_id,
        user_id=current_user_id,
        status="active",
    )
    try:
        db.session.add(session)
        db.session.commit()
        return jsonify({
            "success": True,
            "message": "Live session started",
            "session": session.to_dict(),
        }), 201
    except Exception as e:
        db.session.rollback()
        return _error(f"Failed to start live session: {str(e)}", 500)


@live_bp.route("/live/sessions/<int:session_id>/stop", methods=["POST"])
@jwt_required()
def stop_live_session(session_id):
    current_user_id = int(get_jwt_identity())

    session = LiveMeetingSession.query.filter_by(
        id=session_id, user_id=current_user_id
    ).first()
    if not session:
        return _error("Live session not found", 404)

    try:
        session.status = "stopped"
        session.ended_at = datetime.utcnow()
        db.session.commit()
        return jsonify({
            "success": True,
            "message": "Live session stopped",
            "session": session.to_dict(),
        }), 200
    except Exception as e:
        db.session.rollback()
        return _error(f"Failed to stop live session: {str(e)}", 500)


@live_bp.route("/live/sessions/<int:session_id>/segments", methods=["GET"])
@jwt_required()
def get_live_segments(session_id):
    current_user_id = int(get_jwt_identity())

    session = LiveMeetingSession.query.filter_by(
        id=session_id, user_id=current_user_id
    ).first()
    if not session:
        return _error("Live session not found", 404)

    segments = (
        LiveTranscriptSegment.query
        .filter_by(session_id=session_id)
        .order_by(LiveTranscriptSegment.created_at.asc())
        .all()
    )

    return jsonify({
        "success": True,
        "session": session.to_dict(),
        "segments": [s.to_dict() for s in segments],
    }), 200


@live_bp.route("/live/sessions/<int:session_id>/insights", methods=["GET"])
@jwt_required()
def get_live_insights(session_id):
    current_user_id = int(get_jwt_identity())

    session = LiveMeetingSession.query.filter_by(
        id=session_id, user_id=current_user_id
    ).first()
    if not session:
        return _error("Live session not found", 404)

    segments = (
        LiveTranscriptSegment.query
        .filter_by(session_id=session_id)
        .order_by(LiveTranscriptSegment.created_at.asc())
        .all()
    )

    key_points = []
    decisions = []
    action_items = []
    for seg in segments:
        insights = seg.ai_insights or {}
        key_points.extend(insights.get("key_points", []))
        decisions.extend(insights.get("decisions", []))
        action_items.extend(insights.get("action_items", []))

    return jsonify({
        "success": True,
        "session": session.to_dict(),
        "insights": {
            "key_points": key_points,
            "decisions": decisions,
            "action_items": action_items,
        },
        "segment_count": len(segments),
    }), 200
