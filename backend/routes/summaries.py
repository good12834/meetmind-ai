"""
Summaries Blueprint

  POST   /api/meetings/<id>/summarize       generate/regenerate AI notes
  GET    /api/meetings/<id>/summary         latest summary + action items
  DELETE /api/summaries/<id>                delete a summary
  PATCH  /api/action-items/<id>             update task status/details
  GET    /api/ollama/health                 Ollama + model status
  GET    /api/ollama/models                 installed model names
"""

import difflib
import re
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from config import Config
from extensions import db
from models.action_item import ACTION_ITEM_STATUSES, ActionItem
from models.meeting import Meeting
from models.summary import MeetingSummary
from models.transcript import Transcript
from services.ollama_service import (
    OllamaResponseError,
    OllamaUnavailableError,
    check_ollama_health,
    generate_summary,
    generate_followup_email,
)

summaries_bp = Blueprint("summaries", __name__)

# A "generating" summary older than this was interrupted (server restart/crash).
_STALE_GENERATING_AFTER = timedelta(minutes=5)


# ---------------------------------------------------------------------------
# Ollama status
# ---------------------------------------------------------------------------

@summaries_bp.route("/ollama/health", methods=["GET"])
@jwt_required()
def ollama_health():
    """Report whether Ollama is reachable and which models are installed."""
    return jsonify({"success": True, **check_ollama_health()}), 200


@summaries_bp.route("/ollama/models", methods=["GET"])
@jwt_required()
def ollama_models():
    health = check_ollama_health()
    if not health["running"]:
        return jsonify({
            "success": False,
            "running": False,
            "models": [],
            "message": health["error"],
        }), 200

    return jsonify({
        "success": True,
        "running": True,
        "default_model": health["default_model"],
        "models": [m["name"] for m in health["models"] if not m["is_cloud"]],
    }), 200


# ---------------------------------------------------------------------------
# Generate (or regenerate) a summary
# ---------------------------------------------------------------------------

@summaries_bp.route("/meetings/<int:meeting_id>/summarize", methods=["POST"])
@jwt_required()
def summarize_meeting(meeting_id):
    current_user_id = int(get_jwt_identity())

    meeting = Meeting.query.filter_by(id=meeting_id, user_id=current_user_id).first()
    if not meeting:
        return _error("Meeting not found", 404)

    transcript = (
        Transcript.query
        .filter_by(meeting_id=meeting_id, user_id=current_user_id)
        .order_by(Transcript.created_at.desc())
        .first()
    )
    if not transcript:
        return _error(
            "No transcript found. Transcribe the meeting audio before generating a summary.",
            400,
        )
    if not transcript.full_text or not transcript.full_text.strip():
        return _error("The transcript is empty, so there is nothing to summarise.", 400)

    body = request.get_json(silent=True) or {}
    requested_model = (body.get("model") or "").strip() or None
    template = (body.get("template") or "").strip() or None

    summary = (
        MeetingSummary.query
        .filter_by(meeting_id=meeting_id, user_id=current_user_id)
        .order_by(MeetingSummary.created_at.desc())
        .first()
    )
    if summary is None:
        summary = MeetingSummary(
            meeting_id=meeting_id,
            transcript_id=transcript.id,
            user_id=current_user_id,
            model_used=requested_model or Config.OLLAMA_MODEL,
        )
        db.session.add(summary)

    # Keep each task's completion state when the same task is extracted again.
    preserved_status = {
        _normalise_task(item.task): item.status
        for item in summary.action_items
        if item.status in ("in_progress", "completed")
    }
    previous_tasks = list(summary.action_items)

    summary.transcript_id = transcript.id
    summary.model_used = requested_model or summary.model_used or Config.OLLAMA_MODEL
    summary.status = "generating"
    summary.error_message = None
    db.session.commit()

    try:
        result = generate_summary(
            transcript.full_text,
            model=requested_model,
            meeting_title=meeting.title,
            meeting_date=(
                meeting.meeting_date.strftime("%Y-%m-%d %H:%M")
                if meeting.meeting_date else None
            ),
            template=template,
        )
    except (OllamaUnavailableError, OllamaResponseError, ValueError) as exc:
        summary.status = "failed"
        summary.error_message = str(exc)
        db.session.commit()
        status_code = 503 if isinstance(exc, OllamaUnavailableError) else 502
        return jsonify({
            "success": False,
            "message": str(exc),
            "summary": summary.to_dict(),
        }), status_code

    try:
        summary.summary_text = result["summary_text"]
        summary.key_points = result["key_points"]
        summary.decisions = result["decisions"]
        summary.problems_identified = result.get("problems_identified", [])
        summary.important_questions = result.get("important_questions", [])
        summary.template = template
        summary.model_used = result.get("model_used") or summary.model_used
        summary.status = "completed"
        summary.error_message = None

        # Replace the extracted task list with the fresh result.
        summary.action_items = []
        db.session.flush()

        for position, item in enumerate(result["action_items"]):
            summary.action_items.append(ActionItem(
                summary_id=summary.id,
                meeting_id=meeting_id,
                user_id=current_user_id,
                task=item["task"],
                assignee=item["assignee"],
                due_date=item["due_date"],
                priority=item.get("priority", "medium"),
                status=_preserved_status(item["task"], preserved_status, previous_tasks),
                position=position,
            ))

        db.session.commit()
    except Exception as exc:  # pragma: no cover - defensive
        db.session.rollback()
        summary = MeetingSummary.query.get(summary.id)
        if summary:
            summary.status = "failed"
            summary.error_message = f"Could not save the summary: {exc}"
            db.session.commit()
        return _error(f"Could not save the summary: {exc}", 500)

    return jsonify({
        "success": True,
        "message": "AI summary generated successfully.",
        "summary": summary.to_dict(),
    }), 200


# ---------------------------------------------------------------------------
# Read / delete summaries
# ---------------------------------------------------------------------------

@summaries_bp.route("/meetings/<int:meeting_id>/summary", methods=["GET"])
@jwt_required()
def get_summary(meeting_id):
    current_user_id = int(get_jwt_identity())

    meeting = Meeting.query.filter_by(id=meeting_id, user_id=current_user_id).first()
    if not meeting:
        return _error("Meeting not found", 404)

    summary = (
        MeetingSummary.query
        .filter_by(meeting_id=meeting_id, user_id=current_user_id)
        .order_by(MeetingSummary.created_at.desc())
        .first()
    )

    if summary is None:
        return jsonify({"success": True, "summary": None}), 200

    # Recover from a generation that never finished (server restart, crash).
    if summary.status == "generating":
        updated = summary.updated_at or summary.created_at
        if updated and datetime.utcnow() - updated > _STALE_GENERATING_AFTER:
            summary.status = "failed"
            summary.error_message = "Summary generation was interrupted. Please try again."
            db.session.commit()

    return jsonify({"success": True, "summary": summary.to_dict()}), 200


@summaries_bp.route("/summaries/<int:summary_id>", methods=["DELETE"])
@jwt_required()
def delete_summary(summary_id):
    current_user_id = int(get_jwt_identity())

    summary = MeetingSummary.query.filter_by(
        id=summary_id, user_id=current_user_id
    ).first()
    if not summary:
        return _error("Summary not found", 404)

    try:
        db.session.delete(summary)
        db.session.commit()
        return jsonify({"success": True, "message": "Summary deleted successfully."}), 200
    except Exception as exc:
        db.session.rollback()
        return _error(str(exc), 500)


# ---------------------------------------------------------------------------
# Follow-up Email & Meeting Export
# ---------------------------------------------------------------------------

@summaries_bp.route("/meetings/<int:meeting_id>/follow-up-email", methods=["POST"])
@jwt_required()
def meeting_follow_up_email(meeting_id):
    current_user_id = int(get_jwt_identity())
    meeting = Meeting.query.filter_by(id=meeting_id, user_id=current_user_id).first()
    if not meeting:
        return _error("Meeting not found", 404)

    summary = (
        MeetingSummary.query
        .filter_by(meeting_id=meeting_id, user_id=current_user_id)
        .order_by(MeetingSummary.created_at.desc())
        .first()
    )
    if not summary:
        return _error("Generate meeting notes first before creating a follow-up email.", 400)

    body = request.get_json(silent=True) or {}
    model = (body.get("model") or "").strip() or None

    action_items_data = [item.to_dict() for item in summary.action_items]
    email_text = generate_followup_email(
        meeting_title=meeting.title,
        summary_text=summary.summary_text or "",
        key_points=summary.key_points or [],
        decisions=summary.decisions or [],
        action_items=action_items_data,
        problems_identified=getattr(summary, "problems_identified", None) or [],
        model=model,
    )

    subject = f"Follow-up & Action Items: {meeting.title}"
    return jsonify({
        "success": True,
        "subject": subject,
        "email_body": email_text,
    }), 200


@summaries_bp.route("/meetings/<int:meeting_id>/export", methods=["GET"])
@jwt_required()
def export_meeting_notes(meeting_id):
    current_user_id = int(get_jwt_identity())
    meeting = Meeting.query.filter_by(id=meeting_id, user_id=current_user_id).first()
    if not meeting:
        return _error("Meeting not found", 404)

    summary = (
        MeetingSummary.query
        .filter_by(meeting_id=meeting_id, user_id=current_user_id)
        .order_by(MeetingSummary.created_at.desc())
        .first()
    )
    transcript = (
        Transcript.query
        .filter_by(meeting_id=meeting_id, user_id=current_user_id)
        .order_by(Transcript.created_at.desc())
        .first()
    )

    meeting_date_str = meeting.meeting_date.strftime("%Y-%m-%d %H:%M") if meeting.meeting_date else "No date specified"
    overview = summary.summary_text if summary and summary.summary_text else "No summary recorded."
    points = summary.key_points if summary and summary.key_points else []
    decisions = summary.decisions if summary and summary.decisions else []
    actions = [item.to_dict() for item in summary.action_items] if summary else []
    problems = getattr(summary, "problems_identified", None) or []
    questions = getattr(summary, "important_questions", None) or []

    # Markdown format
    md_lines = [
        f"# {meeting.title}",
        f"**Date:** {meeting_date_str} | **Status:** {meeting.status}",
        "",
        "## Executive Summary",
        overview,
        "",
        "## Key Discussion Points",
    ]
    if points:
        for p in points:
            md_lines.append(f"- {p}")
    else:
        md_lines.append("*None recorded.*")

    md_lines.append("")
    md_lines.append("## Decisions Made")
    if decisions:
        for d in decisions:
            md_lines.append(f"- ✓ {d}")
    else:
        md_lines.append("*No explicit decisions.*")

    if problems:
        md_lines.append("")
        md_lines.append("## Problems & Risks Identified")
        for prob in problems:
            md_lines.append(f"- ⚠️ {prob}")

    if questions:
        md_lines.append("")
        md_lines.append("## Open Questions")
        for q in questions:
            md_lines.append(f"- ❓ {q}")

    md_lines.append("")
    md_lines.append("## Action Items")
    if actions:
        for a in actions:
            status_box = "[x]" if a.get("status") == "completed" else "[ ]"
            md_lines.append(
                f"- {status_box} **{a.get('task')}** — Assignee: @{a.get('assignee', 'Unassigned')} | Due: {a.get('due_date', 'TBD')} | Priority: {a.get('priority', 'medium')}"
            )
    else:
        md_lines.append("*No action items assigned.*")

    if transcript and transcript.full_text:
        md_lines.append("")
        md_lines.append("## Full Transcript")
        md_lines.append(transcript.full_text)

    markdown_content = "\n".join(md_lines)

    return jsonify({
        "success": True,
        "meeting": {
            "id": meeting.id,
            "title": meeting.title,
            "date": meeting_date_str,
        },
        "markdown": markdown_content,
    }), 200


# ---------------------------------------------------------------------------
# Action item status
# ---------------------------------------------------------------------------

@summaries_bp.route("/action-items/<int:item_id>", methods=["PATCH"])
@jwt_required()
def update_action_item(item_id):
    current_user_id = int(get_jwt_identity())

    item = ActionItem.query.filter_by(id=item_id, user_id=current_user_id).first()
    if not item:
        return _error("Action item not found", 404)

    body = request.get_json(silent=True) or {}

    if "status" in body:
        status = str(body.get("status") or "").strip().lower()
        if status not in ACTION_ITEM_STATUSES:
            return _error(
                f"Invalid status. Use one of: {', '.join(ACTION_ITEM_STATUSES)}",
                400,
            )
        item.status = status

    if "task" in body:
        task = str(body.get("task") or "").strip()
        if not task:
            return _error("Task text cannot be empty", 400)
        item.task = task

    if "assignee" in body:
        item.assignee = str(body.get("assignee") or "").strip() or "Unassigned"

    if "due_date" in body:
        item.due_date = str(body.get("due_date") or "").strip() or "Not specified"

    try:
        db.session.commit()
        return jsonify({
            "success": True,
            "message": "Action item updated.",
            "action_item": item.to_dict(),
        }), 200
    except Exception as exc:
        db.session.rollback()
        return _error(f"Could not update action item: {exc}", 500)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _error(message, status_code):
    return jsonify({"success": False, "message": message}), status_code


def _normalise_task(text):
    return " ".join((text or "").lower().split())


def _preserved_status(task, preserved_status, previous_items):
    """
    Return the status a regenerated task should inherit. The model often
    rewords tasks slightly between runs, so fall back to a fuzzy match before
    resetting to "pending".
    """
    key = _normalise_task(task)
    if not key or not preserved_status:
        return "pending"

    if key in preserved_status:
        return preserved_status[key]

    best_ratio = 0.0
    best_status = None
    for item in previous_items:
        if item.status not in ("in_progress", "completed"):
            continue
        old_key = _normalise_task(item.task)
        if not old_key:
            continue

        # One task being a shortened version of the other is a strong match.
        if key in old_key or old_key in key:
            return item.status

        # Same words with little connective tissue ("the", "and", ...) added.
        new_tokens = _task_tokens(key)
        old_tokens = _task_tokens(old_key)
        if old_tokens and old_tokens.issubset(new_tokens):
            return item.status

        ratio = difflib.SequenceMatcher(None, key, old_key).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_status = item.status

    return best_status if best_ratio >= 0.6 else "pending"


def _task_tokens(text):
    return set(re.findall(r"[a-z0-9]+", text))
