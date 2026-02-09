"""
Archon Backend - Gemini Embeddings Service
Using Google gemini-embedding-001 for text embeddings
"""
import logging
import google.generativeai as genai
from typing import List, Dict, Any
from ..config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

# Gemini gemini-embedding-001 dimension
EMBEDDING_DIMENSION = 3072


class EmbeddingsService:
    """Service for generating text embeddings using Google Gemini."""
    
    def __init__(self):
        genai.configure(api_key=settings.gemini_api_key)
        self.model = settings.embedding_model
        self.chunk_size = settings.chunk_size
        self.chunk_overlap = settings.chunk_overlap
    
    def count_tokens(self, text: str) -> int:
        """Approximate token count (roughly 4 chars per token)."""
        return len(text) // 4
    
    def chunk_text(self, text: str) -> List[Dict[str, Any]]:
        """
        Split text into overlapping chunks based on character count.
        
        Returns:
            List of chunks with text and chunk_index.
        """
        if not text or not text.strip():
            return []
        
        # Approximate: 1 token ≈ 4 characters, chunk_size is in tokens
        char_chunk_size = self.chunk_size * 4
        char_overlap = self.chunk_overlap * 4
        
        chunks = []
        start = 0
        chunk_index = 0
        
        while start < len(text):
            end = min(start + char_chunk_size, len(text))
            chunk_text = text[start:end]
            
            chunks.append({
                "text": chunk_text,
                "chunk_index": chunk_index,
                "start_char": start,
                "end_char": end,
            })
            
            # Move start with overlap
            start = end - char_overlap
            chunk_index += 1
            
            # Prevent infinite loop on small texts
            if end >= len(text):
                break
        
        return chunks
    
    def get_embedding(self, text: str) -> List[float]:
        """Get embedding for a single text using Gemini."""
        result = genai.embed_content(
            model=self.model,
            content=text,
            task_type="retrieval_document"
        )
        return result['embedding']
    
    def get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Get embeddings for multiple texts using batch API."""
        if not texts:
            return []
        
        embeddings = []
        # Process in batches of 100 to stay within API limits
        batch_size = 100
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            try:
                result = genai.embed_content(
                    model=self.model,
                    content=batch,
                    task_type="retrieval_document"
                )
                # embed_content returns a list of embeddings when given a list
                embeddings.extend(result['embedding'])
            except Exception as e:
                # Fallback: return zero vectors for this batch
                embeddings.extend([[0.0] * EMBEDDING_DIMENSION for _ in batch])
                logger.error("Batch embedding error: %s", e)
        
        return embeddings
    
    def get_query_embedding(self, query: str) -> List[float]:
        """Get embedding for a search query (uses retrieval_query task)."""
        result = genai.embed_content(
            model=self.model,
            content=query,
            task_type="retrieval_query"
        )
        return result['embedding']
    
    def embed_chunks(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Embed all chunks and add embedding to each chunk dict.
        """
        if not chunks:
            return []
        
        texts = [c["text"] for c in chunks]
        embeddings = self.get_embeddings_batch(texts)
        
        result = []
        for chunk, embedding in zip(chunks, embeddings):
            result.append({
                **chunk,
                "embedding": embedding
            })
        
        return result
    
    def process_document(self, text: str) -> List[Dict[str, Any]]:
        """
        Full pipeline: chunk text and generate embeddings.
        
        Returns:
            List of chunks with text, chunk_index, and embedding.
        """
        chunks = self.chunk_text(text)
        return self.embed_chunks(chunks)


# Singleton instance
_embeddings_service = None


def get_embeddings_service() -> EmbeddingsService:
    """Get the embeddings service singleton."""
    global _embeddings_service
    if _embeddings_service is None:
        _embeddings_service = EmbeddingsService()
    return _embeddings_service
