"""Database initialization script for MeetMind AI.
Run this script to ensure all MySQL tables are created.
"""
from app import app
from extensions import db
from models.user import User
from models.meeting import Meeting
from models.recording import Recording

def init():
    with app.app_context():
        print("Connecting to database and creating tables...")
        db.create_all()
        print("✅ All tables created successfully!")
        print("Tables in metadata:", list(db.metadata.tables.keys()))

if __name__ == "__main__":
    init()

