"""
Archon Backend - Favorites API Routes
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Favorite, Tag, Document
from ..schemas import (
    FavoriteCreate, FavoriteOut, FavoriteUpdate, 
    FavoriteListResponse, TagOut
)
from ..services.ai_chat import get_chat_service

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.get("/", response_model=FavoriteListResponse)
def list_favorites(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    tag_ids: Optional[List[int]] = Query(None),
    db: Session = Depends(get_db)
):
    """List all favorites with optional tag filtering."""
    query = db.query(Favorite).options(
        joinedload(Favorite.tags),
        joinedload(Favorite.document)
    )
    
    # Filter by tags if provided
    if tag_ids:
        query = query.filter(Favorite.tags.any(Tag.id.in_(tag_ids)))
    
    total = query.count()
    favorites = query.order_by(Favorite.created_at.desc()).offset(skip).limit(limit).all()
    
    # Convert to output format with tag counts
    result = []
    for fav in favorites:
        fav_out = FavoriteOut(
            id=fav.id,
            document_id=fav.document_id,
            notes=fav.notes,
            created_at=fav.created_at,
            updated_at=fav.updated_at,
            tags=[TagOut(
                id=t.id,
                name=t.name,
                color=t.color,
                created_at=t.created_at,
                favorite_count=len(t.favorites)
            ) for t in fav.tags],
            document=fav.document
        )
        result.append(fav_out)
    
    return FavoriteListResponse(favorites=result, total=total)


@router.post("/", response_model=FavoriteOut)
def create_favorite(
    favorite: FavoriteCreate,
    db: Session = Depends(get_db)
):
    """Add a document to favorites."""
    # Check if document exists
    document = db.query(Document).filter(Document.id == favorite.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Check if already favorited
    existing = db.query(Favorite).filter(Favorite.document_id == favorite.document_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Document already in favorites")
    
    # Create favorite
    db_favorite = Favorite(
        document_id=favorite.document_id,
        notes=favorite.notes
    )
    
    # Add tags if provided
    if favorite.tag_ids:
        tags = db.query(Tag).filter(Tag.id.in_(favorite.tag_ids)).all()
        db_favorite.tags = tags
    
    db.add(db_favorite)
    db.commit()
    db.refresh(db_favorite)
    
    return FavoriteOut(
        id=db_favorite.id,
        document_id=db_favorite.document_id,
        notes=db_favorite.notes,
        created_at=db_favorite.created_at,
        updated_at=db_favorite.updated_at,
        tags=[TagOut(
            id=t.id,
            name=t.name,
            color=t.color,
            created_at=t.created_at,
            favorite_count=len(t.favorites)
        ) for t in db_favorite.tags],
        document=db_favorite.document
    )


@router.get("/{document_id}", response_model=FavoriteOut)
def get_favorite_by_document(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Get favorite entry for a specific document."""
    favorite = db.query(Favorite).options(
        joinedload(Favorite.tags),
        joinedload(Favorite.document)
    ).filter(Favorite.document_id == document_id).first()
    
    if not favorite:
        raise HTTPException(status_code=404, detail="Document not in favorites")
    
    return FavoriteOut(
        id=favorite.id,
        document_id=favorite.document_id,
        notes=favorite.notes,
        created_at=favorite.created_at,
        updated_at=favorite.updated_at,
        tags=[TagOut(
            id=t.id,
            name=t.name,
            color=t.color,
            created_at=t.created_at,
            favorite_count=len(t.favorites)
        ) for t in favorite.tags],
        document=favorite.document
    )


@router.patch("/{document_id}", response_model=FavoriteOut)
def update_favorite(
    document_id: int,
    update: FavoriteUpdate,
    db: Session = Depends(get_db)
):
    """Update notes or tags for a favorite."""
    favorite = db.query(Favorite).options(
        joinedload(Favorite.tags)
    ).filter(Favorite.document_id == document_id).first()
    
    if not favorite:
        raise HTTPException(status_code=404, detail="Document not in favorites")
    
    if update.notes is not None:
        favorite.notes = update.notes
    
    if update.tag_ids is not None:
        tags = db.query(Tag).filter(Tag.id.in_(update.tag_ids)).all()
        favorite.tags = tags
    
    db.commit()
    db.refresh(favorite)
    
    return FavoriteOut(
        id=favorite.id,
        document_id=favorite.document_id,
        notes=favorite.notes,
        created_at=favorite.created_at,
        updated_at=favorite.updated_at,
        tags=[TagOut(
            id=t.id,
            name=t.name,
            color=t.color,
            created_at=t.created_at,
            favorite_count=len(t.favorites)
        ) for t in favorite.tags],
        document=favorite.document
    )


@router.delete("/{document_id}")
def delete_favorite(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Remove a document from favorites."""
    favorite = db.query(Favorite).filter(Favorite.document_id == document_id).first()
    
    if not favorite:
        raise HTTPException(status_code=404, detail="Document not in favorites")
    
    db.delete(favorite)
    db.commit()
    
    return {"status": "removed", "document_id": document_id}


@router.get("/check/{document_id}")
def check_favorite_status(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Check if a document is in favorites."""
    favorite = db.query(Favorite).filter(Favorite.document_id == document_id).first()
    
    return {
        "document_id": document_id,
        "is_favorite": favorite is not None,
        "favorite_id": favorite.id if favorite else None
    }


@router.post("/synthesize")
async def synthesize_favorites(
    db: Session = Depends(get_db)
):
    """Generate an AI synthesis of all favorited documents."""
    favorites = db.query(Favorite).options(
        joinedload(Favorite.document)
    ).all()
    
    if not favorites:
        return {"synthesis": "No favorites to synthesize.", "document_count": 0}
    
    # Build context from favorites
    documents_context = []
    for fav in favorites:
        doc = fav.document
        if doc:
            doc_info = f"**{doc.file_name}** ({doc.file_type})"
            if fav.notes:
                doc_info += f"\n  Notes: {fav.notes}"
            if doc.text_content:
                # Truncate content to avoid overwhelming the model
                content_preview = doc.text_content[:2000]
                if len(doc.text_content) > 2000:
                    content_preview += "..."
                doc_info += f"\n  Content: {content_preview}"
            documents_context.append(doc_info)
    
    # Create synthesis prompt (bilingual)
    locale = "en"  # Default; could be passed from frontend Accept-Language header
    if locale == "en":
        prompt = f"""Here are the {len(favorites)} documents marked as favorites in this investigation:

{chr(10).join(documents_context)}

Generate a concise synthesis of these documents:
1. Key points and important information found
2. Connections or links between documents
3. Questions or leads to explore

Be factual and precise."""
    else:
        prompt = f"""Voici les {len(favorites)} documents marqués comme favoris dans cette investigation:

{chr(10).join(documents_context)}

Génère une synthèse concise de ces documents:
1. Points clés et informations importantes trouvées
2. Connexions ou liens entre les documents
3. Questions ou pistes à explorer

Sois factuel et précis."""
    
    try:
        chat_service = get_chat_service()
        response = await chat_service.chat(message=prompt, use_rag=False)
        return {
            "synthesis": response.get("response", "Generation error"),
            "document_count": len(favorites)
        }
    except Exception as e:
        return {
            "synthesis": f"Error during synthesis: {str(e)}",
            "document_count": len(favorites),
            "error": True
        }
