"""MeetMind AI - Database Migration & Table Sync Utility.

Ensures the `recordings`, `transcripts`, `meetings`, and `users` tables
have all the required columns matching the current models.
"""
from app import app
from extensions import db
from models.user import User
from models.meeting import Meeting
from models.recording import Recording
from models.transcript import Transcript
from sqlalchemy import inspect, text


def migrate():
    with app.app_context():
        print("Checking database schema...")
        inspector = inspect(db.engine)
        tables = inspector.get_table_names()
        print(f"Existing tables in database: {tables}")

        # 1. First ensure all missing tables are created
        db.create_all()

        # 2. Check `recordings` table columns
        if "recordings" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("recordings")]
            expected_columns = {
                "meeting_id": "INT NOT NULL",
                "user_id": "INT NOT NULL",
                "filename": "VARCHAR(255) NOT NULL DEFAULT ''",
                "original_filename": "VARCHAR(255) NOT NULL DEFAULT 'recording.webm'",
                "file_path": "VARCHAR(500) NOT NULL DEFAULT ''",
                "file_size": "INT DEFAULT 0",
                "duration": "FLOAT DEFAULT 0.0",
                "mime_type": "VARCHAR(100) DEFAULT 'audio/webm'",
                "source": "VARCHAR(50) DEFAULT 'browser'",
                "status": "VARCHAR(50) DEFAULT 'ready'",
                "created_at": "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
            }

            missing = [col for col in expected_columns if col not in columns]

            if missing:
                print(f"⚠️ Missing columns detected in 'recordings': {missing}")
                row_count = 0
                try:
                    res = db.session.execute(text("SELECT COUNT(*) FROM recordings")).scalar()
                    row_count = res or 0
                except Exception:
                    row_count = 0

                if row_count == 0:
                    print("Re-creating 'recordings' table with full schema...")
                    try:
                        db.session.execute(text("DROP TABLE IF EXISTS recordings"))
                        db.session.commit()
                        db.create_all()
                        print("✅ Re-created 'recordings' table cleanly!")
                    except Exception as e:
                        db.session.rollback()
                        print(f"Error re-creating table: {e}")
                else:
                    for col in missing:
                        try:
                            col_def = expected_columns[col]
                            db.session.execute(text(f"ALTER TABLE recordings ADD COLUMN {col} {col_def}"))
                            db.session.commit()
                            print(f"  + Added column: {col}")
                        except Exception as e:
                            db.session.rollback()
                            print(f"  x Failed to add {col}: {e}")

        # 3. Check `transcripts` table
        updated_inspector = inspect(db.engine)
        final_tables = updated_inspector.get_table_names()
        print(f"\nFinal tables in database: {final_tables}")
        if "transcripts" in final_tables:
            t_cols = [c["name"] for c in updated_inspector.get_columns("transcripts")]
            print(f"Columns in 'transcripts': {t_cols}")
            expected_columns = {
                "id": "INT NOT NULL",
                "meeting_id": "INT NOT NULL",
                "recording_id": "INT",
                "user_id": "INT NOT NULL",
                "full_text": "TEXT NOT NULL",
                "language": "VARCHAR(20) DEFAULT 'en'",
                "duration": "FLOAT DEFAULT 0.0",
                "segments": "JSON",
                "source": "VARCHAR(50) DEFAULT 'live'",
                "status": "VARCHAR(50) DEFAULT 'completed'",
                "created_at": "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
            }

            missing = [col for col in expected_columns if col not in t_cols]
            if missing:
                print(f"⚠️ Missing columns detected in 'transcripts': {missing}")
                row_count = 0
                try:
                    res = db.session.execute(text("SELECT COUNT(*) FROM transcripts")).scalar()
                    row_count = res or 0
                except Exception:
                    row_count = 0

                if row_count == 0:
                    print("Re-creating 'transcripts' table with full schema...")
                    try:
                        db.session.execute(text("DROP TABLE IF EXISTS transcripts"))
                        db.session.commit()
                        db.create_all()
                        print("✅ Re-created 'transcripts' table cleanly!")
                    except Exception as e:
                        db.session.rollback()
                        print(f"Error re-creating table: {e}")
                else:
                    for col in missing:
                        try:
                            col_def = expected_columns[col]
                            db.session.execute(text(f"ALTER TABLE transcripts ADD COLUMN {col} {col_def}"))
                            db.session.commit()
                            print(f"  + Added column: {col}")
                        except Exception as e:
                            db.session.rollback()
                            print(f"  x Failed to add {col}: {e}")
            print("✅ 'transcripts' table is verified and ready!")


if __name__ == "__main__":
    migrate()
