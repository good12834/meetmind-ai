from datetime import datetime

from extensions import db


class Team(db.Model):
    """A team workspace for collaboration on meetings."""

    __tablename__ = "teams"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text, nullable=True)
    owner_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    members = db.relationship(
        "TeamMember",
        backref="team",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def to_dict(self, include_members=False):
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description or "",
            "owner_id": self.owner_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_members:
            data["members"] = [m.to_dict() for m in self.members]
        return data

    def __repr__(self):
        return f"<Team id={self.id} name='{self.name}'>"


class TeamMember(db.Model):
    """A user belonging to a team with a role."""

    __tablename__ = "team_members"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    team_id = db.Column(
        db.Integer,
        db.ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    role = db.Column(db.String(50), default="member")  # owner | admin | member
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("team_id", "user_id", name="uq_team_user"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "team_id": self.team_id,
            "user_id": self.user_id,
            "role": self.role,
            "joined_at": self.joined_at.isoformat() if self.joined_at else None,
        }

    def __repr__(self):
        return f"<TeamMember id={self.id} team_id={self.team_id} user_id={self.user_id} role='{self.role}'>"
