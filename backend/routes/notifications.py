from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from extensions import db
from models.notification import Notification

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.route("/notifications", methods=["GET"])
@jwt_required()
def list_notifications():
    user_id = int(get_jwt_identity())
    only_unread = request.args.get("unread") == "true"
    query = Notification.query.filter_by(user_id=user_id)
    if only_unread:
        query = query.filter_by(is_read=False)
    notifications = query.order_by(Notification.created_at.desc()).limit(50).all()
    return jsonify({
        "success": True,
        "data": [n.to_dict() for n in notifications],
        "unread_count": Notification.query.filter_by(user_id=user_id, is_read=False).count(),
    })


@notifications_bp.route("/notifications/<int:notification_id>/read", methods=["PATCH"])
@jwt_required()
def mark_read(notification_id):
    user_id = int(get_jwt_identity())
    notification = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
    if not notification:
        return jsonify({"success": False, "message": "Notification not found"}), 404
    notification.is_read = True
    db.session.commit()
    return jsonify({"success": True, "data": notification.to_dict()})


@notifications_bp.route("/notifications/read-all", methods=["POST"])
@jwt_required()
def mark_all_read():
    user_id = int(get_jwt_identity())
    Notification.query.filter_by(user_id=user_id, is_read=False).update({Notification.is_read: True})
    db.session.commit()
    return jsonify({"success": True, "message": "All notifications marked as read"})
