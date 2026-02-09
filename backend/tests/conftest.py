"""
Archon Backend — Test Configuration (conftest.py)
Provides fixtures for test database, FastAPI test client, and temp files.
"""
import os
import tempfile
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Force test settings before importing app modules
os.environ["DATABASE_URL"] = "sqlite:///./test_data/test.db"
os.environ["GEMINI_API_KEY"] = "test-key"
os.environ["REDIS_URL"] = "redis://localhost:6379/15"  # Use DB 15 for tests

from app.database import Base, get_db
from app.main import app


# ── Test Database ──────────────────────────────────────────────────

TEST_DB_URL = "sqlite:///./test_data/test.db"

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Create test database directory."""
    Path("./test_data").mkdir(exist_ok=True)
    yield
    # Cleanup after all tests
    import shutil
    if Path("./test_data").exists():
        shutil.rmtree("./test_data")


@pytest.fixture
def db_session():
    """Create an isolated database session for each test."""
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine)
    session = TestSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    """FastAPI test client with test database."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── Temp File Helpers ──────────────────────────────────────────────

@pytest.fixture
def temp_dir():
    """Temporary directory that is cleaned up after the test."""
    d = tempfile.mkdtemp(prefix="archon_test_")
    yield Path(d)
    import shutil
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def sample_text_file(temp_dir):
    """Create a sample text file for testing."""
    path = temp_dir / "sample.txt"
    path.write_text("Hello, this is a test document.\nWith multiple lines.\n")
    return path


@pytest.fixture
def sample_zip_file(temp_dir):
    """Create a sample ZIP file for testing."""
    import zipfile
    zip_path = temp_dir / "test.zip"
    with zipfile.ZipFile(zip_path, 'w') as zf:
        zf.writestr("file1.txt", "Content of file 1")
        zf.writestr("subdir/file2.txt", "Content of file 2")
    return zip_path
