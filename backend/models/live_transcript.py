from datetime import datetime
from extensions import db


class LiveTranscriptSegment(db.Model):
    """A single streaming transcript segment with optional AI insights."""

    __tablename__ = "live_transcript_segments"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    session_id = db.Column(
        db.Integer,
        db.ForeignKey("live_meeting_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    speaker = db.Column(db.String(50), default="Speaker", nullable=False)
    text = db.Column(db.Text, nullable=False)
    start_time = db.Column(db.Float, default=0.0)
    end_time = db.Column(db.Float, default=0.0)
    is_final = db.Column(db.Boolean, default=False, nullable=False)
    ai_insights = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "speaker": self.speaker,
            "text": self.text,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "is_final": self.is_final,
            "ai_insights": self.ai_insights or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<LiveTranscriptSegment id={self.id} session_id={self.session_id} final={self.is_final}>"
