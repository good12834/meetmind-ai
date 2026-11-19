"""Input validation helpers for the MeetMind AI backend.

Centralises validation logic so the same rules apply across register, login,
password-reset and meeting create/update endpoints.
"""
import re
import os
from datetime import datetime

# A meeting may be scheduled starting from the current moment (small clock-drift
# tolerance) but never in the past.
MEETING_DATE_TOLERANCE_SECONDS = 60

ALLOWED_MEETING_STATUSES = ("scheduled", "in-progress", "completed", "cancelled")

EMAIL_REGEX = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

# Password complexity: at least 8 chars, one uppercase, one lowercase,
# one digit and one special character.
PASSWORD_REGEX = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$")


def validate_name(name):
    """Validate a user's display name. Returns (cleaned_value, error_message_or_None)."""
    if name is None:
        return None, "Name is required"
    name = str(name).strip()
    if not name:
        return None, "Name is required"
    if len(name) < 2:
        return None, "Name must be at least 2 characters"
    if len(name) > 100:
        return None, "Name must be at most 100 characters"
    return name, None


def validate_email(email):
    """Validate and normalise an email address. Returns (cleaned_value, error_message_or_None)."""
    if email is None:
        return None, "Email is required"
    email = str(email).strip().lower()
    if not email:
        return None, "Email is required"
    if not EMAIL_REGEX.match(email):
        return None, "Please enter a valid email address"
    return email, None


def validate_password(password):
    """Validate password complexity. Returns (cleaned_value, error_message_or_None)."""
    if password is None:
        return None, "Password is required"
    password = str(password)
    if not PASSWORD_REGEX.match(password):
        return None, (
            "Password must be at least 8 characters and include "
            "uppercase, lowercase, a number and a special character"
        )
    return password, None


def validate_meeting_date(date_str):
    """Validate a meeting date is present and not in the past.

    Returns (datetime_or_None, error_message_or_None). A missing/empty value is
    treated as valid (None) so callers can decide whether it's required.
    """
    if date_str is None or str(date_str).strip() == "":
        return None, None
    cleaned = str(date_str).strip().replace("Z", "")
    try:
        meeting_date = datetime.fromisoformat(cleaned)
    except ValueError:
        return None, "Invalid meeting date format. Use ISO 8601 (e.g. 2024-01-15T14:30:00)"
    if meeting_date.tzinfo is not None:
        meeting_date = meeting_date.replace(tzinfo=None)
    now = datetime.utcnow()
    if meeting_date < now.replace(microsecond=0) - __import__("datetime").timedelta(
        seconds=MEETING_DATE_TOLERANCE_SECONDS
    ):
        return None, "Meeting date cannot be in the past"
    return meeting_date, None


def validate_meeting_title(title):
    """Validate a meeting title. Returns (cleaned_value, error_message_or_None)."""
    if title is None:
        return None, "Meeting title is required"
    title = str(title).strip()
    if not title:
        return None, "Meeting title is required"
    if len(title) > 200:
        return None, "Meeting title must be at most 200 characters"
    return title, None


def validate_meeting_description(description):
    """Validate/sanitise an optional meeting description."""
    if description is None:
        return "", None
    return str(description).strip(), None


def validate_meeting_status(status):
    """Validate a meeting status against the allowed set."""
    if status is None:
        return "scheduled", None
    status = str(status).strip().lower()
    if status not in ALLOWED_MEETING_STATUSES:
        return None, f"Invalid status. Must be one of: {', '.join(ALLOWED_MEETING_STATUSES)}"
    return status, None


# ---------------------------------------------------------------------------
# Audio file validation (Milestone 4)
# ---------------------------------------------------------------------------

AUDIO_EXTENSIONS = {"mp3", "wav", "m4a", "webm"}
AUDIO_MIME_TYPES = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "m4a": "audio/mp4",
    "webm": "audio/webm",
}
# 100 MB
MAX_AUDIO_FILE_SIZE = 100 * 1024 * 1024


def validate_audio_file(file_storage):
    """Validate an uploaded audio file.

    Returns (cleaned_file_storage_or_None, error_message_or_None).
    Performs extension, MIME-type and size checks.
    """
    if file_storage is None:
        return None, "No audio file provided"

    filename = file_storage.filename or ""
    if not filename:
        return None, "No audio file selected"

    if "." not in filename:
        return None, "Unsupported file format. Allowed: MP3, WAV, M4A, WebM"

    ext = filename.rsplit(".", 1)[1].lower()
    if ext not in AUDIO_EXTENSIONS:
        return None, "Unsupported file format. Allowed: MP3, WAV, M4A, WebM"

    # MIME-type hint from the client (defence-in-depth, not authoritative).
    content_type = file_storage.content_type or ""
    expected_mime = AUDIO_MIME_TYPES.get(ext)
    if content_type and content_type not in (
        expected_mime,
        "application/octet-stream",
    ) and content_type.split("/")[0] != "audio":
        return None, "Unsupported file format. Allowed: MP3, WAV, M4A, WebM"

    try:
        file_storage.seek(0, os.SEEK_END)
        file_size = file_storage.tell()
        file_storage.seek(0)
    except OSError:
        return None, "Unable to read audio file"

    if file_size == 0:
        return None, "Audio file is empty"
    if file_size > MAX_AUDIO_FILE_SIZE:
        return None, "File too large. Maximum size is 100 MB"

    return file_storage, None
