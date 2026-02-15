"""
Archon Backend - Database Configuration (PostgreSQL)
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
from .config import get_settings
from .models import Base

settings = get_settings()

# PostgreSQL connection pool — allows true parallel workers
engine = create_engine(
    settings.database_url,
    pool_size=10,        # 10 persistent connections
    max_overflow=20,     # 20 additional on burst
    pool_pre_ping=True,  # connection health check
    pool_recycle=1800,   # recycle after 30min
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _run_migrations():
    """Run lightweight schema migrations (add missing columns)."""
    migrations = [
        ("documents", "archive_path", "ALTER TABLE documents ADD COLUMN archive_path VARCHAR(1024)"),
        ("documents", "hash_md5", "ALTER TABLE documents ADD COLUMN hash_md5 VARCHAR(32)"),
        ("documents", "hash_sha256", "ALTER TABLE documents ADD COLUMN hash_sha256 VARCHAR(64)"),
        ("documents", "redaction_status", "ALTER TABLE documents ADD COLUMN redaction_status VARCHAR(20)"),
        ("documents", "redaction_score", "ALTER TABLE documents ADD COLUMN redaction_score FLOAT"),
        ("audit_logs", "entry_hash", "ALTER TABLE audit_logs ADD COLUMN entry_hash VARCHAR(64)"),
        ("audit_logs", "previous_hash", "ALTER TABLE audit_logs ADD COLUMN previous_hash VARCHAR(64)"),
    ]

    # Type widen migrations (safe in Postgres). Needed for very large corpora where:
    # - individual file sizes can exceed 2GB (int32 overflow)
    # - processed counters can exceed 32-bit over time
    type_widen_migrations = [
        ("documents", "file_size", "bigint", "ALTER TABLE documents ALTER COLUMN file_size TYPE BIGINT"),
        ("documents", "text_length", "bigint", "ALTER TABLE documents ALTER COLUMN text_length TYPE BIGINT"),
        ("scans", "total_files", "bigint", "ALTER TABLE scans ALTER COLUMN total_files TYPE BIGINT"),
        ("scans", "processed_files", "bigint", "ALTER TABLE scans ALTER COLUMN processed_files TYPE BIGINT"),
        ("scans", "failed_files", "bigint", "ALTER TABLE scans ALTER COLUMN failed_files TYPE BIGINT"),
    ]
    
    with engine.connect() as conn:
        for table, column, ddl in migrations:
            try:
                result = conn.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    f"WHERE table_name = '{table}'"
                ))
                cols = [row[0] for row in result]
                
                if column not in cols:
                    conn.execute(text(ddl))
                    conn.commit()
            except Exception:
                pass  # Column already exists

        # Best-effort: widen integer columns if a legacy schema used INT4.
        for table, column, desired_type, ddl in type_widen_migrations:
            try:
                result = conn.execute(
                    text(
                        "SELECT data_type FROM information_schema.columns "
                        "WHERE table_name = :table AND column_name = :column"
                    ),
                    {"table": table, "column": column},
                )
                current_type = result.scalar()
                if not current_type:
                    continue
                if current_type.lower() == desired_type:
                    continue
                if current_type.lower() == "integer" and desired_type == "bigint":
                    conn.execute(text(ddl))
                    conn.commit()
            except Exception:
                # SQLite (no information_schema) and some managed DBs may not allow ALTER TYPE.
                pass


def init_db():
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def get_db():
    """Dependency for getting database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context():
    """Context manager for database session."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
