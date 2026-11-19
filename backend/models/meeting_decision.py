from datetime import datetime

from extensions import db


class MeetingDecision(db.Model):
    """A decision extracted from or manually added to a meeting."""

    __tablename__ = "meeting_decisions"

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

    decision_text = db.Column(db.Text, nullable=False)
    context = db.Column(db.Text, nullable=True)
    detected_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "meeting_id": self.meeting_id,
            "user_id": self.user_id,
            "decision_text": self.decision_text,
            "context": self.context,
            "detected_at": self.detected_at.isoformat() if self.detected_at else None,
        }

    def __repr__(self):
        return f"<MeetingDecision id={self.id} meeting_id={self.meeting_id}>"
