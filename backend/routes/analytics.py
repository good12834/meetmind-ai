from datetime import datetime, timedelta

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import distinct, func

from extensions import db
from models.action_item import ActionItem
from models.meeting import Meeting
from models.meeting_decision import MeetingDecision
from models.recording import Recording
from models.summary import MeetingSummary
from models.transcript import Transcript

analytics_bp = Blueprint("analytics", __name__)


@analytics_bp.route("/analytics/overview", methods=["GET"])
@jwt_required()
def analytics_overview():
    user_id = get_jwt_identity()

    # Meeting counts
    total_meetings = Meeting.query.filter_by(user_id=user_id).count()
    completed_meetings = Meeting.query.filter_by(
        user_id=user_id, status="completed"
    ).count()

    # Total recording hours
    duration_sum = (
        db.session.query(func.sum(Recording.duration))
        .select_from(Recording)
        .join(Meeting, Recording.meeting_id == Meeting.id)
        .filter(Meeting.user_id == user_id)
        .scalar()
    ) or 0.0
    total_hours = round(duration_sum / 3600, 2)

    # Action item counts
    action_items_total = ActionItem.query.filter_by(user_id=user_id).count()
    action_items_completed = ActionItem.query.filter_by(
        user_id=user_id, status="completed"
    ).count()
    action_items_pending = ActionItem.query.filter_by(
        user_id=user_id, status="pending"
    ).count()

    # Decisions count
    decisions_made = MeetingDecision.query.filter_by(user_id=user_id).count()

    # Meetings created this week
    week_ago = datetime.utcnow() - timedelta(days=7)
    meetings_this_week = Meeting.query.filter(
        Meeting.user_id == user_id,
        Meeting.created_at >= week_ago,
    ).count()

    # Meetings with a transcript and/or a summary (for the productivity score)
    meetings_with_transcript = db.session.query(
        func.count(distinct(Meeting.id))
    ).select_from(Meeting).join(
        Transcript, Meeting.id == Transcript.meeting_id
    ).filter(
        Meeting.user_id == user_id
    ).scalar() or 0

    meetings_with_summary = db.session.query(
        func.count(distinct(Meeting.id))
    ).select_from(Meeting).join(
        MeetingSummary, Meeting.id == MeetingSummary.meeting_id
    ).filter(
        Meeting.user_id == user_id
    ).scalar() or 0

    # Recent meetings (last 5), newest first
    recent = (
        Meeting.query.filter_by(user_id=user_id)
        .order_by(Meeting.created_at.desc())
        .limit(5)
        .all()
    )
    recent_meetings = [
        {
            "id": m.id,
            "title": m.title,
            "date": m.meeting_date.isoformat() if m.meeting_date else None,
            "status": m.status,
        }
        for m in recent
    ]

    # Upcoming meetings (next scheduled meetings)
    upcoming = (
        Meeting.query.filter(
            Meeting.user_id == user_id,
            Meeting.status == "scheduled",
            Meeting.meeting_date >= datetime.utcnow(),
        )
        .order_by(Meeting.meeting_date.asc())
        .limit(3)
        .all()
    )
    upcoming_meetings = [
        {
            "id": m.id,
            "title": m.title,
            "date": m.meeting_date.isoformat() if m.meeting_date else None,
            "status": m.status,
        }
        for m in upcoming
    ]

    # ---- AI productivity score (0-100) ----
    # Weighted blend of: how well transcripts become summaries,
    # how many action items are completed, and weekly consistency.
    summary_rate = (
        meetings_with_summary / meetings_with_transcript
        if meetings_with_transcript
        else 0
    )
    task_completion_rate = (
        action_items_completed / action_items_total if action_items_total else 0
    )
    consistency = min(meetings_this_week / 5.0, 1.0)
    productivity_score = round(
        100 * (0.4 * summary_rate + 0.4 * task_completion_rate + 0.2 * consistency)
    )

    return jsonify(
        {
            "success": True,
            "data": {
                "total_meetings": total_meetings,
                "completed_meetings": completed_meetings,
                "total_hours": total_hours,
                "tasks_total": action_items_total,
                "tasks_completed": action_items_completed,
                "tasks_pending": action_items_pending,
                "decisions_made": decisions_made,
                "meetings_this_week": meetings_this_week,
                "summary_rate": round(summary_rate * 100, 1),
                "task_completion_rate": round(task_completion_rate * 100, 1),
                "meetings_with_transcript": meetings_with_transcript,
                "meetings_with_summary": meetings_with_summary,
                "upcoming_meetings": upcoming_meetings,
                "recent_meetings": recent_meetings,
                "productivity_score": productivity_score,
            },
        }
    )
