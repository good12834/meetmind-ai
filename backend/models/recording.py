from datetime import datetime
from extensions import db


class Recording(db.Model):
    __tablename__ = "recordings"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    meeting_id = db.Column(
        db.Integer,
        db.ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    filename = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    file_size = db.Column(db.Integer, default=0)
    duration = db.Column(db.Float, default=0.0)
    mime_type = db.Column(db.String(100), default="audio/webm")
    source = db.Column(db.String(50), default="browser")  # "browser" or "upload"
    status = db.Column(db.String(50), default="ready")    # "ready", "processing", "transcribed"
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "meeting_id": self.meeting_id,
            "user_id": self.user_id,
            "filename": self.filename,
            "original_filename": self.original_filename,
            "file_size": self.file_size,
            "duration": round(self.duration, 2) if self.duration else 0.0,
            "mime_type": self.mime_type,
            "source": self.source,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "audio_url": f"/api/recordings/{self.id}/audio",
        }

    def __repr__(self):
        return f"<Recording id={self.id} meeting_id={self.meeting_id} filename='{self.filename}'>"
