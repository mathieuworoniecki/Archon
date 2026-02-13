"""
Watchlist API — recurring monitoring rules for new evidence.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import WatchlistRule, WatchlistResult, User, DocumentType
from ..schemas import (
    WatchlistRuleCreate,
    WatchlistRuleUpdate,
    WatchlistRuleOut,
    WatchlistRunResult,
)
from ..services.meilisearch import get_meilisearch_service
from ..utils.auth import get_current_user

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


def _encode_file_types(file_types: Optional[List[DocumentType]]) -> Optional[str]:
    if not file_types:
        return None
    return json.dumps([ft.value if hasattr(ft, "value") else str(ft) for ft in file_types])


def _decode_file_types(raw: Optional[str]) -> List[DocumentType]:
    if not raw:
        return []
    try:
        values = json.loads(raw)
        return [DocumentType(v) for v in values if v in {dt.value for dt in DocumentType}]
    except Exception:
        return []


def _to_rule_out(rule: WatchlistRule) -> WatchlistRuleOut:
    return WatchlistRuleOut(
        id=rule.id,
        name=rule.name,
        query=rule.query,
        project_path=rule.project_path,
        file_types=_decode_file_types(rule.file_types),
        enabled=bool(rule.enabled),
        frequency_minutes=rule.frequency_minutes,
        last_checked_at=rule.last_checked_at,
        last_match_count=rule.last_match_count or 0,
        last_run_status=rule.last_run_status,
        last_error=rule.last_error,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


@router.get("/", response_model=List[WatchlistRuleOut])
def list_watchlist_rules(
    enabled: Optional[bool] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(WatchlistRule).order_by(WatchlistRule.updated_at.desc())
    if enabled is not None:
        query = query.filter(WatchlistRule.enabled == (1 if enabled else 0))
    return [_to_rule_out(rule) for rule in query.all()]


@router.post("/", response_model=WatchlistRuleOut)
def create_watchlist_rule(
    payload: WatchlistRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = WatchlistRule(
        name=payload.name.strip(),
        query=payload.query.strip(),
        project_path=payload.project_path.strip() if payload.project_path else None,
        file_types=_encode_file_types(payload.file_types),
        enabled=1 if payload.enabled else 0,
        frequency_minutes=payload.frequency_minutes,
        created_by_user_id=current_user.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _to_rule_out(rule)


@router.patch("/{rule_id}", response_model=WatchlistRuleOut)
def update_watchlist_rule(
    rule_id: int,
    payload: WatchlistRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = db.query(WatchlistRule).filter(WatchlistRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Watchlist rule not found")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        rule.name = updates["name"].strip()
    if "query" in updates:
        rule.query = updates["query"].strip()
    if "project_path" in updates:
        rule.project_path = updates["project_path"].strip() if updates["project_path"] else None
    if "file_types" in updates:
        rule.file_types = _encode_file_types(updates["file_types"])
    if "enabled" in updates:
        rule.enabled = 1 if updates["enabled"] else 0
    if "frequency_minutes" in updates:
        rule.frequency_minutes = updates["frequency_minutes"]

    db.commit()
    db.refresh(rule)
    return _to_rule_out(rule)


@router.delete("/{rule_id}")
def delete_watchlist_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = db.query(WatchlistRule).filter(WatchlistRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Watchlist rule not found")
    db.delete(rule)
    db.commit()
    return {"status": "deleted", "rule_id": rule_id}


@router.post("/{rule_id}/run", response_model=WatchlistRunResult)
def run_watchlist_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = db.query(WatchlistRule).filter(WatchlistRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Watchlist rule not found")

    checked_at = datetime.now(timezone.utc)
    top_document_ids: List[int] = []
    status = "ok"
    error_message = None
    match_count = 0

    try:
        meili = get_meilisearch_service()
        response = meili.search(
            query=rule.query,
            limit=50,
            offset=0,
            file_types=[ft.value for ft in _decode_file_types(rule.file_types)] or None,
            scan_ids=None,
            project_path=rule.project_path,
        )
        hits = response.get("hits", []) if isinstance(response, dict) else []
        top_document_ids = [int(hit["id"]) for hit in hits if str(hit.get("id", "")).isdigit()]
        match_count = int(response.get("estimatedTotalHits", len(hits))) if isinstance(response, dict) else len(hits)
    except Exception as exc:
        status = "error"
        error_message = str(exc)

    rule.last_checked_at = checked_at
    rule.last_match_count = match_count
    rule.last_run_status = status
    rule.last_error = error_message
    db.add(
        WatchlistResult(
            rule_id=rule.id,
            checked_at=checked_at,
            match_count=match_count,
            top_document_ids=json.dumps(top_document_ids),
            status=status,
            error_message=error_message,
        )
    )
    db.commit()

    return WatchlistRunResult(
        rule_id=rule.id,
        checked_at=checked_at,
        match_count=match_count,
        status=status,
        top_document_ids=top_document_ids,
        error_message=error_message,
    )


@router.get("/{rule_id}/results", response_model=List[WatchlistRunResult])
def list_watchlist_results(
    rule_id: int,
    limit: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = db.query(WatchlistRule).filter(WatchlistRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Watchlist rule not found")

    rows = (
        db.query(WatchlistResult)
        .filter(WatchlistResult.rule_id == rule_id)
        .order_by(WatchlistResult.checked_at.desc())
        .limit(limit)
        .all()
    )
    results: List[WatchlistRunResult] = []
    for row in rows:
        try:
            doc_ids = json.loads(row.top_document_ids) if row.top_document_ids else []
        except Exception:
            doc_ids = []
        results.append(
            WatchlistRunResult(
                rule_id=row.rule_id,
                checked_at=row.checked_at,
                match_count=row.match_count,
                status=row.status,
                top_document_ids=doc_ids,
                error_message=row.error_message,
            )
        )
    return results
