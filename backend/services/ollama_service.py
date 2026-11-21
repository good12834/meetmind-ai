"""
Ollama AI service — talks to a locally running Ollama server
(default: http://localhost:11434) and turns a meeting transcript into
structured meeting notes.

Expected Ollama setup:
  1. Install   : https://ollama.com
  2. Start     : ollama serve   (or launch the desktop app)
  3. Pull model: ollama pull llama3.2:3b
"""

import json
import logging
import re
from typing import Optional

import requests

from config import Config

logger = logging.getLogger(__name__)

# Models that run on Ollama's cloud require an account/sign-in, so they are
# never picked automatically — only when explicitly requested.
_CLOUD_SUFFIX = ":cloud"


class OllamaError(RuntimeError):
    """Base class for AI-generation failures (reported to the client)."""


class OllamaUnavailableError(OllamaError):
    """Ollama is not running, timed out, or returned an API error."""


class OllamaResponseError(OllamaError):
    """Ollama responded, but the output could not be used."""


# JSON schema handed to Ollama's structured-output mode. Constraining decoding
# is far more reliable than asking a small model to "return only JSON".
SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "summary_text": {"type": "string"},
        "key_points": {"type": "array", "items": {"type": "string"}},
        "decisions": {"type": "array", "items": {"type": "string"}},
        "problems_identified": {"type": "array", "items": {"type": "string"}},
        "important_questions": {"type": "array", "items": {"type": "string"}},
        "action_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "task": {"type": "string"},
                    "assignee": {"type": "string"},
                    "due_date": {"type": "string"},
                    "priority": {"type": "string"},
                },
                "required": ["task", "assignee", "due_date", "priority"],
            },
        },
    },
    "required": ["summary_text", "key_points", "decisions", "problems_identified", "important_questions", "action_items"],
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def check_ollama_health() -> dict:
    """
    Probe the Ollama server.

    Returns:
        {
          "running": bool,
          "models": [ {name, size, parameter_size, family, is_cloud}, ... ],
          "default_model": str,       # configured model if installed, else fallback
          "error": str | None,
        }
    """
    models, error = _fetch_models()
    if error:
        return {
            "running": False,
            "models": [],
            "default_model": Config.OLLAMA_MODEL,
            "error": error,
        }

    default_model = Config.OLLAMA_MODEL
    local_names = [m["name"] for m in models if not m["is_cloud"]]
    if local_names and default_model not in local_names:
        default_model = local_names[0]

    error = None
    if not local_names:
        error = (
            "Ollama is running but no local models are installed. "
            f"Run: ollama pull {Config.OLLAMA_MODEL}"
        )

    return {
        "running": True,
        "models": models,
        "default_model": default_model,
        "error": error,
    }


def list_local_models() -> list:
    """Return installed non-cloud model names (empty list if Ollama is down)."""
    models, error = _fetch_models()
    if error:
        raise OllamaUnavailableError(error)
    return [m["name"] for m in models if not m["is_cloud"]]


def resolve_model(requested: Optional[str] = None) -> str:
    """
    Pick the model to use: the requested one when installed, otherwise the
    configured model, otherwise the first installed local model.
    """
    requested = (requested or "").strip()
    models, error = _fetch_models()
    if error:
        raise OllamaUnavailableError(error)

    installed = [m["name"] for m in models]
    local_installed = [m["name"] for m in models if not m["is_cloud"]]

    if requested and requested in installed:
        return requested

    if Config.OLLAMA_MODEL in installed:
        return Config.OLLAMA_MODEL

    if local_installed:
        logger.warning(
            "Requested model '%s' and configured model '%s' are not installed; "
            "falling back to '%s'.",
            requested or "-", Config.OLLAMA_MODEL, local_installed[0],
        )
        return local_installed[0]

    raise OllamaUnavailableError(
        "No local model is installed in Ollama. "
        f"Run: ollama pull {Config.OLLAMA_MODEL}"
    )



def answer_question(question: str, context: str, model: Optional[str] = None) -> str:
    """
    Call Ollama in free-text mode (no JSON schema) to answer a user question
    based on meeting transcript context.
    """
    selected_model = resolve_model(model)
    prompt = f"""You are MeetMind AI, an expert meeting analyst assistant.
Answer the user's question based ONLY on the provided meeting transcripts.
If the answer is not in the transcripts, say "I don't have enough information in the provided transcripts to answer that."
Be concise and factual.

{context}

USER QUESTION: {question}
"""
    payload = {
        "model": selected_model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.2, "num_predict": 800},
    }
    # No "format" key — free text response
    logger.info("answer_question: model=%s question_chars=%s", selected_model, len(question))
    try:
        resp = requests.post(
            f"{Config.OLLAMA_BASE_URL}/api/generate",
            json=payload,
            timeout=(10, Config.OLLAMA_TIMEOUT),
        )
    except requests.exceptions.ConnectionError:
        raise OllamaUnavailableError(
            "Cannot connect to Ollama. Make sure it is running: 'ollama serve'."
        )
    except requests.exceptions.Timeout:
        raise OllamaUnavailableError(
            "Ollama took too long to answer. Try a smaller model or shorter question."
        )

    if resp.status_code != 200:
        raise OllamaUnavailableError(f"Ollama API error {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    return (data.get("response") or "").strip()


def generate_followup_email(
    meeting_title: str,
    summary_text: str,
    key_points: list,
    decisions: list,
    action_items: list,
    problems_identified: Optional[list] = None,
    model: Optional[str] = None,
) -> str:
    """
    Generate a professional post-meeting follow-up email.
    """
    try:
        selected_model = resolve_model(model)
        decisions_str = "\n".join(f"- {d}" for d in decisions) if decisions else "None recorded."
        actions_str = "\n".join(
            f"- {item.get('task', '')} (Assignee: {item.get('assignee', 'Unassigned')}, Due: {item.get('due_date', 'TBD')})"
            for item in action_items
        ) if action_items else "None assigned."
        points_str = "\n".join(f"- {p}" for p in key_points) if key_points else "None."

        prompt = f"""You are an executive assistant. Write a professional, concise post-meeting follow-up email for the meeting "{meeting_title}".

MEETING DETAILS:
Summary: {summary_text}
Key Points:
{points_str}

Decisions Made:
{decisions_str}

Action Items:
{actions_str}

INSTRUCTIONS:
- Include a clear, friendly greeting.
- Provide a 2-sentence executive recap.
- Bullet out Key Decisions and Next Steps / Action Items with owners and deadlines.
- End with an encouraging closing and offer to address any questions.
- Keep the tone polite, clear, and professional.
"""
        payload = {
            "model": selected_model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.3, "num_predict": 700},
        }
        resp = requests.post(
            f"{Config.OLLAMA_BASE_URL}/api/generate",
            json=payload,
            timeout=(10, Config.OLLAMA_TIMEOUT),
        )
        if resp.status_code == 200:
            text = (resp.json().get("response") or "").strip()
            if text:
                return text
    except Exception as exc:
        logger.warning("Could not call Ollama for follow-up email: %s; using template fallback", exc)

    # Fallback clean template if Ollama is down
    actions_bullets = "\n".join(
        f"  • {item.get('task')} — @{item.get('assignee', 'Unassigned')} (Due: {item.get('due_date', 'TBD')})"
        for item in action_items
    ) or "  • No action items recorded."

    decisions_bullets = "\n".join(f"  • {d}" for d in decisions) or "  • No explicit decisions."
    points_bullets = "\n".join(f"  • {p}" for p in key_points) or "  • General discussions."

    return f"""Hi team,

Thank you for your time during our meeting on "{meeting_title}". Here is a quick summary of what was discussed, key decisions made, and our agreed next steps:

📌 Executive Summary:
{summary_text or "Discussions were held regarding current project milestones and upcoming deliverables."}

💡 Key Discussion Highlights:
{points_bullets}

⚖️ Key Decisions:
{decisions_bullets}

✅ Action Items & Owners:
{actions_bullets}

Please review your respective tasks and reach out if anything needs clarification.

Best regards,
MeetMind AI Team"""


def generate_summary(
    transcript_text: str,
    model: Optional[str] = None,
    meeting_title: Optional[str] = None,
    meeting_date: Optional[str] = None,
    template: Optional[str] = None,
) -> dict:
    """
    Send the transcript to Ollama and return:
    {
        "summary_text":          str,
        "key_points":            list[str],
        "decisions":             list[str],
        "problems_identified":   list[str],
        "important_questions":   list[str],
        "action_items":          list[{"task", "assignee", "due_date", "priority"}],
        "model_used":            str,
    }
    Raises OllamaError subclasses on failure.
    """
    if not transcript_text or not transcript_text.strip():
        raise ValueError("Transcript text is empty — cannot generate a summary.")

    # Resolve the model; fall back to a template summary when Ollama is down.
    try:
        selected_model = resolve_model(model)
    except OllamaUnavailableError as exc:
        logger.warning("Ollama unavailable (%s); using template fallback summary.", exc)
        return generate_template_summary(
            transcript_text,
            model=model or Config.OLLAMA_MODEL,
            meeting_title=meeting_title,
            meeting_date=meeting_date,
            template=template,
        )

    prompt = _build_prompt(transcript_text, meeting_title, meeting_date, template)

    last_error = None
    for attempt in (1, 2):
        try:
            raw = _call_ollama(prompt, selected_model)
            result = _parse_response(raw)
            if result["summary_text"] or result["key_points"]:
                result["model_used"] = selected_model
                return result
            last_error = OllamaResponseError(
                "The AI model returned an empty summary. "
                "Try again or switch to a larger model."
            )
        except OllamaUnavailableError as exc:
            logger.warning("Ollama unavailable (%s); using template fallback summary.", exc)
            return generate_template_summary(
                transcript_text,
                model=selected_model,
                meeting_title=meeting_title,
                meeting_date=meeting_date,
                template=template,
            )
        except OllamaResponseError as exc:
            last_error = exc

        logger.warning("Ollama summary attempt %s failed: %s", attempt, last_error)
        # Second attempt asks for strict JSON only, at temperature 0.
        prompt = prompt + "\n\nReturn ONLY the JSON object, with no other text."

    raise last_error or OllamaResponseError("The AI model could not summarise this transcript.")


QUESTION_STARTS = (
    "what", "why", "how", "when", "where", "who", "which",
    "can", "could", "would", "should", "will", "is", "are",
    "do", "does", "did",
)
DECISION_KEYWORDS = (
    "decided", "agreed", "agree", "approval", "approved",
    "we'll", "we will", "going to", "decision", "confirm",
)
PROBLEM_KEYWORDS = (
    "problem", "blocker", "issue", "risk", "concern",
    "blocked", "delay", "bug", "error", "fail", "failure",
)
ACTION_KEYWORDS = (
    "action item", "todo", "task", "assignee", "owner",
    "due", "deadline", "follow up", "need to", "has to",
    "must", "responsible for",
)


def _split_sentences(text: str) -> list:
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def generate_template_summary(
    transcript_text: str,
    model: Optional[str] = None,
    meeting_title: Optional[str] = None,
    meeting_date: Optional[str] = None,
    template: Optional[str] = None,
) -> dict:
    """
    Rule-based fallback summary used when Ollama is unavailable.

    Returns the same dict shape as ``generate_summary`` so callers need no
    changes:
        {
            "summary_text": str,
            "key_points": list[str],
            "decisions": list[str],
            "problems_identified": list[str],
            "important_questions": list[str],
            "action_items": list[{"task", "assignee", "due_date", "priority"}],
            "model_used": str,
        }
    """
    if not transcript_text or not transcript_text.strip():
        raise ValueError("Transcript text is empty — cannot generate a summary.")

    text = transcript_text.strip()
    sentences = _split_sentences(text)

    key_points = []
    decisions = []
    problems = []
    questions = []
    action_items = []

    for s in sentences:
        low = s.lower()
        first_word = low.split()[0] if low.split() else ""

        if s.endswith("?") or first_word in QUESTION_STARTS:
            questions.append(s)
            continue
        if any(k in low for k in DECISION_KEYWORDS):
            decisions.append(s)
            continue
        if any(k in low for k in PROBLEM_KEYWORDS):
            problems.append(s)
            continue
        if any(k in low for k in ACTION_KEYWORDS):
            priority = "high" if ("urgent" in low or "asap" in low) else "medium"
            action_items.append({
                "task": s,
                "assignee": "Unassigned",
                "due_date": "Not specified",
                "priority": priority,
            })
            continue
        if len(key_points) < 7:
            key_points.append(s)

    header = f"Meeting: {meeting_title or 'Untitled Meeting'}\nDate: {meeting_date or 'Not specified'}"
    first = sentences[0] if sentences else "No transcript content available."
    summary_text = f"{header}\n\n{first}"
    if key_points:
        summary_text += f"\n\nKey topics discussed: {'; '.join(key_points[:3])}."

    return {
        "summary_text": summary_text,
        "key_points": key_points,
        "decisions": decisions,
        "problems_identified": problems,
        "important_questions": questions,
        "action_items": action_items,
        "model_used": model or Config.OLLAMA_MODEL,
    }


# ---------------------------------------------------------------------------
# Ollama HTTP helpers
# ---------------------------------------------------------------------------

def _fetch_models():
    """Return (models_list, error_message)."""
    try:
        resp = requests.get(f"{Config.OLLAMA_BASE_URL}/api/tags", timeout=5)
    except requests.exceptions.ConnectionError:
        return [], (
            "Ollama is not running. Start it with 'ollama serve' "
            "(or open the Ollama desktop app)."
        )
    except requests.exceptions.Timeout:
        return [], "Ollama did not respond in time. Is the service busy or hung?"
    except Exception as exc:  # pragma: no cover - defensive
        return [], str(exc)

    if resp.status_code != 200:
        return [], f"Ollama returned HTTP {resp.status_code}"

    try:
        data = resp.json()
    except ValueError:
        return [], "Ollama returned a response that was not valid JSON."

    return [_describe_model(m) for m in data.get("models", [])], None


def _describe_model(model: dict) -> dict:
    details = model.get("details") or {}
    name = model.get("name", "")
    is_cloud = bool(model.get("remote_host")) or name.endswith(_CLOUD_SUFFIX)
    return {
        "name": name,
        "size": model.get("size") or 0,
        "parameter_size": details.get("parameter_size") or "",
        "family": details.get("family") or "",
        "is_cloud": is_cloud,
    }


def _call_ollama(prompt: str, model: str) -> str:
    """Call /api/generate (non-streaming) and return the full response text."""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": SUMMARY_SCHEMA,
        "options": {
            "temperature": 0.1,   # low temperature keeps extraction faithful
            "top_p": 0.9,
            "num_predict": 1200,
        },
    }

    logger.info("Calling Ollama model=%s prompt_chars=%s", model, len(prompt))
    try:
        resp = requests.post(
            f"{Config.OLLAMA_BASE_URL}/api/generate",
            json=payload,
            timeout=(10, Config.OLLAMA_TIMEOUT),
        )
    except requests.exceptions.ConnectionError:
        raise OllamaUnavailableError(
            "Cannot connect to Ollama. Make sure it is running: 'ollama serve'."
        )
    except requests.exceptions.Timeout:
        raise OllamaUnavailableError(
            "Ollama took too long to answer. Try a smaller model or shorter transcript."
        )

    if resp.status_code == 404:
        raise OllamaUnavailableError(
            f"Ollama model '{model}' is not installed. Run: ollama pull {model}"
        )
    if resp.status_code != 200:
        raise OllamaUnavailableError(
            f"Ollama API error {resp.status_code}: {resp.text[:300]}"
        )

    try:
        data = resp.json()
    except ValueError:
        raise OllamaResponseError("Ollama returned a response that was not valid JSON.")

    response_text = (data.get("response") or "").strip()
    logger.info("Ollama raw response length: %s chars", len(response_text))
    if not response_text:
        raise OllamaResponseError("Ollama returned an empty response.")
    return response_text


# ---------------------------------------------------------------------------
# Prompting / parsing
# ---------------------------------------------------------------------------

def _build_prompt(
    transcript_text: str,
    meeting_title: Optional[str] = None,
    meeting_date: Optional[str] = None,
    template: Optional[str] = None,
) -> str:
    transcript_text = _fit_transcript(transcript_text)

    context_lines = []
    if meeting_title:
        context_lines.append(f"Meeting title: {meeting_title}")
    if meeting_date:
        context_lines.append(f"Meeting date: {meeting_date}")
    if template:
        context_lines.append(f"Meeting type/template: {template}")
    context = ("\n".join(context_lines) + "\n\n") if context_lines else ""

    return f"""You are an expert meeting analyst. Read the meeting transcript and produce structured meeting notes.

{context}Rules:
- Base every statement strictly on what the transcript says. Never invent tasks, names, numbers, decisions or deadlines.
- "summary_text": a 3-5 sentence overview of what the meeting was about and what was accomplished.
- "key_points": 3-7 one-sentence bullets covering the important topics discussed.
- "decisions": every agreement or conclusion the group actually reached. Statements such as "let's go with", "we'll use", "approved", "we agreed" or an agreed launch date are decisions, including vendor/tool choices, budget approvals and agreed dates. Empty array if none were reached.
- "problems_identified": any blockers, risks, concerns, issues, or unresolved conflicts explicitly mentioned. Empty array if none.
- "important_questions": any open questions raised during the meeting that were NOT answered or resolved. Empty array if none.
- "action_items": only tasks that the transcript states someone will do or must do. Do not add generic next steps.
  - "task": a short imperative description of the stated task, without the deadline.
  - "assignee": the person who accepted or was assigned the task, otherwise "Unassigned".
  - "due_date": copy the deadline wording from the transcript exactly (for example "next Friday" or "November 18th"), otherwise "Not specified". Never convert a relative date into a calendar date.
  - "priority": estimate urgency as one of "low", "medium", "high", "urgent" based on language used (e.g. "ASAP", "critical" = urgent/high).
- Do not include small talk, greetings or logistics that carry no meaning.

MEETING TRANSCRIPT:
---
{transcript_text}
---
"""


def _fit_transcript(transcript_text: str) -> str:
    """
    Trim long transcripts without losing the end, where decisions and
    action items usually appear.
    """
    limit = Config.OLLAMA_MAX_TRANSCRIPT_CHARS
    text = transcript_text.strip()
    if len(text) <= limit:
        return text

    head = int(limit * 0.6)
    tail = limit - head
    return (
        text[:head]
        + "\n\n[... middle of transcript omitted for length ...]\n\n"
        + text[-tail:]
    )


def _parse_response(raw: str) -> dict:
    """Parse the model output into the structured summary dict."""
    text = raw.strip()

    # Be tolerant: strip markdown fences or prose around the JSON object.
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text, flags=re.IGNORECASE).strip()

    if not text.startswith("{"):
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            text = match.group(0)

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse Ollama JSON: %s\nRaw:\n%s", exc, raw[:500])
        raise OllamaResponseError(
            "The AI returned a response that was not valid JSON. Please try again."
        )

    if not isinstance(parsed, dict):
        raise OllamaResponseError("The AI returned JSON in an unexpected shape.")

    return {
        "summary_text": str(parsed.get("summary_text") or "").strip(),
        "key_points": _ensure_list(parsed.get("key_points")),
        "decisions": _ensure_list(parsed.get("decisions")),
        "problems_identified": _ensure_list(parsed.get("problems_identified")),
        "important_questions": _ensure_list(parsed.get("important_questions")),
        "action_items": _normalise_action_items(parsed.get("action_items")),
    }


def _ensure_list(value) -> list:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _normalise_action_items(items) -> list:
    if not isinstance(items, list):
        return []

    result = []
    for item in items:
        if isinstance(item, dict):
            task = str(item.get("task") or "").strip()
            if not task:
                continue
            result.append({
                "task": task,
                "assignee": str(item.get("assignee") or "").strip() or "Unassigned",
                "due_date": str(item.get("due_date") or "").strip() or "Not specified",
                "priority": str(item.get("priority") or "medium").strip().lower() or "medium",
            })
        elif isinstance(item, str) and item.strip():
            result.append({
                "task": item.strip(),
                "assignee": "Unassigned",
                "due_date": "Not specified",
            })
    return result
