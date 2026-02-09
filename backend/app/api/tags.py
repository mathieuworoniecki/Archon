"""
Archon Backend - Tags API Routes
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import Tag, Favorite
from ..schemas import TagCreate, TagOut, TagUpdate

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("/", response_model=List[TagOut])
def list_tags(db: Session = Depends(get_db)):
    """List all tags with favorite counts."""
    tags = db.query(Tag).all()
    
    result = []
    for tag in tags:
        result.append(TagOut(
            id=tag.id,
            name=tag.name,
            color=tag.color,
            created_at=tag.created_at,
            favorite_count=len(tag.favorites)
        ))
    
    return result


@router.post("/", response_model=TagOut)
def create_tag(
    tag: TagCreate,
    db: Session = Depends(get_db)
):
    """Create a new tag."""
    # Check if tag name already exists
    existing = db.query(Tag).filter(Tag.name == tag.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag name already exists")
    
    db_tag = Tag(
        name=tag.name,
        color=tag.color
    )
    
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    
    return TagOut(
        id=db_tag.id,
        name=db_tag.name,
        color=db_tag.color,
        created_at=db_tag.created_at,
        favorite_count=0
    )


@router.get("/{tag_id}", response_model=TagOut)
def get_tag(
    tag_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific tag."""
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    return TagOut(
        id=tag.id,
        name=tag.name,
        color=tag.color,
        created_at=tag.created_at,
        favorite_count=len(tag.favorites)
    )


@router.patch("/{tag_id}", response_model=TagOut)
def update_tag(
    tag_id: int,
    update: TagUpdate,
    db: Session = Depends(get_db)
):
    """Update a tag's name or color."""
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    if update.name is not None:
        # Check if new name conflicts with another tag
        existing = db.query(Tag).filter(Tag.name == update.name, Tag.id != tag_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Tag name already exists")
        tag.name = update.name
    
    if update.color is not None:
        tag.color = update.color
    
    db.commit()
    db.refresh(tag)
    
    return TagOut(
        id=tag.id,
        name=tag.name,
        color=tag.color,
        created_at=tag.created_at,
        favorite_count=len(tag.favorites)
    )


@router.delete("/{tag_id}")
def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db)
):
    """Delete a tag. This will remove the tag from all favorites."""
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    tag_name = tag.name
    db.delete(tag)
    db.commit()
    
    return {"status": "deleted", "tag_id": tag_id, "tag_name": tag_name}
