"""
Archon Backend - SQLAlchemy Models
"""
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from sqlalchemy import BigInteger, Column, Integer, String, Text, DateTime, Enum as SQLEnum, Float, ForeignKey
from sqlalchemy.orm import relationship, DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


class ScanStatus(str, Enum):
    """Scan job status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DocumentType(str, Enum):
    """Document types."""
    PDF = "pdf"
    IMAGE = "image"
    TEXT = "text"
    VIDEO = "video"
    EMAIL = "email"
    UNKNOWN = "unknown"


class Scan(Base):
    """Scan job model."""
    __tablename__ = "scans"
    
    id = Column(Integer, primary_key=True, index=True)
    celery_task_id = Column(String(255), unique=True, index=True)
    path = Column(String(1024), nullable=False, index=True)
    label = Column(String(255), nullable=True)  # User-facing name, defaults to path basename
    status = Column(SQLEnum(ScanStatus), default=ScanStatus.PENDING)
    
    # Progress tracking
    # BigInteger: large corpus scans can exceed 32-bit integer ranges over time.
    total_files = Column(BigInteger, default=0)
    processed_files = Column(BigInteger, default=0)
    failed_files = Column(BigInteger, default=0)
    
    # Embedding option
    enable_embeddings = Column(Integer, default=0)  # 0 = disabled, 1 = enabled
    
    # Timestamps
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Error info
    error_message = Column(Text, nullable=True)
    
    # Relationships
    documents = relationship("Document", back_populates="scan", cascade="all, delete-orphan")
    errors = relationship("ScanError", back_populates="scan", cascade="all, delete-orphan")


class Document(Base):
    """Document metadata model."""
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id"), nullable=False)
    
    # File info
    file_path = Column(String(1024), nullable=False, index=True)
    file_name = Column(String(255), nullable=False, index=True)
    file_type = Column(SQLEnum(DocumentType), default=DocumentType.UNKNOWN, index=True)
    # BigInteger: individual files (videos, disk images, archives) can exceed 2GB.
    file_size = Column(BigInteger, default=0)
    
    # Content
    text_content = Column(Text, nullable=True)
    text_length = Column(BigInteger, default=0)
    has_ocr = Column(Integer, default=0)  # Boolean as int for SQLite
    
    # External IDs
    meilisearch_id = Column(String(255), nullable=True, index=True)
    qdrant_ids = Column(Text, nullable=True)  # JSON array of chunk IDs
    
    # Timestamps
    file_modified_at = Column(DateTime, nullable=True, index=True)
    indexed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Archive info (if extracted from an archive)
    archive_path = Column(String(1024), nullable=True)  # e.g., "archive.zip/subdir/"
    
    # Chain of Proof - cryptographic hashes
    hash_md5 = Column(String(32), nullable=True, index=True)
    hash_sha256 = Column(String(64), nullable=True, index=True)
    
    # Redaction detection
    redaction_status = Column(String(20), nullable=True, index=True)  # none, suspected, confirmed
    redaction_score = Column(Float, nullable=True)  # 0.0–1.0 confidence
    
    # Relationships
    scan = relationship("Scan", back_populates="documents")
    entities = relationship("Entity", back_populates="document", cascade="all, delete-orphan")


class Entity(Base):
    """Named entity extracted from documents."""
    __tablename__ = "entities"
    
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    
    # Entity info
    text = Column(String(255), nullable=False, index=True)  # "Jean Dupont"
    type = Column(String(50), nullable=False, index=True)   # PER, ORG, LOC, MISC
    count = Column(Integer, default=1)  # Occurrences in document
    start_char = Column(Integer, nullable=True)  # First occurrence position
    
    # Relationships
    document = relationship("Document", back_populates="entities")


class ScanError(Base):
    """Scan error log model."""
    __tablename__ = "scan_errors"
    
    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id"), nullable=False)
    
    file_path = Column(String(1024), nullable=False)
    error_type = Column(String(255), nullable=False)
    error_message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.now(timezone.utc))
    
    # Relationships
    scan = relationship("Scan", back_populates="errors")


class Tag(Base):
    """Tag model for organizing favorites."""
    __tablename__ = "tags"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    color = Column(String(7), nullable=False, default="#3b82f6")  # Hex color
    created_at = Column(DateTime, default=datetime.now(timezone.utc))
    
    # Relationships
    favorites = relationship("Favorite", secondary="favorite_tags", back_populates="tags")


class Favorite(Base):
    """Favorite document model."""
    __tablename__ = "favorites"
    
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, unique=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))
    
    # Relationships
    document = relationship("Document", backref="favorite")
    tags = relationship("Tag", secondary="favorite_tags", back_populates="favorites")


class FavoriteTag(Base):
    """Association table for favorites and tags (many-to-many)."""
    __tablename__ = "favorite_tags"
    
    favorite_id = Column(Integer, ForeignKey("favorites.id", ondelete="CASCADE"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)


class WatchlistRule(Base):
    """Saved monitoring query for recurring investigation checks."""
    __tablename__ = "watchlist_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    query = Column(String(512), nullable=False)
    project_path = Column(String(1024), nullable=True, index=True)
    file_types = Column(Text, nullable=True)  # JSON array
    enabled = Column(Integer, default=1, index=True)  # 1=enabled, 0=disabled
    frequency_minutes = Column(Integer, default=60)

    # Last execution snapshot
    last_checked_at = Column(DateTime, nullable=True)
    last_match_count = Column(Integer, default=0)
    last_run_status = Column(String(32), nullable=True)  # ok|error
    last_error = Column(Text, nullable=True)

    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class WatchlistResult(Base):
    """Execution result history for a watchlist rule."""
    __tablename__ = "watchlist_results"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(Integer, ForeignKey("watchlist_rules.id", ondelete="CASCADE"), nullable=False, index=True)
    checked_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    match_count = Column(Integer, default=0)
    top_document_ids = Column(Text, nullable=True)  # JSON array
    status = Column(String(32), nullable=False, default="ok")
    error_message = Column(Text, nullable=True)


class InvestigationTask(Base):
    """Operational investigation task linked to documents/projects."""
    __tablename__ = "investigation_tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(32), default="todo", index=True)  # todo|in_progress|blocked|done
    priority = Column(String(32), default="medium", index=True)  # low|medium|high|critical
    due_date = Column(DateTime, nullable=True, index=True)

    project_path = Column(String(1024), nullable=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True)
    assignee_username = Column(String(100), nullable=True, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class DeepAnalysisStatus(str, Enum):
    """Status for LangExtract deep analysis."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class DeepAnalysis(Base):
    """LangExtract deep analysis results for a document."""
    __tablename__ = "deep_analyses"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Structured results (JSON)
    extractions = Column(Text, nullable=True)      # [{class, text, attributes, start, end}]
    summary = Column(Text, nullable=True)           # LLM-generated document summary
    relationships = Column(Text, nullable=True)     # [{source, target, type, evidence}]

    # Metadata
    model_used = Column(String(100), nullable=True)  # e.g. "gemini-2.5-flash"
    status = Column(SQLEnum(DeepAnalysisStatus), default=DeepAnalysisStatus.PENDING)
    error_message = Column(Text, nullable=True)
    processing_time_ms = Column(Integer, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    document = relationship("Document", backref="deep_analysis")


class AuditAction(str, Enum):
    """Types of audit actions."""
    SCAN_STARTED = "scan_started"
    SCAN_COMPLETED = "scan_completed"
    DOCUMENT_INDEXED = "document_indexed"
    DOCUMENT_DELETED = "document_deleted"
    DOCUMENT_VIEWED = "document_viewed"
    SEARCH_PERFORMED = "search_performed"
    EXPORT_CREATED = "export_created"


class AuditLog(Base):
    """Audit log for chain of proof / traceability."""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    action = Column(SQLEnum(AuditAction), nullable=False, index=True)
    
    # Context
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    scan_id = Column(Integer, ForeignKey("scans.id", ondelete="SET NULL"), nullable=True)
    
    # Details
    details = Column(Text, nullable=True)  # JSON with additional info
    user_ip = Column(String(45), nullable=True)  # IPv6 compatible
    
    # Hash chain for tamper evidence (ISO 27037)
    entry_hash = Column(String(64), nullable=True)      # SHA256 of this entry
    previous_hash = Column(String(64), nullable=True)    # SHA256 of previous entry
    
    # Timestamp
    created_at = Column(DateTime, default=datetime.now(timezone.utc), index=True)


class UserRole(str, Enum):
    """User roles for RBAC."""
    ADMIN = "admin"
    ANALYST = "analyst"
    VIEWER = "viewer"


class User(Base):
    """User model for authentication."""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.ANALYST, nullable=False)
    is_active = Column(Integer, default=1)  # 1 = active, 0 = disabled
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.now(timezone.utc))
    last_login = Column(DateTime, nullable=True)
