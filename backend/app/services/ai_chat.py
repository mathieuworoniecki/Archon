"""
AI Chat Service with RAG (Retrieval-Augmented Generation)
Uses Gemini Flash for generation and semantic search for context retrieval.
"""
import logging
import threading
import time as _time
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

from ..config import get_settings
from .qdrant import get_qdrant_service
from .embeddings import get_embeddings_service
from .reranker import get_reranker_service

settings = get_settings()

try:
    from google import genai as google_genai
except Exception:  # pragma: no cover - fallback path for legacy environments
    google_genai = None

legacy_genai = None


class ChatMessage:
    """Represents a chat message."""
    def __init__(self, role: str, content: str, timestamp: Optional[datetime] = None):
        self.role = role  # "user" or "assistant"
        self.content = content
        self.timestamp = timestamp or datetime.now(timezone.utc)
    
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
    
    SYSTEM_PROMPTS = {
        "fr": """Tu es un assistant d'investigation numérique expert. Tu aides les enquêteurs à analyser des documents et à trouver des informations pertinentes.

Règles importantes:
1. Base TOUJOURS tes réponses sur les documents fournis comme contexte
2. Si tu n'as pas assez d'informations dans le contexte, dis-le clairement
3. Cite les documents sources quand tu mentionnes des informations spécifiques
4. Sois précis et factuel, évite les spéculations
5. Réponds en français
6. Si on te demande de résumer, sois concis mais complet
7. Si les documents fournis sont insuffisants, réponds EXACTEMENT: "Je n'ai pas trouvé cette information dans les documents."

Format de citation: [Document: nom_du_fichier]""",
        "en": """You are an expert digital investigation assistant. You help investigators analyze documents and find relevant information.

Important rules:
1. ALWAYS base your answers on the documents provided as context
2. If you don't have enough information in the context, say so clearly
3. Cite source documents when you mention specific information
4. Be precise and factual, avoid speculation
5. Answer in English
6. If asked to summarize, be concise but comprehensive
7. If the provided documents are insufficient, answer EXACTLY: "I could not find this information in the documents."

Citation format: [Document: file_name]"""
    }
    NO_CONTEXT_RESPONSES = {
        "fr": "Je n'ai pas trouvé cette information dans les documents.",
        "en": "I could not find this information in the documents.",
    }

    def _get_system_prompt(self, locale: str = "fr") -> str:
        return self.SYSTEM_PROMPTS.get(locale, self.SYSTEM_PROMPTS["fr"])

    def _get_no_context_response(self, locale: str = "fr") -> str:
        return self.NO_CONTEXT_RESPONSES.get(locale, self.NO_CONTEXT_RESPONSES["fr"])

    def __init__(self):
        global legacy_genai
        self.model_name = "gemini-2.0-flash"
        self._use_legacy_sdk = False

        if google_genai is not None:
            self.client = google_genai.Client(api_key=settings.gemini_api_key)
        else:
            if legacy_genai is None:
                try:
                    import google.generativeai as legacy_genai_module
                    legacy_genai = legacy_genai_module
                except Exception as exc:
                    raise RuntimeError("No Gemini SDK available. Install google-genai.") from exc
            self._use_legacy_sdk = True
            legacy_genai.configure(api_key=settings.gemini_api_key)
            self.model = legacy_genai.GenerativeModel(self.model_name)
            logger.warning("google-genai unavailable, falling back to deprecated google-generativeai SDK")

        self.qdrant_service = get_qdrant_service()
        self.embeddings_service = get_embeddings_service()
        self.conversation_history: List[ChatMessage] = []

    def _generate_text(self, prompt: str) -> str:
        if self._use_legacy_sdk:
            response = self.model.generate_content(prompt)
            return response.text

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
        )
        return response.text or ""

    def _stream_generated_text(self, prompt: str):
        if self._use_legacy_sdk:
            response = self.model.generate_content(prompt, stream=True)
            for chunk in response:
                text = getattr(chunk, "text", None)
                if text:
                    yield text
            return

        stream = self.client.models.generate_content_stream(
            model=self.model_name,
            contents=prompt,
        )
        for chunk in stream:
            text = getattr(chunk, "text", None)
            if text:
                yield text
    
    def _retrieve_context(self, query: str, limit: int = 8) -> List[DocumentContext]:
        """
        Retrieve relevant document snippets using semantic search.
        """
        try:
            reranker = get_reranker_service()
            retrieval_limit = limit
            if reranker.is_enabled():
                retrieval_limit = max(retrieval_limit, reranker.top_n())

            # Get query embedding
            query_embedding = self.embeddings_service.get_query_embedding(query)
            
            # Search in Qdrant
            results = self.qdrant_service.search(
                query_embedding=query_embedding,
                limit=retrieval_limit,
                use_mmr=True,
                mmr_lambda=0.68,
                candidate_multiplier=18,
                min_score=0.25,
            )
            
            contexts = []
            for result in results:
                contexts.append(DocumentContext(
                    doc_id=result.get("document_id", 0),
                    file_name=result.get("file_name", "unknown"),
                    snippet=result.get("chunk_text", ""),
                    score=result.get("score", 0.0)
                ))

            if reranker.is_enabled() and len(contexts) > 1:
                contexts, scores = reranker.rerank_items(
                    query,
                    contexts,
                    get_id=lambda ctx: int(ctx.doc_id),
                    get_text=lambda ctx: f"{ctx.file_name}\n{ctx.snippet}",
                )
                if scores:
                    for ctx in contexts:
                        if ctx.doc_id in scores:
                            ctx.score = scores[ctx.doc_id]

                out_k = max(1, min(limit, reranker.top_k_out() or limit))
                return contexts[:out_k]

            return contexts[:limit]
        except Exception as e:
            logger.error("Context retrieval error: %s", e)
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
        context_limit: int = 8,
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
            if not contexts:
                assistant_response = self._get_no_context_response("fr")
                assistant_msg = ChatMessage(role="assistant", content=assistant_response)
                self.conversation_history.append(assistant_msg)
                return {
                    "response": assistant_response,
                    "contexts": [],
                    "message_count": len(self.conversation_history),
                    "rag_enabled": use_rag
                }
        
        # Build the full prompt
        prompt_parts = [self._get_system_prompt(), ""]
        
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
            assistant_response = self._generate_text(full_prompt)
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

    async def stream_chat(
        self,
        message: str,
        use_rag: bool = True,
        context_limit: int = 8,
        include_history: bool = True
    ):
        """
        Stream a chat response token by token.
        Yields dicts: {"token": "..."} for each chunk, then {"done": true, "contexts": [...]}
        """

        # Add user message to history
        user_msg = ChatMessage(role="user", content=message)
        self.conversation_history.append(user_msg)

        # Retrieve document context if RAG enabled
        contexts = []
        if use_rag:
            contexts = self._retrieve_context(message, limit=context_limit)
            if not contexts:
                fallback = self._get_no_context_response("fr")
                yield {"token": fallback}
                assistant_msg = ChatMessage(role="assistant", content=fallback)
                self.conversation_history.append(assistant_msg)
                yield {
                    "done": True,
                    "contexts": [],
                    "message_count": len(self.conversation_history),
                }
                return

        # Build the full prompt (same logic as chat)
        prompt_parts = [self._get_system_prompt(), ""]

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

        # Stream response
        full_response = ""
        try:
            for token in self._stream_generated_text(full_prompt):
                full_response += token
                yield {"token": token}
        except Exception as e:
            error_msg = f"Erreur: {str(e)}"
            full_response = error_msg
            yield {"token": error_msg}

        # Store in history
        assistant_msg = ChatMessage(role="assistant", content=full_response)
        self.conversation_history.append(assistant_msg)

        # Final event with contexts
        yield {
            "done": True,
            "contexts": [ctx.to_dict() for ctx in contexts],
            "message_count": len(self.conversation_history),
        }
    
    async def summarize_document(self, document_text: str, document_name: str, locale: str = "fr") -> str:
        """
        Generate a summary of a document.
        """
        if locale == "en":
            prompt = f"""Summarize the following document concisely but comprehensively.
Mention key points, important dates, people mentioned, and crucial information.

Document: {document_name}

Content:
{document_text[:10000]}

SUMMARY:"""
        else:
            prompt = f"""Résume le document suivant de manière concise mais complète.
Mentionne les points clés, les dates importantes, les personnes mentionnées et les informations cruciales.

Document: {document_name}

Contenu:
{document_text[:10000]}

RÉSUMÉ:"""
        
        try:
            return self._generate_text(prompt)
        except Exception as e:
            if locale == "en":
                return f"Error generating summary: {str(e)}"
            return f"Erreur lors de la génération du résumé: {str(e)}"
    
    async def answer_about_document(
        self,
        question: str,
        document_text: str,
        document_name: str,
        locale: str = "fr",
    ) -> str:
        """
        Answer a specific question about a document.
        """
        prompt = f"""{self._get_system_prompt(locale)}

DOCUMENT: {document_name}
CONTENU:
{document_text[:8000]}

QUESTION: {question}

RÉPONSE:"""
        
        try:
            return self._generate_text(prompt)
        except Exception as e:
            return f"Erreur: {str(e)}"
    
    def clear_history(self):
        """Clear conversation history."""
        self.conversation_history = []
    
    def get_history(self) -> List[Dict[str, Any]]:
        """Get conversation history as list of dicts."""
        return [msg.to_dict() for msg in self.conversation_history]


# Session-based instances with TTL eviction (max 100 sessions, 1h TTL)
_chat_sessions: Dict[str, AIChatService] = {}
_session_last_access: Dict[str, float] = {}
_session_lock = threading.Lock()
_SESSION_TTL = 3600  # 1 hour
_SESSION_MAX = 100


def _evict_stale_sessions() -> None:
    """Remove sessions that haven't been accessed in TTL seconds."""
    now = _time.time()
    stale = [sid for sid, ts in _session_last_access.items() if now - ts > _SESSION_TTL]
    for sid in stale:
        _chat_sessions.pop(sid, None)
        _session_last_access.pop(sid, None)
    # If still over limit, remove oldest
    if len(_chat_sessions) > _SESSION_MAX:
        oldest = sorted(_session_last_access, key=_session_last_access.get)
        for sid in oldest[:len(_chat_sessions) - _SESSION_MAX]:
            _chat_sessions.pop(sid, None)
            _session_last_access.pop(sid, None)


def get_chat_service(session_id: str = "default") -> AIChatService:
    """Get or create a chat service for the given session (TTL-evicted)."""
    with _session_lock:
        _evict_stale_sessions()
        if session_id not in _chat_sessions:
            _chat_sessions[session_id] = AIChatService()
        _session_last_access[session_id] = _time.time()
        return _chat_sessions[session_id]


def clear_session(session_id: str) -> None:
    """Remove a chat session entirely."""
    with _session_lock:
        _chat_sessions.pop(session_id, None)
        _session_last_access.pop(session_id, None)
