from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from extensions import db
from models.team import Team, TeamMember
from models.user import User

teams_bp = Blueprint("teams", __name__)


def _get_team_for_user(team_id, user_id):
    return (
        db.session.query(Team)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(Team.id == team_id, TeamMember.user_id == user_id)
        .first()
    )


@teams_bp.route("/teams", methods=["GET"])
@jwt_required()
def list_teams():
    user_id = int(get_jwt_identity())
    teams = (
        db.session.query(Team)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(TeamMember.user_id == user_id)
        .all()
    )
    return jsonify({
        "success": True,
        "data": [t.to_dict(include_members=True) for t in teams],
    })


@teams_bp.route("/teams", methods=["POST"])
@jwt_required()
def create_team():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"success": False, "message": "Team name is required"}), 400
    description = data.get("description") or None

    team = Team(name=name, description=description, owner_id=user_id)
    db.session.add(team)
    db.session.flush()

    membership = TeamMember(team_id=team.id, user_id=user_id, role="owner")
    db.session.add(membership)
    db.session.commit()
    return jsonify({"success": True, "data": team.to_dict(include_members=True)}), 201


@teams_bp.route("/teams/<int:team_id>", methods=["GET"])
@jwt_required()
def get_team(team_id):
    user_id = int(get_jwt_identity())
    team = _get_team_for_user(team_id, user_id)
    if not team:
        return jsonify({"success": False, "message": "Team not found"}), 404
    return jsonify({"success": True, "data": team.to_dict(include_members=True)})


@teams_bp.route("/teams/<int:team_id>/invite", methods=["POST"])
@jwt_required()
def invite_member(team_id):
    user_id = int(get_jwt_identity())
    team = _get_team_for_user(team_id, user_id)
    if not team:
        return jsonify({"success": False, "message": "Team not found"}), 404

    # Only owner or admin can invite
    membership = (
        TeamMember.query.filter_by(team_id=team_id, user_id=user_id).first()
    )
    if not membership or membership.role not in ("owner", "admin"):
        return jsonify({"success": False, "message": "Not authorized to invite members"}), 403

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    role = data.get("role") or "member"
    if not email:
        return jsonify({"success": False, "message": "Email is required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    existing = TeamMember.query.filter_by(team_id=team_id, user_id=user.id).first()
    if existing:
        return jsonify({"success": False, "message": "User is already a member"}), 400

    new_member = TeamMember(team_id=team_id, user_id=user.id, role=role)
    db.session.add(new_member)
    db.session.commit()
    return jsonify({"success": True, "data": new_member.to_dict()}), 201


@teams_bp.route("/team-members/<int:member_id>", methods=["DELETE"])
@jwt_required()
def remove_member(member_id):
    user_id = int(get_jwt_identity())
    member = TeamMember.query.get(member_id)
    if not member:
        return jsonify({"success": False, "message": "Member not found"}), 404

    # Only owner can remove, and cannot remove themselves as owner
    caller = (
        TeamMember.query.filter_by(team_id=member.team_id, user_id=user_id).first()
    )
    if not caller or caller.role != "owner":
        return jsonify({"success": False, "message": "Only the team owner can remove members"}), 403
    if member.user_id == user_id and member.role == "owner":
        return jsonify({"success": False, "message": "Owner cannot remove themselves"}), 400

    db.session.delete(member)
    db.session.commit()
    return jsonify({"success": True, "message": "Member removed"})
