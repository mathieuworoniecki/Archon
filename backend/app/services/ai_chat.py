"""
AI Chat Service with RAG (Retrieval-Augmented Generation)
Uses Gemini Flash for generation and semantic search for context retrieval.
"""
import google.generativeai as genai
from typing import List, Dict, Any, Optional
from datetime import datetime

from ..config import get_settings
from .qdrant import get_qdrant_service
from .embeddings import get_embeddings_service

settings = get_settings()


class ChatMessage:
    """Represents a chat message."""
    def __init__(self, role: str, content: str, timestamp: Optional[datetime] = None):
        self.role = role  # "user" or "assistant"
        self.content = content
        self.timestamp = timestamp or datetime.utcnow()
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp.isoformat()
        }


class DocumentContext:
    """Retrieved document context for RAG."""
    def __init__(self, doc_id: int, file_name: str, snippet: str, score: float):
        self.doc_id = doc_id
        self.file_name = file_name
        self.snippet = snippet
        self.score = score
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "document_id": self.doc_id,
            "file_name": self.file_name,
            "snippet": self.snippet[:500] + "..." if len(self.snippet) > 500 else self.snippet,
            "relevance_score": round(self.score, 3)
        }


class AIChatService:
    """
    AI Chat service with RAG capabilities.
    Retrieves relevant document context before answering questions.
    """
    
    SYSTEM_PROMPT = """Tu es un assistant d'investigation numérique expert. Tu aides les enquêteurs à analyser des documents et à trouver des informations pertinentes.

Règles importantes:
1. Base TOUJOURS tes réponses sur les documents fournis comme contexte
2. Si tu n'as pas assez d'informations dans le contexte, dis-le clairement
3. Cite les documents sources quand tu mentionnes des informations spécifiques
4. Sois précis et factuel, évite les spéculations
5. Réponds en français
6. Si on te demande de résumer, sois concis mais complet

Format de citation: [Document: nom_du_fichier]"""

    def __init__(self):
        genai.configure(api_key=settings.gemini_api_key)
        self.model = genai.GenerativeModel('gemini-2.0-flash')
        self.qdrant_service = get_qdrant_service()
        self.embeddings_service = get_embeddings_service()
        self.conversation_history: List[ChatMessage] = []
    
    def _retrieve_context(self, query: str, limit: int = 5) -> List[DocumentContext]:
        """
        Retrieve relevant document snippets using semantic search.
        """
        try:
            # Get query embedding
            query_embedding = self.embeddings_service.get_query_embedding(query)
            
            # Search in Qdrant
            results = self.qdrant_service.search(
                query_vector=query_embedding,
                limit=limit
            )
            
            contexts = []
            for result in results:
                contexts.append(DocumentContext(
                    doc_id=result.get("document_id", 0),
                    file_name=result.get("file_name", "unknown"),
                    snippet=result.get("text", ""),
                    score=result.get("score", 0.0)
                ))
            
            return contexts
        except Exception as e:
            print(f"Context retrieval error: {e}")
            return []
    
    def _build_context_prompt(self, contexts: List[DocumentContext]) -> str:
        """Build context section for the prompt."""
        if not contexts:
            return "Aucun document pertinent trouvé pour cette requête."
        
        context_parts = ["DOCUMENTS DE RÉFÉRENCE:"]
        for i, ctx in enumerate(contexts, 1):
            context_parts.append(f"\n--- Document {i}: {ctx.file_name} (pertinence: {ctx.score:.2f}) ---")
            context_parts.append(ctx.snippet[:1000])  # Limit snippet size
        
        return "\n".join(context_parts)
    
    def _build_conversation_context(self, max_messages: int = 10) -> str:
        """Build conversation history context."""
        if not self.conversation_history:
            return ""
        
        history = self.conversation_history[-max_messages:]
        context = ["HISTORIQUE DE CONVERSATION:"]
        for msg in history:
            role_label = "Utilisateur" if msg.role == "user" else "Assistant"
            context.append(f"{role_label}: {msg.content[:500]}")
        
        return "\n".join(context)
    
    async def chat(
        self,
        message: str,
        use_rag: bool = True,
        context_limit: int = 5,
        include_history: bool = True
    ) -> Dict[str, Any]:
        """
        Process a chat message with optional RAG.
        
        Args:
            message: User message
            use_rag: Whether to retrieve document context
            context_limit: Max number of context documents
            include_history: Include conversation history
        
        Returns:
            Dict with response, contexts, and metadata
        """
        # Add user message to history
        user_msg = ChatMessage(role="user", content=message)
        self.conversation_history.append(user_msg)
        
        # Retrieve document context if RAG enabled
        contexts = []
        if use_rag:
            contexts = self._retrieve_context(message, limit=context_limit)
        
        # Build the full prompt
        prompt_parts = [self.SYSTEM_PROMPT, ""]
        
        if include_history and len(self.conversation_history) > 1:
            prompt_parts.append(self._build_conversation_context())
            prompt_parts.append("")
        
        if contexts:
            prompt_parts.append(self._build_context_prompt(contexts))
            prompt_parts.append("")
        
        prompt_parts.append(f"QUESTION DE L'UTILISATEUR: {message}")
        prompt_parts.append("")
        prompt_parts.append("RÉPONSE:")
        
        full_prompt = "\n".join(prompt_parts)
        
        # Generate response
        try:
            response = self.model.generate_content(full_prompt)
            assistant_response = response.text
        except Exception as e:
            assistant_response = f"Erreur lors de la génération de la réponse: {str(e)}"
        
        # Add assistant response to history
        assistant_msg = ChatMessage(role="assistant", content=assistant_response)
        self.conversation_history.append(assistant_msg)
        
        return {
            "response": assistant_response,
            "contexts": [ctx.to_dict() for ctx in contexts],
            "message_count": len(self.conversation_history),
            "rag_enabled": use_rag
        }
    
    async def summarize_document(self, document_text: str, document_name: str) -> str:
        """
        Generate a summary of a document.
        """
        prompt = f"""Résume le document suivant de manière concise mais complète.
Mentionne les points clés, les dates importantes, les personnes mentionnées et les informations cruciales.

Document: {document_name}

Contenu:
{document_text[:10000]}

RÉSUMÉ:"""
        
        try:
            response = self.model.generate_content(prompt)
            return response.text
        except Exception as e:
            return f"Erreur lors de la génération du résumé: {str(e)}"
    
    async def answer_about_document(
        self,
        question: str,
        document_text: str,
        document_name: str
    ) -> str:
        """
        Answer a specific question about a document.
        """
        prompt = f"""{self.SYSTEM_PROMPT}

DOCUMENT: {document_name}
CONTENU:
{document_text[:8000]}

QUESTION: {question}

RÉPONSE:"""
        
        try:
            response = self.model.generate_content(prompt)
            return response.text
        except Exception as e:
            return f"Erreur: {str(e)}"
    
    def clear_history(self):
        """Clear conversation history."""
        self.conversation_history = []
    
    def get_history(self) -> List[Dict[str, Any]]:
        """Get conversation history as list of dicts."""
        return [msg.to_dict() for msg in self.conversation_history]


# Singleton instance
_chat_service: Optional[AIChatService] = None


def get_chat_service() -> AIChatService:
    """Get the AI chat service singleton."""
    global _chat_service
    if _chat_service is None:
        _chat_service = AIChatService()
    return _chat_service
