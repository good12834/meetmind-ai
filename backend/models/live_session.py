from datetime import datetime
from extensions import db


class LiveMeetingSession(db.Model):
    """Tracks an active live meeting transcription/insights session."""

    __tablename__ = "live_meeting_sessions"

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
    status = db.Column(db.String(30), default="active", nullable=False)
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    ended_at = db.Column(db.DateTime, nullable=True)

    meeting = db.relationship("Meeting", backref="live_sessions", lazy=True)
    segments = db.relationship(
        "LiveTranscriptSegment",
        backref="session",
        lazy=True,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "meeting_id": self.meeting_id,
            "user_id": self.user_id,
            "status": self.status,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
        }

    def __repr__(self):
        return f"<LiveMeetingSession id={self.id} meeting_id={self.meeting_id} status='{self.status}'>"
