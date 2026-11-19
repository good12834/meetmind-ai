"""
Live AI insights service — calls Ollama on each final transcript segment.
"""

import json
import logging
import re
from typing import Optional

import requests

from config import Config

logger = logging.getLogger(__name__)

INSIGHT_SCHEMA = {
    "type": "object",
    "properties": {
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
    "required": ["key_points", "decisions", "action_items"],
}

INSIGHT_PROMPT = """\
You are an expert meeting analyst. Read this live meeting transcript segment and
extract any new key points, decisions, and action items mentioned ONLY in this
segment. Base every statement strictly on what the segment says.

Return a JSON object with:
- "key_points": 1-3 one-sentence bullets covering important topics in this segment.
- "decisions": any agreements or conclusions reached in this segment.
- "action_items": tasks someone will do. Each with task, assignee, due_date.

If nothing new is mentioned, return empty arrays.

TRANSCRIPT SEGMENT:
---
{segment_text}
---

Return ONLY valid JSON matching the schema, no markdown fences, no extra prose.
"""


def extract_insights(segment_text: str, model: Optional[str] = None) -> dict:
    if not segment_text or not segment_text.strip():
        return {"key_points": [], "decisions": [], "action_items": []}

    model = model or Config.OLLAMA_MODEL
    prompt = INSIGHT_PROMPT.format(segment_text=segment_text.strip())

    try:
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "format": json.dumps(INSIGHT_SCHEMA),
            "options": {"temperature": 0.3},
        }
        resp = requests.post(
            f"{Config.OLLAMA_BASE_URL}/api/generate",
            json=payload,
            timeout=Config.OLLAMA_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        raw = data.get("response", "").strip()

        text = raw
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text, flags=re.IGNORECASE).strip()
        if not text.startswith("{"):
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                text = match.group(0)

        parsed = json.loads(text)
        return {
            "key_points": _ensure_list(parsed.get("key_points")),
            "decisions": _ensure_list(parsed.get("decisions")),
            "action_items": _normalise_action_items(parsed.get("action_items")),
        }

    except Exception as e:
        logger.error(f"Live AI insight extraction failed: {e}", exc_info=True)
        return {"key_points": [], "decisions": [], "action_items": []}


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
