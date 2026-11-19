from datetime import datetime

from extensions import db


class MeetingSummary(db.Model):
    __tablename__ = "meeting_summaries"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    meeting_id = db.Column(
        db.Integer,
        db.ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
    )
    transcript_id = db.Column(
        db.Integer,
        db.ForeignKey("transcripts.id", ondelete="SET NULL"),
        nullable=True,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # AI-generated content
    summary_text = db.Column(db.Text, nullable=True)         # Executive summary paragraph
    key_points = db.Column(db.JSON, nullable=True)           # List[str] – topics discussed
    decisions = db.Column(db.JSON, nullable=True)            # List[str] – decisions made
    problems_identified = db.Column(db.JSON, nullable=True)  # List[str] – blockers/risks
    important_questions = db.Column(db.JSON, nullable=True)  # List[str] – open questions
    template = db.Column(db.String(100), nullable=True)      # e.g. "standup", "retrospective"

    # Metadata
    model_used = db.Column(db.String(100), default="llama3.2:3b")
    status = db.Column(db.String(50), default="completed")  # "generating" | "completed" | "failed"
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Tasks live in their own table so their status can be updated independently.
    action_items = db.relationship(
        "ActionItem",
        backref="summary",
        lazy="selectin",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ActionItem.position",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "meeting_id": self.meeting_id,
            "transcript_id": self.transcript_id,
            "user_id": self.user_id,
            "summary_text": self.summary_text or "",
            "key_points": self.key_points or [],
            "decisions": self.decisions or [],
            "problems_identified": self.problems_identified or [],
            "important_questions": self.important_questions or [],
            "template": self.template or "",
            "action_items": [item.to_dict() for item in self.action_items],
            "model_used": self.model_used or "llama3.2:3b",
            "status": self.status or "completed",
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f"<MeetingSummary id={self.id} meeting_id={self.meeting_id} status='{self.status}'>"
