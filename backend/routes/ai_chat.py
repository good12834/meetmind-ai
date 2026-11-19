from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from models.meeting import Meeting
from models.transcript import Transcript
from services.ollama_service import answer_question, resolve_model, OllamaError

ai_chat_bp = Blueprint("ai_chat", __name__)

_MAX_TRANSCRIPT_CHARS = 800
_MAX_CONTEXT_CHARS = 6000


@ai_chat_bp.route("/ai/chat", methods=["POST"])
@jwt_required()
def ai_chat():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}

    question = (data.get("question") or "").strip()
    if not question:
        return jsonify({"success": False, "message": "question is required"}), 400

    meeting_ids = data.get("meeting_ids") or []
    model = data.get("model") or None

    # Fetch meetings
    if meeting_ids:
        meetings = Meeting.query.filter(
            Meeting.id.in_(meeting_ids),
            Meeting.user_id == user_id,
        ).all()
    else:
        meetings = (
            Meeting.query.filter_by(user_id=user_id)
            .order_by(Meeting.created_at.desc())
            .limit(10)
            .all()
        )

    if not meetings:
        return jsonify({
            "success": True,
            "answer": "I don't have enough information in the provided transcripts to answer that.",
            "sources": [],
            "model_used": model or "unknown",
        })

    # Build context
    context_parts = []
    sources = []
    total_chars = 0

    for meeting in meetings:
        transcript = (
            Transcript.query.filter_by(meeting_id=meeting.id, user_id=user_id)
            .order_by(Transcript.created_at.desc())
            .first()
        )
        if not transcript or not transcript.full_text:
            continue

        text = transcript.full_text[:_MAX_TRANSCRIPT_CHARS]
        if len(transcript.full_text) > _MAX_TRANSCRIPT_CHARS:
            text += "..."

        date_str = meeting.meeting_date.strftime("%Y-%m-%d") if meeting.meeting_date else "Unknown date"

        part = f"[Meeting: {meeting.title} | Date: {date_str}]\n{text}"
        part_len = len(part)

        if total_chars + part_len > _MAX_CONTEXT_CHARS:
            break

        context_parts.append(part)
        sources.append({
            "meeting_id": meeting.id,
            "title": meeting.title,
            "date": date_str,
        })
        total_chars += part_len

    if not context_parts:
        return jsonify({
            "success": True,
            "answer": "No transcripts are available for the selected meetings. Please transcribe your recordings first.",
            "sources": [],
            "model_used": model or "unknown",
        })

    context = "MEETING TRANSCRIPTS:\n---\n" + "\n---\n".join(context_parts) + "\n---"

    try:
        selected_model = resolve_model(model)
        answer = answer_question(question, context, selected_model)
    except OllamaError as exc:
        return jsonify({"success": False, "message": str(exc)}), 503

    return jsonify({
        "success": True,
        "answer": answer,
        "sources": sources,
        "model_used": selected_model,
    })
