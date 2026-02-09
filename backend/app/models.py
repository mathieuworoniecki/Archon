"""
Archon Backend - SQLAlchemy Models
"""
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from sqlalchemy import Column, Integer, String, Text, DateTime, Enum as SQLEnum, Float, ForeignKey
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
    path = Column(String(1024), nullable=False)
    label = Column(String(255), nullable=True)  # User-facing name, defaults to path basename
    status = Column(SQLEnum(ScanStatus), default=ScanStatus.PENDING)
    
    # Progress tracking
    total_files = Column(Integer, default=0)
    processed_files = Column(Integer, default=0)
    failed_files = Column(Integer, default=0)
    
    # Embedding option
    enable_embeddings = Column(Integer, default=0)  # 0 = disabled, 1 = enabled
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.now(timezone.utc))
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
    file_name = Column(String(255), nullable=False)
    file_type = Column(SQLEnum(DocumentType), default=DocumentType.UNKNOWN)
    file_size = Column(Integer, default=0)
    
    # Content
    text_content = Column(Text, nullable=True)
    text_length = Column(Integer, default=0)
    has_ocr = Column(Integer, default=0)  # Boolean as int for SQLite
    
    # External IDs
    meilisearch_id = Column(String(255), nullable=True, index=True)
    qdrant_ids = Column(Text, nullable=True)  # JSON array of chunk IDs
    
    # Timestamps
    file_modified_at = Column(DateTime, nullable=True)
    indexed_at = Column(DateTime, default=datetime.now(timezone.utc))
    
    # Archive info (if extracted from an archive)
    archive_path = Column(String(1024), nullable=True)  # e.g., "archive.zip/subdir/"
    
    # Chain of Proof - cryptographic hashes
    hash_md5 = Column(String(32), nullable=True, index=True)
    hash_sha256 = Column(String(64), nullable=True, index=True)
    
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
