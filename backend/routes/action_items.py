from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from extensions import db
from models.action_item import ActionItem
from models.meeting import Meeting

action_items_bp = Blueprint("action_items", __name__)


def _get_meeting_for_user(meeting_id, user_id):
    """Return Meeting or None if not found / not owned by user."""
    return Meeting.query.filter_by(id=meeting_id, user_id=user_id).first()


@action_items_bp.route("/action-items", methods=["GET"])
@jwt_required()
def list_action_items():
    user_id = get_jwt_identity()

    query = ActionItem.query.filter_by(user_id=user_id)

    meeting_id = request.args.get("meeting_id", type=int)
    if meeting_id:
        query = query.filter_by(meeting_id=meeting_id)

    status = request.args.get("status")
    if status:
        query = query.filter_by(status=status)

    items = query.order_by(ActionItem.position.asc(), ActionItem.created_at.desc()).all()
    return jsonify({"success": True, "data": [i.to_dict() for i in items]})


@action_items_bp.route("/meetings/<int:meeting_id>/action-items", methods=["GET"])
@jwt_required()
def list_meeting_action_items(meeting_id):
    user_id = get_jwt_identity()

    meeting = _get_meeting_for_user(meeting_id, user_id)
    if not meeting:
        return jsonify({"success": False, "message": "Meeting not found"}), 404

    items = (
        ActionItem.query.filter_by(meeting_id=meeting_id, user_id=user_id)
        .order_by(ActionItem.position.asc(), ActionItem.created_at.desc())
        .all()
    )
    return jsonify({"success": True, "data": [i.to_dict() for i in items]})


@action_items_bp.route("/meetings/<int:meeting_id>/action-items", methods=["POST"])
@jwt_required()
def create_action_item(meeting_id):
    user_id = get_jwt_identity()

    meeting = _get_meeting_for_user(meeting_id, user_id)
    if not meeting:
        return jsonify({"success": False, "message": "Meeting not found"}), 404

    data = request.get_json(silent=True) or {}
    task = (data.get("task") or "").strip()
    if not task:
        return jsonify({"success": False, "message": "task is required"}), 400

    # Determine position
    last = (
        ActionItem.query.filter_by(meeting_id=meeting_id)
        .order_by(ActionItem.position.desc())
        .first()
    )
    position = (last.position + 1) if last else 0

    item = ActionItem(
        summary_id=None,
        meeting_id=meeting_id,
        user_id=user_id,
        task=task,
        assignee=data.get("assignee") or "Unassigned",
        due_date=data.get("due_date") or "Not specified",
        status=data.get("status") or "pending",
        priority=data.get("priority") or "medium",
        position=position,
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({"success": True, "data": item.to_dict()}), 201


@action_items_bp.route("/action-items/<int:item_id>", methods=["PATCH"])
@jwt_required()
def update_action_item(item_id):
    user_id = get_jwt_identity()

    item = ActionItem.query.filter_by(id=item_id, user_id=user_id).first()
    if not item:
        return jsonify({"success": False, "message": "Action item not found"}), 404

    data = request.get_json(silent=True) or {}

    if "task" in data and data["task"]:
        item.task = data["task"].strip()
    if "status" in data and data["status"]:
        item.status = data["status"]
    if "assignee" in data:
        item.assignee = data["assignee"] or "Unassigned"
    if "due_date" in data:
        item.due_date = data["due_date"] or "Not specified"
    if "priority" in data:
        item.priority = data["priority"] or "medium"

    db.session.commit()
    return jsonify({"success": True, "data": item.to_dict()})


@action_items_bp.route("/action-items/<int:item_id>", methods=["DELETE"])
@jwt_required()
def delete_action_item(item_id):
    user_id = get_jwt_identity()

    item = ActionItem.query.filter_by(id=item_id, user_id=user_id).first()
    if not item:
        return jsonify({"success": False, "message": "Action item not found"}), 404

    db.session.delete(item)
    db.session.commit()
    return jsonify({"success": True, "message": "Action item deleted"})
