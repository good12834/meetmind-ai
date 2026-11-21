import os
import socket
from datetime import timedelta
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _resolve_database_uri():
    configured_uri = (
        os.getenv("DATABASE_URL")
        or "mysql+pymysql://root:root@localhost:3306/meetmind_ai"
    )
    # Fix Render postgres:// URI scheme for SQLAlchemy compatibility
    if configured_uri.startswith("postgres://"):
        configured_uri = configured_uri.replace("postgres://", "postgresql://", 1)

    if configured_uri.startswith("sqlite") or configured_uri.startswith("postgresql"):
        return configured_uri

    if "mysql" in configured_uri:
        host = "localhost"
        port = 3306
        try:
            parsed = urlparse(
                configured_uri.replace("mysql+pymysql://", "http://").replace("mysql://", "http://")
            )
            host = parsed.hostname or "localhost"
            port = parsed.port or 3306
            with socket.create_connection((host, port), timeout=0.8):
                return configured_uri
        except Exception:
            sqlite_path = os.path.join(BASE_DIR, "meetmind_ai.db").replace("\\", "/")
            print(f"[Database Notice] MySQL server at {host}:{port} is unreachable (Connection refused).")
            print(f"[Database Notice] Gracefully falling back to SQLite database at: {sqlite_path}")
            print(f"[Database Notice] To use MySQL instead, start your MySQL server or container.")
            return f"sqlite:///{sqlite_path}"

    return configured_uri


_DB_URI = _resolve_database_uri()
_IS_SQLITE = _DB_URI.startswith("sqlite")


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY") or "dev-secret-key-change-me"
    SQLALCHEMY_DATABASE_URI = _DB_URI
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = (
        {"pool_pre_ping": True}
        if _IS_SQLITE
        else {
            "pool_pre_ping": True,
            "pool_recycle": 280,
        }
    )
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or "dev-jwt-secret-change-me"
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=2)

    # Password complexity requirements (enforced in utils.validation)
    PASSWORD_MIN_LENGTH = 8

    # Password reset token validity window
    RESET_TOKEN_EXPIRES_HOURS = 1

    # Directory where uploaded audio recordings are stored (outside of any public
    # folder so recordings are never directly accessible via a URL).
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads", "recordings")

    # Max upload size: 100 MB (Flask rejects larger request bodies with 413).
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024

    # Local Ollama instance used for AI meeting summaries.
    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL") or "http://localhost:11434"
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL") or "llama3.2:3b"
    OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT") or 300)
    OLLAMA_MAX_TRANSCRIPT_CHARS = int(os.getenv("OLLAMA_MAX_TRANSCRIPT_CHARS") or 12000)
