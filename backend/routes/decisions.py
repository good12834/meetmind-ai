from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from extensions import db
from models.meeting import Meeting
from models.meeting_decision import MeetingDecision

decisions_bp = Blueprint("decisions", __name__)


def _get_meeting_for_user(meeting_id, user_id):
    return Meeting.query.filter_by(id=meeting_id, user_id=user_id).first()


@decisions_bp.route("/meetings/<int:meeting_id>/decisions", methods=["GET"])
@jwt_required()
def list_decisions(meeting_id):
    user_id = get_jwt_identity()

    meeting = _get_meeting_for_user(meeting_id, user_id)
    if not meeting:
        return jsonify({"success": False, "message": "Meeting not found"}), 404

    decisions = (
        MeetingDecision.query.filter_by(meeting_id=meeting_id, user_id=user_id)
        .order_by(MeetingDecision.detected_at.asc())
        .all()
    )
    return jsonify({"success": True, "data": [d.to_dict() for d in decisions]})


@decisions_bp.route("/meetings/<int:meeting_id>/decisions", methods=["POST"])
@jwt_required()
def create_decision(meeting_id):
    user_id = get_jwt_identity()

    meeting = _get_meeting_for_user(meeting_id, user_id)
    if not meeting:
        return jsonify({"success": False, "message": "Meeting not found"}), 404

    data = request.get_json(silent=True) or {}
    decision_text = (data.get("decision_text") or "").strip()
    if not decision_text:
        return jsonify({"success": False, "message": "decision_text is required"}), 400

    decision = MeetingDecision(
        meeting_id=meeting_id,
        user_id=user_id,
        decision_text=decision_text,
        context=data.get("context") or None,
    )
    db.session.add(decision)
    db.session.commit()
    return jsonify({"success": True, "data": decision.to_dict()}), 201


@decisions_bp.route("/decisions/<int:decision_id>", methods=["DELETE"])
@jwt_required()
def delete_decision(decision_id):
    user_id = get_jwt_identity()

    decision = MeetingDecision.query.filter_by(id=decision_id, user_id=user_id).first()
    if not decision:
        return jsonify({"success": False, "message": "Decision not found"}), 404

    db.session.delete(decision)
    db.session.commit()
    return jsonify({"success": True, "message": "Decision deleted"})
