"""
Archon Backend - Admin Panel API Routes
Admin-only endpoints for user management.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, UserRole
from ..utils.auth import require_role, hash_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Schemas ──────────────────────────────────────────────

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: Optional[str] = None
    role: str
    is_active: bool
    created_at: Optional[str] = None
    last_login: Optional[str] = None


class UserListResponse(BaseModel):
    users: list[UserOut]
    total: int


class UserRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(admin|analyst|viewer)$")


class UserActiveUpdate(BaseModel):
    is_active: bool


class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=6)
    email: Optional[str] = None
    role: str = Field(default="analyst", pattern="^(admin|analyst|viewer)$")


# ── Endpoints ────────────────────────────────────────────

@router.get("/users", response_model=UserListResponse)
async def list_users(
    search: Optional[str] = None,
    role: Optional[str] = Query(None, pattern="^(admin|analyst|viewer)$"),
    is_active: Optional[bool] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """List all users with optional filtering. Admin only."""
    query = db.query(User)

    if search:
        query = query.filter(
            User.username.ilike(f"%{search}%")
        )
    if role:
        query = query.filter(User.role == UserRole(role))
    if is_active is not None:
        query = query.filter(User.is_active == (1 if is_active else 0))

    total = query.count()
    users = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()

    return UserListResponse(
        users=[
            UserOut(
                id=u.id,
                username=u.username,
                email=u.email,
                role=u.role.value,
                is_active=bool(u.is_active),
                created_at=u.created_at.isoformat() if u.created_at else None,
                last_login=u.last_login.isoformat() if u.last_login else None,
            )
            for u in users
        ],
        total=total,
    )


@router.get("/users/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Get a single user by ID. Admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role.value,
        is_active=bool(user.is_active),
        created_at=user.created_at.isoformat() if user.created_at else None,
        last_login=user.last_login.isoformat() if user.last_login else None,
    )


@router.patch("/users/{user_id}/role", response_model=UserOut)
async def update_user_role(
    user_id: int,
    body: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Update a user's role. Admin only. Cannot demote yourself."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role",
        )

    user.role = UserRole(body.role)
    db.commit()
    db.refresh(user)

    logger.info(
        "Admin '%s' changed role of user '%s' to '%s'",
        current_user.username, user.username, body.role,
    )

    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role.value,
        is_active=bool(user.is_active),
        created_at=user.created_at.isoformat() if user.created_at else None,
        last_login=user.last_login.isoformat() if user.last_login else None,
    )


@router.patch("/users/{user_id}/active", response_model=UserOut)
async def update_user_active(
    user_id: int,
    body: UserActiveUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Activate or deactivate a user. Admin only. Cannot deactivate yourself."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    user.is_active = 1 if body.is_active else 0
    db.commit()
    db.refresh(user)

    action = "activated" if body.is_active else "deactivated"
    logger.info(
        "Admin '%s' %s user '%s'",
        current_user.username, action, user.username,
    )

    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role.value,
        is_active=bool(user.is_active),
        created_at=user.created_at.isoformat() if user.created_at else None,
        last_login=user.last_login.isoformat() if user.last_login else None,
    )


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Create a new user with a specific role. Admin only."""
    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=UserRole(body.role),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    logger.info(
        "Admin '%s' created user '%s' (role=%s)",
        current_user.username, user.username, body.role,
    )

    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role.value,
        is_active=bool(user.is_active),
        created_at=user.created_at.isoformat() if user.created_at else None,
        last_login=None,
    )


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Delete a user permanently. Admin only. Cannot delete yourself."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )

    username = user.username
    db.delete(user)
    db.commit()

    logger.info(
        "Admin '%s' deleted user '%s'",
        current_user.username, username,
    )
