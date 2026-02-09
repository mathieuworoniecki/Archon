"""
Archon Backend - NER Service
Named Entity Recognition using SpaCy
"""
import logging
from typing import List, Dict, Any, Optional
from functools import lru_cache
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ExtractedEntity:
    """Represents an extracted named entity."""
    text: str
    type: str  # PER, ORG, LOC, MISC
    start_char: int
    end_char: int


class NERService:
    """Service for Named Entity Recognition using SpaCy."""
    
    # Map SpaCy labels to our simplified types
    LABEL_MAP = {
        # French model labels
        "PER": "PER",
        "PERSON": "PER",
        "LOC": "LOC",
        "GPE": "LOC",  # Geo-political entity
        "ORG": "ORG",
        "MISC": "MISC",
        "FAC": "LOC",  # Facility
        "EVENT": "MISC",
        "PRODUCT": "MISC",
        "WORK_OF_ART": "MISC",
        # English model labels
        "NORP": "ORG",  # Nationalities, religious groups
        "MONEY": "MISC",
        "DATE": "DATE",
        "TIME": "DATE",
    }
    
    def __init__(self, model_name: str = "fr_core_news_sm"):
        """
        Initialize NER service with SpaCy model.
        
        Args:
            model_name: SpaCy model to use. Default is French small model.
        """
        self.model_name = model_name
        self._nlp = None
    
    @property
    def nlp(self):
        """Lazy-load SpaCy model."""
        if self._nlp is None:
            try:
                import spacy
                self._nlp = spacy.load(self.model_name)
                logger.info(f"Loaded SpaCy model: {self.model_name}")
            except OSError:
                logger.warning(f"SpaCy model {self.model_name} not found. Trying to download...")
                try:
                    import spacy.cli
                    spacy.cli.download(self.model_name)
                    import spacy
                    self._nlp = spacy.load(self.model_name)
                except Exception as e:
                    logger.error(f"Failed to download SpaCy model: {e}")
                    # Try fallback to English model
                    try:
                        import spacy
                        self._nlp = spacy.load("en_core_web_sm")
                        logger.info("Fallback to en_core_web_sm model")
                    except Exception:
                        logger.error("No SpaCy model available. NER disabled.")
                        self._nlp = None
        return self._nlp
    
    def extract_entities(
        self, 
        text: str, 
        max_length: int = 100000,
        include_types: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Extract named entities from text.
        
        Args:
            text: Input text
            max_length: Maximum text length to process (for performance)
            include_types: Filter to these entity types (PER, ORG, LOC, MISC, DATE)
        
        Returns:
            List of entity dicts with text, type, start_char, end_char, count
        """
        if not text or not self.nlp:
            return []
        
        # Truncate if too long
        if len(text) > max_length:
            text = text[:max_length]
            logger.warning(f"Text truncated to {max_length} characters for NER")
        
        try:
            doc = self.nlp(text)
            
            # Group entities by (text, type) to count occurrences
            entity_counts: Dict[tuple, Dict] = {}
            
            for ent in doc.ents:
                # Map to simplified type
                entity_type = self.LABEL_MAP.get(ent.label_, "MISC")
                
                # Filter by type if specified
                if include_types and entity_type not in include_types:
                    continue
                
                # Skip very short entities (usually noise)
                if len(ent.text.strip()) < 2:
                    continue
                
                key = (ent.text.strip(), entity_type)
                
                if key not in entity_counts:
                    entity_counts[key] = {
                        "text": ent.text.strip(),
                        "type": entity_type,
                        "start_char": ent.start_char,
                        "end_char": ent.end_char,
                        "count": 0
                    }
                
                entity_counts[key]["count"] += 1
            
            # Sort by count (most frequent first)
            entities = sorted(
                entity_counts.values(), 
                key=lambda x: x["count"], 
                reverse=True
            )
            
            return entities
            
        except Exception as e:
            logger.error(f"NER extraction failed: {e}")
            return []
    
    def get_entity_summary(self, text: str) -> Dict[str, int]:
        """
        Get summary count of entity types in text.
        
        Returns:
            Dict with counts per type: {"PER": 5, "ORG": 3, "LOC": 2}
        """
        entities = self.extract_entities(text)
        
        summary = {}
        for ent in entities:
            ent_type = ent["type"]
            summary[ent_type] = summary.get(ent_type, 0) + ent["count"]
        
        return summary


# Singleton instance
_ner_service: Optional[NERService] = None


def get_ner_service() -> NERService:
    """Get the singleton NER service instance."""
    global _ner_service
    if _ner_service is None:
        _ner_service = NERService()
    return _ner_service
