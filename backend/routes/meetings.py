from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func

from extensions import db
from models.meeting import Meeting
from models.summary import MeetingSummary
from models.recording import Recording
from models.transcript import Transcript
from events.video_events import rooms
from utils.validation import (
    validate_meeting_title,
    validate_meeting_description,
    validate_meeting_date,
    validate_meeting_status,
)

meetings_bp = Blueprint("meetings", __name__)


def _error(message, status_code):
    return jsonify({"success": False, "message": message}), status_code


# 1. CREATE MEETING
@meetings_bp.route("", methods=["POST"])
@jwt_required()
def create_meeting():
    current_user_id = int(get_jwt_identity())
    data = request.get_json() or {}

    title, title_err = validate_meeting_title(data.get("title"))
    if title_err:
        return _error(title_err, 400)

    description, _ = validate_meeting_description(data.get("description"))

    status, status_err = validate_meeting_status(data.get("status", "scheduled"))
    if status_err:
        return _error(status_err, 400)

    raw_date = data.get("meeting_date")
    if not raw_date:
        meeting_date = datetime.utcnow()
    else:
        meeting_date, date_err = validate_meeting_date(raw_date)
        if date_err:
            if status in ("in-progress", "live", "transcribed", "completed") or "past" in str(date_err).lower():
                meeting_date = datetime.utcnow()
            else:
                return _error(date_err, 400)
        if meeting_date is None:
            meeting_date = datetime.utcnow()

    new_meeting = Meeting(
        user_id=current_user_id,
        title=title,
        description=description,
        meeting_date=meeting_date,
        status=status,
    )

    try:
        db.session.add(new_meeting)
        db.session.commit()
        return jsonify({
            "success": True,
            "message": "Meeting created successfully",
            "meeting": new_meeting.to_dict(),
        }), 201
    except Exception as e:
        db.session.rollback()
        return _error(f"Failed to create meeting: {str(e)}", 500)


# 2. GET ALL MEETINGS FOR USER
@meetings_bp.route("", methods=["GET"])
@jwt_required()
def get_meetings():
    try:
        current_user_id = int(get_jwt_identity())

        search_query = request.args.get("search", "").strip()
        status_filter = request.args.get("status", "").strip().lower()

        query = Meeting.query.filter_by(user_id=current_user_id)

        if status_filter and status_filter != "all":
            if status_filter not in ("scheduled", "in-progress", "completed", "cancelled"):
                return _error("Invalid status filter", 400)
            query = query.filter_by(status=status_filter)

        if search_query:
            search_pattern = f"%{search_query}%"
            query = query.filter(
                Meeting.title.ilike(search_pattern) |
                Meeting.description.ilike(search_pattern)
            )

        # Non-null dates first (descending), then NULLs, then created_at descending
        # MySQL puts NULLs last on DESC by default, so no NULLS LAST needed.
        meetings = query.order_by(
            Meeting.meeting_date.desc(),
            Meeting.created_at.desc()
        ).all()

        return jsonify({
            "success": True,
            "count": len(meetings),
            "meetings": [m.to_dict() for m in meetings],
        }), 200
    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return _error(f"Failed to fetch meetings: {str(e)}", 500)


# 2B. GET MEETING HISTORY WITH RELATED COUNTS
@meetings_bp.route("/history", methods=["GET"])
@jwt_required()
def meeting_history():
    """Return meeting history with related record counts for the logged-in user."""
    try:
        user_id = int(get_jwt_identity())

        search = request.args.get("search", "").strip()
        status = request.args.get("status", "").strip().lower()
        page = max(request.args.get("page", 1, type=int), 1)
        per_page = min(request.args.get("per_page", 10, type=int), 50)

        # Base query filtered by user
        query = Meeting.query.filter_by(user_id=user_id)

        # Apply search filter on title
        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                Meeting.title.ilike(search_pattern)
            )

        # Apply status filter
        if status:
            if status not in ("scheduled", "in-progress", "completed", "cancelled"):
                return _error("Invalid status filter", 400)
            query = query.filter(Meeting.status == status)

        # Get subqueries for counts per meeting
        summary_subquery = (
            db.session.query(
                MeetingSummary.meeting_id,
                func.count(MeetingSummary.id).label("summary_count")
            )
            .group_by(MeetingSummary.meeting_id)
            .subquery()
        )

        recording_subquery = (
            db.session.query(
                Recording.meeting_id,
                func.count(Recording.id).label("recording_count")
            )
            .group_by(Recording.meeting_id)
            .subquery()
        )

        transcript_subquery = (
            db.session.query(
                Transcript.meeting_id,
                func.count(Transcript.id).label("transcript_count")
            )
            .group_by(Transcript.meeting_id)
            .subquery()
        )

        # Build the main query with count subqueries for efficiency
        meetings_query = query.order_by(
            Meeting.meeting_date.desc()
        ).paginate(page=page, per_page=per_page, error_out=False)

        paginated_meetings = []
        for meeting in meetings_query.items:
            # Get related counts from subqueries
            summary_count = 0
            recording_count = 0
            transcript_count = 0

            summary_result = db.session.query(summary_subquery.c.summary_count).filter(
                summary_subquery.c.meeting_id == meeting.id
            ).first()
            if summary_result:
                summary_count = summary_result[0]

            recording_result = db.session.query(recording_subquery.c.recording_count).filter(
                recording_subquery.c.meeting_id == meeting.id
            ).first()
            if recording_result:
                recording_count = recording_result[0]

            transcript_result = db.session.query(transcript_subquery.c.transcript_count).filter(
                transcript_subquery.c.meeting_id == meeting.id
            ).first()
            if transcript_result:
                transcript_count = transcript_result[0]

            meeting_dict = meeting.to_dict()
            meeting_dict["recordings_count"] = recording_count
            meeting_dict["transcripts_count"] = transcript_count
            meeting_dict["has_summary"] = summary_count > 0
            paginated_meetings.append(meeting_dict)

        return jsonify({
            "success": True,
            "meetings": paginated_meetings,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": meetings_query.total,
                "pages": meetings_query.pages,
            },
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return _error(f"Failed to fetch meeting history: {str(e)}", 500)


# 3. GET SINGLE MEETING
@meetings_bp.route("/<int:meeting_id>", methods=["GET"])
@jwt_required()
def get_meeting(meeting_id):
    try:
        current_user_id = int(get_jwt_identity())

        meeting = Meeting.query.filter_by(id=meeting_id, user_id=current_user_id).first()
        if not meeting:
            return _error("Meeting not found", 404)

        return jsonify({
            "success": True,
            "meeting": meeting.to_dict(),
        }), 200
    except Exception as e:
        db.session.rollback()
        return _error(f"Failed to retrieve meeting: {str(e)}", 500)


# 4. UPDATE MEETING
@meetings_bp.route("/<int:meeting_id>", methods=["PUT"])
@jwt_required()
def update_meeting(meeting_id):
    current_user_id = int(get_jwt_identity())

    meeting = Meeting.query.filter_by(id=meeting_id, user_id=current_user_id).first()
    if not meeting:
        return _error("Meeting not found", 404)

    data = request.get_json() or {}

    if "title" in data:
        title, title_err = validate_meeting_title(data.get("title"))
        if title_err:
            return _error(title_err, 400)
        meeting.title = title

    if "description" in data:
        meeting.description, _ = validate_meeting_description(data.get("description"))

    if "meeting_date" in data:
        meeting_date, date_err = validate_meeting_date(data.get("meeting_date"))
        if date_err:
            return _error(date_err, 400)
        meeting.meeting_date = meeting_date

    if "status" in data:
        status, status_err = validate_meeting_status(data.get("status"))
        if status_err:
            return _error(status_err, 400)
        meeting.status = status

    try:
        db.session.commit()
        return jsonify({
            "success": True,
            "message": "Meeting updated successfully",
            "meeting": meeting.to_dict(),
        }), 200
    except Exception as e:
        db.session.rollback()
        return _error(f"Failed to update meeting: {str(e)}", 500)


# 5. DELETE MEETING
@meetings_bp.route("/<int:meeting_id>", methods=["DELETE"])
@jwt_required()
def delete_meeting(meeting_id):
    current_user_id = int(get_jwt_identity())

    meeting = Meeting.query.filter_by(id=meeting_id, user_id=current_user_id).first()
    if not meeting:
        return _error("Meeting not found", 404)

    try:
        db.session.delete(meeting)
        db.session.commit()
        return jsonify({
            "success": True,
            "message": "Meeting deleted successfully",
        }), 200
    except Exception as e:
        db.session.rollback()
        return _error(f"Failed to delete meeting: {str(e)}", 500)


# 6. VIDEO STATUS
@meetings_bp.route("/<int:meeting_id>/video-status", methods=["GET"])
@jwt_required()
def video_status(meeting_id):
    count = len(rooms.get(f"video_{meeting_id}", {}))
    return jsonify({"success": True, "active": count > 0, "count": count})

