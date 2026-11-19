import os
from datetime import timedelta


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY") or "dev-secret-key-change-me"
    SQLALCHEMY_DATABASE_URI = (
        os.getenv("DATABASE_URL")
        or "mysql+pymysql://root:root@localhost:3306/meetmind_ai"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
    }
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
