from datetime import datetime

from extensions import db

ACTION_ITEM_STATUSES = ("pending", "in_progress", "completed")


class ActionItem(db.Model):
    """A single task extracted from a meeting transcript by the local LLM."""

    __tablename__ = "action_items"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    summary_id = db.Column(
        db.Integer,
        db.ForeignKey("meeting_summaries.id", ondelete="SET NULL"),
        nullable=True,
    )
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

    task = db.Column(db.Text, nullable=False)
    assignee = db.Column(db.String(150), default="Unassigned")
    due_date = db.Column(db.String(120), default="Not specified")
    status = db.Column(db.String(30), default="pending", nullable=False)
    position = db.Column(db.Integer, default=0)
    priority = db.Column(db.String(20), default="medium")

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "summary_id": self.summary_id,
            "meeting_id": self.meeting_id,
            "task": self.task,
            "assignee": self.assignee or "Unassigned",
            "due_date": self.due_date or "Not specified",
            "status": self.status or "pending",
            "priority": self.priority or "medium",
            "position": self.position or 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f"<ActionItem id={self.id} status='{self.status}' task='{self.task[:40]}'>"
