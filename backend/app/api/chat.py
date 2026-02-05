"""
AI Chat API endpoints.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Document
from ..services.ai_chat import get_chat_service


router = APIRouter(prefix="/api/chat", tags=["chat"])


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


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a message to the AI assistant with optional RAG.
    The assistant will retrieve relevant document context and generate a response.
    """
    chat_service = get_chat_service()
    
    result = await chat_service.chat(
        message=request.message,
        use_rag=request.use_rag,
        context_limit=request.context_limit,
        include_history=request.include_history
    )
    
    return result


@router.post("/summarize")
async def summarize_document(
    request: SummarizeRequest,
    db: Session = Depends(get_db)
):
    """
    Generate a summary of a specific document.
    """
    document = db.query(Document).filter(Document.id == request.document_id).first()
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
    request: QuestionRequest,
    db: Session = Depends(get_db)
):
    """
    Ask a specific question about a document.
    """
    document = db.query(Document).filter(Document.id == request.document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.text_content:
        raise HTTPException(status_code=400, detail="Document has no text content")
    
    chat_service = get_chat_service()
    answer = await chat_service.answer_about_document(
        question=request.question,
        document_text=document.text_content,
        document_name=document.file_name
    )
    
    return {
        "document_id": document.id,
        "document_name": document.file_name,
        "question": request.question,
        "answer": answer
    }


@router.get("/history")
async def get_chat_history():
    """
    Get the current conversation history.
    """
    chat_service = get_chat_service()
    return {
        "messages": chat_service.get_history(),
        "count": len(chat_service.conversation_history)
    }


@router.post("/clear")
async def clear_chat_history():
    """
    Clear the conversation history.
    """
    chat_service = get_chat_service()
    chat_service.clear_history()
    return {"status": "cleared"}
