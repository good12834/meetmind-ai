from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.exceptions import HTTPException
import os

load_dotenv()

def _parse_allowed_origins():
    raw = os.getenv("ALLOWED_ORIGINS", "")
    if raw.strip():
        return [o.strip() for o in raw.split(",") if o.strip()]
    # sensible local-dev defaults
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "https://meetmind-ai-lake.vercel.app",
    ]


ALLOWED_ORIGINS = _parse_allowed_origins()

# Add Vercel deployment origin for production
VERCEL_URL = os.getenv("VERCEL_URL")
if VERCEL_URL:
    ALLOWED_ORIGINS.append(f"https://{VERCEL_URL}")

app = Flask(__name__)

app.config.from_object("config.Config")
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100 MB max file upload

# Configure CORS explicitly with all dev origins, methods, and headers
CORS(
    app,
    resources={
        r"/*": {
            "origins": ALLOWED_ORIGINS,
        }
    },
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
)

from extensions import db, jwt, socketio

db.init_app(app)
socketio.init_app(app, cors_allowed_origins="*", async_mode="threading")
jwt.init_app(app)


# Handle preflight OPTIONS requests before reaching blueprints
@app.before_request
def handle_options_preflight():
    if request.method == "OPTIONS":
        response = app.make_default_options_response()
        origin = request.headers.get("Origin")
        allowed_origins = ALLOWED_ORIGINS
        if origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Headers"] = (
                "Content-Type, Authorization, X-Requested-With"
            )
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, POST, PUT, DELETE, OPTIONS, PATCH"
            )
        return response


# Ensure CORS headers are injected on EVERY response (even on errors)
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    allowed_origins = ALLOWED_ORIGINS
    if origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = (
            "Content-Type, Authorization, X-Requested-With"
        )
        response.headers["Access-Control-Allow-Methods"] = (
            "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        )
    return response

# Global error handler for 500 errors
@app.errorhandler(500)
def internal_error(e):
    try:
        db.session.rollback()
    except Exception:
        pass
    return jsonify({
        "success": False,
        "message": f"Internal Server Error: {str(e)}",
    }), 500


# Catch unhandled exceptions to return JSON with CORS headers instead of raw HTML
@app.errorhandler(Exception)
def handle_unexpected_exception(e):
    if isinstance(e, HTTPException):
        return e
    try:
        db.session.rollback()
    except Exception:
        pass
    import traceback
    traceback.print_exc()
    return jsonify({
        "success": False,
        "message": f"Server error: {str(e)}",
    }), 500


# JWT Error Handlers: map signature errors / malformed tokens to 401
@jwt.invalid_token_loader
def invalid_token_callback(error_string):
    return jsonify({
        "success": False,
        "message": f"Invalid or malformed authentication token: {error_string}",
    }), 401


@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({
        "success": False,
        "message": "Authentication token has expired. Please sign in again.",
    }), 401


@jwt.unauthorized_loader
def missing_token_callback(error_string):
    return jsonify({
        "success": False,
        "message": f"Authentication required: {error_string}",
    }), 401


# Import models after initializing db
from models.user import User  # noqa: E402
from models.meeting import Meeting  # noqa: E402
from models.recording import Recording  # noqa: E402
from models.transcript import Transcript  # noqa: E402
from models.summary import MeetingSummary  # noqa: E402
from models.action_item import ActionItem  # noqa: E402
from models.meeting_decision import MeetingDecision  # noqa: E402
from models.team import Team, TeamMember  # noqa: E402
from models.notification import Notification, MeetingTopic, MeetingSpeaker, MeetingComment, MeetingTemplate  # noqa: E402

# Import routes
from routes.auth import auth_bp  # noqa: E402
from routes.meetings import meetings_bp  # noqa: E402
from routes.recordings import recordings_bp  # noqa: E402
from routes.transcriptions import transcriptions_bp  # noqa: E402
from routes.summaries import summaries_bp  # noqa: E402
from routes.live import live_bp  # noqa: E402
from routes.action_items import action_items_bp  # noqa: E402
from routes.decisions import decisions_bp  # noqa: E402
from routes.ai_chat import ai_chat_bp  # noqa: E402
from routes.analytics import analytics_bp  # noqa: E402
from routes.teams import teams_bp  # noqa: E402
from routes.notifications import notifications_bp  # noqa: E402

app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(meetings_bp, url_prefix="/api/meetings")
app.register_blueprint(recordings_bp, url_prefix="/api/recordings")
app.register_blueprint(transcriptions_bp, url_prefix="/api")
app.register_blueprint(live_bp, url_prefix="/api")
from events import live_events  # noqa: E402
from events import video_events  # noqa: E402,F401
app.register_blueprint(summaries_bp, url_prefix="/api")
app.register_blueprint(action_items_bp, url_prefix="/api")
app.register_blueprint(decisions_bp, url_prefix="/api")
app.register_blueprint(ai_chat_bp, url_prefix="/api")
app.register_blueprint(analytics_bp, url_prefix="/api")
app.register_blueprint(teams_bp, url_prefix="/api")
app.register_blueprint(notifications_bp, url_prefix="/api")


@app.errorhandler(413)
def too_large(e):
    return jsonify({
        "success": False,
        "message": "File too large. Maximum size is 100 MB",
    }), 413


@app.route("/")
def home():
    return jsonify({
        "message": "Welcome to MeetMind AI API",
        "status": "running",
    })


@app.route("/api/health")
def health():
    return jsonify({
        "success": True,
        "message": "MeetMind AI backend is working",
    })


@app.route("/api/db-health")
def database_health():
    try:
        db.session.execute(db.text("SELECT 1"))
        return jsonify({
            "success": True,
            "message": "MySQL connected successfully",
        })
    except Exception:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": "Database connection failed",
        }), 500


# Automatic table creation and schema synchronization on app startup
def auto_sync_schema():
    with app.app_context():
        try:
            from sqlalchemy import inspect, text
            inspector = inspect(db.engine)
            tables = inspector.get_table_names()

            # Ensure all tables (users, meetings, recordings, transcripts) exist
            db.create_all()

            if "recordings" in tables:
                columns = [c["name"] for c in inspector.get_columns("recordings")]
                if "filename" not in columns:
                    app.logger.warning("Auto-sync: missing 'filename' in recordings table. Updating schema...")
                    row_count = 0
                    try:
                        res = db.session.execute(text("SELECT COUNT(*) FROM recordings")).scalar()
                        row_count = res or 0
                    except Exception:
                        row_count = 0

                    if row_count == 0:
                        db.session.execute(text("DROP TABLE IF EXISTS recordings"))
                        db.session.commit()
                        db.create_all()
                        app.logger.info("Auto-sync: re-created recordings table with full schema.")
                    else:
                        expected = {
                            "filename": "VARCHAR(255) NOT NULL DEFAULT ''",
                            "original_filename": "VARCHAR(255) NOT NULL DEFAULT 'recording.webm'",
                            "file_path": "VARCHAR(500) NOT NULL DEFAULT ''",
                            "file_size": "INT DEFAULT 0",
                            "duration": "FLOAT DEFAULT 0.0",
                            "mime_type": "VARCHAR(100) DEFAULT 'audio/webm'",
                            "source": "VARCHAR(50) DEFAULT 'browser'",
                            "status": "VARCHAR(50) DEFAULT 'ready'",
                        }
                        for col, col_def in expected.items():
                            if col not in columns:
                                try:
                                    db.session.execute(text(f"ALTER TABLE recordings ADD COLUMN {col} {col_def}"))
                                    db.session.commit()
                                    app.logger.info(f"Auto-sync: added column '{col}' to recordings.")
                                except Exception:
                                    db.session.rollback()

            if "transcripts" not in tables:
                db.create_all()
                app.logger.info("Auto-sync: created transcripts table.")

            if "meeting_summaries" not in tables:
                db.create_all()
                app.logger.info("Auto-sync: created meeting_summaries table.")
            else:
                # Add new columns to meeting_summaries if missing
                sum_cols = [c["name"] for c in inspector.get_columns("meeting_summaries")]
                new_sum_cols = {
                    "problems_identified": "JSON",
                    "important_questions": "JSON",
                    "template": "VARCHAR(100)",
                }
                for col, col_def in new_sum_cols.items():
                    if col not in sum_cols:
                        try:
                            db.session.execute(text(f"ALTER TABLE meeting_summaries ADD COLUMN {col} {col_def}"))
                            db.session.commit()
                            app.logger.info(f"Auto-sync: added column '{col}' to meeting_summaries.")
                        except Exception:
                            db.session.rollback()

            if "action_items" not in tables:
                db.create_all()
                app.logger.info("Auto-sync: created action_items table.")

            if "meeting_decisions" not in tables:
                db.create_all()
                app.logger.info("Auto-sync: created meeting_decisions table.")

            # Ensure action_items has nullable summary_id and priority column
            if "action_items" in tables:
                ai_columns = [c["name"] for c in inspector.get_columns("action_items")]
                if "priority" not in ai_columns:
                    try:
                        db.session.execute(text("ALTER TABLE action_items ADD COLUMN priority VARCHAR(20) DEFAULT 'medium'"))
                        db.session.commit()
                        app.logger.info("Auto-sync: added 'priority' column to action_items.")
                    except Exception:
                        db.session.rollback()

        except Exception as e:
            app.logger.warning(f"Auto-sync notice: {e}")


auto_sync_schema()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, debug=False, host="0.0.0.0", port=port, use_reloader=False)
