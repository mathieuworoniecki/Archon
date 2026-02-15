"""
AI Chat API endpoints.
Session-based: each browser tab gets its own isolated conversation history.
"""
import logging
import json
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..models import Document, User
from ..services.ai_chat import get_chat_service, clear_session
from ..utils.rate_limiter import chat_limiter, document_ai_limiter
from ..utils.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])
settings = get_settings()


def _ensure_ai_configured() -> None:
    # Fail soft: users should get a clear actionable error instead of a 500
    # when Gemini is not configured.
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="AI non configuree: definissez GEMINI_API_KEY dans .env (ou dans les variables d'environnement).",
        )


class ChatRequest(BaseModel):
    message: str
    use_rag: bool = True
    context_limit: int = Field(8, ge=1, le=20)
    include_history: bool = True


class ChatResponse(BaseModel):
    response: str
    contexts: List[dict]
    message_count: int
    rag_enabled: bool


class ChatConfigOut(BaseModel):
    enabled: bool
    reason: Optional[str] = None


class SummarizeRequest(BaseModel):
    document_id: int


class QuestionRequest(BaseModel):
    document_id: int
    question: str


def _get_session_id(x_session_id: Optional[str] = Header(None)) -> str:
    """Extract session ID from request header, fallback to 'default'."""
    return x_session_id or "default"


@router.get("/config", response_model=ChatConfigOut)
async def chat_config(current_user: User = Depends(get_current_user)):
    """
    Return whether the chat service is configured/enabled.

    The UI uses this to disable chat gracefully when GEMINI_API_KEY is missing,
    instead of failing on the first request.
    """
    if not settings.gemini_api_key:
        return ChatConfigOut(
            enabled=False,
            reason="AI non configuree: definissez GEMINI_API_KEY dans .env (ou dans les variables d'environnement).",
        )
    return ChatConfigOut(enabled=True, reason=None)


@router.post("/", response_model=ChatResponse)
async def chat(
    request: Request,
    body: ChatRequest,
    session_id: str = Depends(_get_session_id),
    current_user: User = Depends(get_current_user)
):
    """
    Send a message to the AI assistant with optional RAG.
    Session isolated via X-Session-Id header. Rate limited.
    """
    _ensure_ai_configured()
    chat_limiter.check(request)
    chat_service = get_chat_service(session_id)
    
    result = await chat_service.chat(
        message=body.message,
        use_rag=body.use_rag,
        context_limit=body.context_limit,
        include_history=body.include_history
    )
    
    return result


@router.post("/stream")
async def chat_stream(
    request: Request,
    body: ChatRequest,
    session_id: str = Depends(_get_session_id),
    current_user: User = Depends(get_current_user)
):
    """
    Stream chat response via SSE. Each event is a JSON object:
    - {"token": "text chunk"} for partial responses
    - {"done": true, "contexts": [...]} when complete
    """
    _ensure_ai_configured()
    chat_limiter.check(request)
    chat_service = get_chat_service(session_id)

    async def event_generator():
        async for chunk in chat_service.stream_chat(
            message=body.message,
            use_rag=body.use_rag,
            context_limit=body.context_limit,
            include_history=body.include_history
        ):
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/summarize")
async def summarize_document(
    request: Request,
    body: SummarizeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate a summary of a specific document. Rate limited.
    """
    _ensure_ai_configured()
    document_ai_limiter.check(request)
    document = db.query(Document).filter(Document.id == body.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.text_content:
        raise HTTPException(status_code=400, detail="Document has no text content")
    
    chat_service = get_chat_service()
    summary = await chat_service.summarize_document(
        document_text=document.text_content,
        document_name=document.file_name
    )
    
    return {
        "document_id": document.id,
        "document_name": document.file_name,
        "summary": summary
    }


@router.post("/question")
async def ask_question_about_document(
    request: Request,
    body: QuestionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Ask a specific question about a document. Rate limited.
    """
    _ensure_ai_configured()
    document_ai_limiter.check(request)
    document = db.query(Document).filter(Document.id == body.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.text_content:
        raise HTTPException(status_code=400, detail="Document has no text content")
    
    chat_service = get_chat_service()
    answer = await chat_service.answer_about_document(
        question=body.question,
        document_text=document.text_content,
        document_name=document.file_name
    )
    
    return {
        "document_id": document.id,
        "document_name": document.file_name,
        "question": body.question,
        "answer": answer
    }


@router.get("/history")
async def get_chat_history(session_id: str = Depends(_get_session_id), current_user: User = Depends(get_current_user)):
    """
    Get the conversation history for this session.
    """
    chat_service = get_chat_service(session_id)
    return {
        "messages": chat_service.get_history(),
        "count": len(chat_service.conversation_history)
    }


@router.post("/clear")
async def clear_chat_history(session_id: str = Depends(_get_session_id), current_user: User = Depends(get_current_user)):
    """
    Clear the conversation history for this session.
    """
    clear_session(session_id)
    return {"status": "cleared"}
