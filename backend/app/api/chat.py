"""
AI Chat API endpoints.
Session-based: each browser tab gets its own isolated conversation history.
"""
import logging
import json
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Document
from ..services.ai_chat import get_chat_service, clear_session
from ..utils.rate_limiter import chat_limiter, document_ai_limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    use_rag: bool = True
    context_limit: int = 5
    include_history: bool = True


class ChatResponse(BaseModel):
    response: str
    contexts: List[dict]
    message_count: int
    rag_enabled: bool


class SummarizeRequest(BaseModel):
    document_id: int


class QuestionRequest(BaseModel):
    document_id: int
    question: str


def _get_session_id(x_session_id: Optional[str] = Header(None)) -> str:
    """Extract session ID from request header, fallback to 'default'."""
    return x_session_id or "default"


@router.post("/", response_model=ChatResponse)
async def chat(
    request: Request,
    body: ChatRequest,
    session_id: str = Depends(_get_session_id)
):
    """
    Send a message to the AI assistant with optional RAG.
    Session isolated via X-Session-Id header. Rate limited.
    """
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
    session_id: str = Depends(_get_session_id)
):
    """
    Stream chat response via SSE. Each event is a JSON object:
    - {"token": "text chunk"} for partial responses
    - {"done": true, "contexts": [...]} when complete
    """
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
    db: Session = Depends(get_db)
):
    """
    Generate a summary of a specific document. Rate limited.
    """
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
    db: Session = Depends(get_db)
):
    """
    Ask a specific question about a document. Rate limited.
    """
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
async def get_chat_history(session_id: str = Depends(_get_session_id)):
    """
    Get the conversation history for this session.
    """
    chat_service = get_chat_service(session_id)
    return {
        "messages": chat_service.get_history(),
        "count": len(chat_service.conversation_history)
    }


@router.post("/clear")
async def clear_chat_history(session_id: str = Depends(_get_session_id)):
    """
    Clear the conversation history for this session.
    """
    clear_session(session_id)
    return {"status": "cleared"}
