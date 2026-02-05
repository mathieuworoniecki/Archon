"""
War Room Backend - SQLAlchemy Models
"""
from datetime import datetime
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
    UNKNOWN = "unknown"


class Scan(Base):
    """Scan job model."""
    __tablename__ = "scans"
    
    id = Column(Integer, primary_key=True, index=True)
    celery_task_id = Column(String(255), unique=True, index=True)
    path = Column(String(1024), nullable=False)
    status = Column(SQLEnum(ScanStatus), default=ScanStatus.PENDING)
    
    # Progress tracking
    total_files = Column(Integer, default=0)
    processed_files = Column(Integer, default=0)
    failed_files = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
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
    indexed_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    scan = relationship("Scan", back_populates="documents")


class ScanError(Base):
    """Scan error log model."""
    __tablename__ = "scan_errors"
    
    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id"), nullable=False)
    
    file_path = Column(String(1024), nullable=False)
    error_type = Column(String(255), nullable=False)
    error_message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    scan = relationship("Scan", back_populates="errors")


class Tag(Base):
    """Tag model for organizing favorites."""
    __tablename__ = "tags"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    color = Column(String(7), nullable=False, default="#3b82f6")  # Hex color
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    favorites = relationship("Favorite", secondary="favorite_tags", back_populates="tags")


class Favorite(Base):
    """Favorite document model."""
    __tablename__ = "favorites"
    
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, unique=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    document = relationship("Document", backref="favorite")
    tags = relationship("Tag", secondary="favorite_tags", back_populates="favorites")


class FavoriteTag(Base):
    """Association table for favorites and tags (many-to-many)."""
    __tablename__ = "favorite_tags"
    
    favorite_id = Column(Integer, ForeignKey("favorites.id", ondelete="CASCADE"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)

