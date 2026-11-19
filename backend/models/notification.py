from datetime import datetime

from extensions import db


class Notification(db.Model):
    """User notifications for tasks, deadlines, and meeting summaries."""

    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    meeting_id = db.Column(
        db.Integer,
        db.ForeignKey("meetings.id", ondelete="SET NULL"),
        nullable=True,
    )
    action_item_id = db.Column(
        db.Integer,
        db.ForeignKey("action_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    type = db.Column(db.String(50), nullable=False)  # task_assigned | task_due | summary_ready | meeting_invited
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=True)
    is_read = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "meeting_id": self.meeting_id,
            "action_item_id": self.action_item_id,
            "type": self.type,
            "title": self.title,
            "message": self.message or "",
            "is_read": self.is_read,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Notification id={self.id} type='{self.type}' user_id={self.user_id}>"


class MeetingTopic(db.Model):
    """Topics extracted from a meeting transcript."""

    __tablename__ = "meeting_topics"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    meeting_id = db.Column(
        db.Integer,
        db.ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
    )
    topic = db.Column(db.String(200), nullable=False)
    confidence = db.Column(db.Float, default=0.0)
    mentioned_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "meeting_id": self.meeting_id,
            "topic": self.topic,
            "confidence": self.confidence,
            "mentioned_at": self.mentioned_at.isoformat() if self.mentioned_at else None,
        }

    def __repr__(self):
        return f"<MeetingTopic id={self.id} topic='{self.topic}'>"


class MeetingSpeaker(db.Model):
    """Speaker information for a meeting (diarization labels)."""

    __tablename__ = "meeting_speakers"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    meeting_id = db.Column(
        db.Integer,
        db.ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
    )
    speaker_label = db.Column(db.String(100), nullable=False)
    display_name = db.Column(db.String(150), nullable=True)
    speaking_time_seconds = db.Column(db.Integer, default=0)
    utterance_count = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "meeting_id": self.meeting_id,
            "speaker_label": self.speaker_label,
            "display_name": self.display_name or self.speaker_label,
            "speaking_time_seconds": self.speaking_time_seconds,
            "utterance_count": self.utterance_count,
        }

    def __repr__(self):
        return f"<MeetingSpeaker id={self.id} label='{self.speaker_label}'>"


class MeetingComment(db.Model):
    """Comments on meetings for team collaboration."""

    __tablename__ = "meeting_comments"

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
    parent_id = db.Column(
        db.Integer,
        db.ForeignKey("meeting_comments.id", ondelete="SET NULL"),
        nullable=True,
    )
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "meeting_id": self.meeting_id,
            "user_id": self.user_id,
            "parent_id": self.parent_id,
            "content": self.content,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f"<MeetingComment id={self.id} meeting_id={self.meeting_id}>"


class MeetingTemplate(db.Model):
    """Reusable meeting templates (standups, interviews, project reviews)."""

    __tablename__ = "meeting_templates"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text, nullable=True)
    structure = db.Column(db.JSON, nullable=True)
    is_default = db.Column(db.Boolean, default=False, nullable=False)
    created_by = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description or "",
            "structure": self.structure or {},
            "is_default": self.is_default,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<MeetingTemplate id={self.id} name='{self.name}'>"
