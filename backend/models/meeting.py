from datetime import datetime
from extensions import db


class Meeting(db.Model):
    __tablename__ = "meetings"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    meeting_date = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(30), default="scheduled", nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    recordings = db.relationship(
        "Recording",
        backref="meeting",
        lazy=True,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    transcripts = db.relationship(
        "Transcript",
        backref="meeting",
        lazy=True,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def to_dict(self):
        try:
            recordings_count = len(self.recordings) if self.recordings else 0
        except Exception:
            recordings_count = 0

        try:
            has_transcript = len(self.transcripts) > 0 if self.transcripts else False
        except Exception:
            has_transcript = False

        try:
            has_summary = len(self.summaries) > 0 if self.summaries else False
        except Exception:
            has_summary = False

        try:
            transcripts_count = len(self.transcripts) if self.transcripts else 0
        except Exception:
            transcripts_count = 0

        return {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "description": self.description or "",
            "meeting_date": self.meeting_date.isoformat() if self.meeting_date else None,
            "status": self.status or "scheduled",
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "recordings_count": recordings_count,
            "transcripts_count": transcripts_count,
            "has_summary": has_summary,
        }

    def __repr__(self):
        return f"<Meeting id={self.id} title='{self.title}' status='{self.status}'>"
