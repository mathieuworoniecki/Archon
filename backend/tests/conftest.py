"""
Archon Backend — Test Configuration (conftest.py)
Provides fixtures for test database, FastAPI test client, and auth helpers.
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
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-for-testing-only-must-be-long-enough"
os.environ["DISABLE_AUTH"] = "false"
os.environ["SCAN_ROOT_PATH"] = "/tmp"
os.environ["DOCUMENTS_PATH"] = "/tmp"

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
def db_engine():
    """Create isolated engine for each test."""
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session(db_engine):
    """Create an isolated database session for each test."""
    TestSession = sessionmaker(bind=db_engine)
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


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


# ── Auth Fixtures ──────────────────────────────────────────────────

@pytest.fixture
def admin_user(client):
    """Register the bootstrap admin and return (user_data, headers)."""
    resp = client.post("/api/auth/register", json={
        "username": "testadmin",
        "password": "Str0ngP@ss!",
        "email": "admin@test.com"
    })
    assert resp.status_code in (200, 201), f"Admin registration failed: {resp.text}"
    user_data = resp.json()

    login_resp = client.post("/api/auth/login", json={
        "username": "testadmin",
        "password": "Str0ngP@ss!",
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return user_data, headers


@pytest.fixture
def admin_headers(admin_user):
    """Auth headers for the admin user."""
    return admin_user[1]


@pytest.fixture
def analyst_user(client, admin_headers):
    """Create an analyst user via admin-register and return (user_data, headers)."""
    resp = client.post("/api/auth/admin-register", json={
        "username": "testanalyst",
        "password": "An@lyst123!",
        "email": "analyst@test.com"
    }, headers=admin_headers)
    assert resp.status_code in (200, 201), f"Analyst registration failed: {resp.text}"
    user_data = resp.json()

    login_resp = client.post("/api/auth/login", json={
        "username": "testanalyst",
        "password": "An@lyst123!",
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return user_data, headers


@pytest.fixture
def analyst_headers(analyst_user):
    """Auth headers for the analyst user."""
    return analyst_user[1]


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
