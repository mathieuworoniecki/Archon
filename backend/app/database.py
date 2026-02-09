from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
from .config import get_settings
from .models import Base

settings = get_settings()

# Create engine - detect if SQLite or PostgreSQL
connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True  # PostgreSQL connection health check
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _run_migrations():
    """Run lightweight schema migrations (add missing columns)."""
    migrations = [
        ("documents", "archive_path", "ALTER TABLE documents ADD COLUMN archive_path VARCHAR(1024)"),
        ("documents", "hash_md5", "ALTER TABLE documents ADD COLUMN hash_md5 VARCHAR(32)"),
        ("documents", "hash_sha256", "ALTER TABLE documents ADD COLUMN hash_sha256 VARCHAR(64)"),
        ("audit_logs", "entry_hash", "ALTER TABLE audit_logs ADD COLUMN entry_hash VARCHAR(64)"),
        ("audit_logs", "previous_hash", "ALTER TABLE audit_logs ADD COLUMN previous_hash VARCHAR(64)"),
    ]
    
    with engine.connect() as conn:
        is_sqlite = "sqlite" in str(engine.url)
        
        for table, column, ddl in migrations:
            try:
                if is_sqlite:
                    result = conn.execute(text(f"PRAGMA table_info({table})"))
                    cols = [row[1] for row in result]
                else:
                    # PostgreSQL / other ANSI-SQL databases
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
