from datetime import datetime
from extensions import db


class Transcript(db.Model):
    __tablename__ = "transcripts"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    meeting_id = db.Column(
        db.Integer,
        db.ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
    )
    recording_id = db.Column(
        db.Integer,
        db.ForeignKey("recordings.id", ondelete="SET NULL"),
        nullable=True,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    full_text = db.Column(db.Text, nullable=False)
    language = db.Column(db.String(20), default="en")
    duration = db.Column(db.Float, default=0.0)
    segments = db.Column(db.JSON, nullable=True)
    status = db.Column(db.String(50), default="completed")  # "processing", "completed", "failed"
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "meeting_id": self.meeting_id,
            "recording_id": self.recording_id,
            "user_id": self.user_id,
            "full_text": self.full_text,
            "language": self.language or "en",
            "duration": round(self.duration, 2) if self.duration else 0.0,
            "segments": self.segments or [],
            "status": self.status or "completed",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Transcript id={self.id} meeting_id={self.meeting_id} status='{self.status}'>"

