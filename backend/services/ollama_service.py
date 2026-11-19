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
        "action_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "task": {"type": "string"},
                    "assignee": {"type": "string"},
                    "due_date": {"type": "string"},
                },
                "required": ["task", "assignee", "due_date"],
            },
        },
    },
    "required": ["summary_text", "key_points", "decisions", "action_items"],
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


def generate_summary(
    transcript_text: str,
    model: Optional[str] = None,
    meeting_title: Optional[str] = None,
    meeting_date: Optional[str] = None,
) -> dict:
    """
    Send the transcript to Ollama and return:
    {
        "summary_text": str,
        "key_points":   list[str],
        "decisions":    list[str],
        "action_items": list[{"task", "assignee", "due_date"}],
        "model_used":   str,
    }
    Raises OllamaError subclasses on failure.
    """
    if not transcript_text or not transcript_text.strip():
        raise ValueError("Transcript text is empty — cannot generate a summary.")

    selected_model = resolve_model(model)
    prompt = _build_prompt(transcript_text, meeting_title, meeting_date)

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
        except OllamaResponseError as exc:
            last_error = exc

        logger.warning("Ollama summary attempt %s failed: %s", attempt, last_error)
        # Second attempt asks for strict JSON only, at temperature 0.
        prompt = prompt + "\n\nReturn ONLY the JSON object, with no other text."

    raise last_error or OllamaResponseError("The AI model could not summarise this transcript.")


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
) -> str:
    transcript_text = _fit_transcript(transcript_text)

    context_lines = []
    if meeting_title:
        context_lines.append(f"Meeting title: {meeting_title}")
    if meeting_date:
        context_lines.append(f"Meeting date: {meeting_date}")
    context = ("\n".join(context_lines) + "\n\n") if context_lines else ""

    return f"""You are an expert meeting analyst. Read the meeting transcript and produce structured meeting notes.

{context}Rules:
- Base every statement strictly on what the transcript says. Never invent tasks, names, numbers, decisions or deadlines.
- "summary_text": a 3-5 sentence overview of what the meeting was about and what was accomplished.
- "key_points": 3-7 one-sentence bullets covering the important topics discussed.
- "decisions": every agreement or conclusion the group actually reached. Statements such as "let's go with", "we'll use", "approved", "we agreed" or an agreed launch date are decisions, including vendor/tool choices, budget approvals and agreed dates. Empty array if none were reached.
- "action_items": only tasks that the transcript states someone will do or must do. Do not add generic next steps.
  - "task": a short imperative description of the stated task, without the deadline.
  - "assignee": the person who accepted or was assigned the task, otherwise "Unassigned".
  - "due_date": copy the deadline wording from the transcript exactly (for example "next Friday" or "November 18th"), otherwise "Not specified". Never convert a relative date into a calendar date.
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
            })
        elif isinstance(item, str) and item.strip():
            result.append({
                "task": item.strip(),
                "assignee": "Unassigned",
                "due_date": "Not specified",
            })
    return result
