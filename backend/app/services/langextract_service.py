"""
Archon Backend - LangExtract Service
LLM-based structured information extraction for forensic investigation.
Uses Google LangExtract to extract entities, relationships, and summaries
from document text content.
"""
import logging
import time
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)

# LangExtract extraction prompt tuned for forensic investigation
FORENSIC_PROMPT = """\
Extract entities relevant to forensic investigation from the document.
Focus on these entity classes:
- PER: People mentioned, with roles and relationships if stated
- ORG: Organizations, with type (company, agency, NGO, government)
- LOC: Locations, addresses, geographic references
- MONEY: Financial amounts with currency and context
- DATE: Dates and time references with associated events
- DOC: Referenced document numbers, case numbers, file references
- REL: Explicit relationships between people or organizations

Use exact text from the document. Do not paraphrase.
Provide meaningful attributes for each entity to add context.
List extractions in order of appearance.
"""

# Few-shot example for forensic domain
FORENSIC_EXAMPLES = None  # Will be built lazily


def _build_examples():
    """Build few-shot examples for LangExtract, lazily imported."""
    global FORENSIC_EXAMPLES
    if FORENSIC_EXAMPLES is not None:
        return FORENSIC_EXAMPLES

    try:
        import langextract as lx

        FORENSIC_EXAMPLES = [
            lx.data.ExampleData(
                text=(
                    "Le 15 mars 2024, Jean-Pierre Moreau, directeur financier de "
                    "la société Nexus Corp (Paris), a transféré 250 000 EUR vers "
                    "un compte détenu par Marie Lefèvre à Genève. Référence du "
                    "virement : TX-2024-03-7892."
                ),
                extractions=[
                    lx.data.Extraction(
                        extraction_class="DATE",
                        extraction_text="15 mars 2024",
                        attributes={"event": "wire transfer"},
                    ),
                    lx.data.Extraction(
                        extraction_class="PER",
                        extraction_text="Jean-Pierre Moreau",
                        attributes={"role": "directeur financier", "org": "Nexus Corp"},
                    ),
                    lx.data.Extraction(
                        extraction_class="ORG",
                        extraction_text="Nexus Corp",
                        attributes={"type": "company", "location": "Paris"},
                    ),
                    lx.data.Extraction(
                        extraction_class="MONEY",
                        extraction_text="250 000 EUR",
                        attributes={"context": "wire transfer", "direction": "outgoing"},
                    ),
                    lx.data.Extraction(
                        extraction_class="PER",
                        extraction_text="Marie Lefèvre",
                        attributes={"role": "account holder", "location": "Genève"},
                    ),
                    lx.data.Extraction(
                        extraction_class="LOC",
                        extraction_text="Genève",
                        attributes={"country": "Switzerland"},
                    ),
                    lx.data.Extraction(
                        extraction_class="DOC",
                        extraction_text="TX-2024-03-7892",
                        attributes={"type": "wire transfer reference"},
                    ),
                    lx.data.Extraction(
                        extraction_class="REL",
                        extraction_text="Jean-Pierre Moreau, directeur financier de la société Nexus Corp",
                        attributes={"type": "employment", "source": "Jean-Pierre Moreau", "target": "Nexus Corp"},
                    ),
                ],
            )
        ]
    except ImportError:
        logger.warning("langextract not installed — deep analysis unavailable")
        FORENSIC_EXAMPLES = []

    return FORENSIC_EXAMPLES


class LangExtractService:
    """Service for LLM-based structured extraction using LangExtract."""

    DEFAULT_MODEL = "gemini-2.5-flash"

    def __init__(self, model_id: Optional[str] = None):
        self.model_id = model_id or self.DEFAULT_MODEL
        self._available = None

    @property
    def available(self) -> bool:
        """Check if LangExtract is installed and importable."""
        if self._available is None:
            try:
                import langextract  # noqa: F401
                self._available = True
            except ImportError:
                self._available = False
                logger.warning("langextract package not installed")
        return self._available

    def analyze_document(self, text: str) -> Dict[str, Any]:
        """
        Run LangExtract on a single document's text content.

        Returns:
            Dict with keys: extractions (list), summary (str), relationships (list),
                            model_used (str), processing_time_ms (int)
        """
        if not self.available:
            raise RuntimeError("langextract is not installed. Run: pip install langextract")

        import langextract as lx

        examples = _build_examples()
        if not examples:
            raise RuntimeError("Failed to build LangExtract examples")

        # Truncate extremely long documents (LangExtract handles chunking,
        # but we set a sane upper limit to control cost)
        max_chars = 200_000
        truncated = len(text) > max_chars
        if truncated:
            text = text[:max_chars]

        start_time = time.time()

        try:
            result = lx.extract(
                text_or_documents=text,
                prompt_description=FORENSIC_PROMPT,
                examples=examples,
                model_id=self.model_id,
            )

            elapsed_ms = int((time.time() - start_time) * 1000)

            # Parse extractions into serializable format
            extractions = []
            relationships = []

            if hasattr(result, "extractions") and result.extractions:
                for ext in result.extractions:
                    entry = {
                        "class": ext.extraction_class,
                        "text": ext.extraction_text,
                        "attributes": ext.attributes if hasattr(ext, "attributes") else {},
                    }
                    if hasattr(ext, "start") and ext.start is not None:
                        entry["start"] = ext.start
                    if hasattr(ext, "end") and ext.end is not None:
                        entry["end"] = ext.end

                    extractions.append(entry)

                    # Separate relationships
                    if ext.extraction_class == "REL":
                        relationships.append({
                            "source": ext.attributes.get("source", ""),
                            "target": ext.attributes.get("target", ""),
                            "type": ext.attributes.get("type", "unknown"),
                            "evidence": ext.extraction_text,
                        })

            # Build a summary from the extractions
            summary = self._build_summary(extractions)

            return {
                "extractions": extractions,
                "summary": summary,
                "relationships": relationships,
                "model_used": self.model_id,
                "processing_time_ms": elapsed_ms,
                "truncated": truncated,
            }

        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.error(f"LangExtract analysis failed: {e}")
            raise

    def _build_summary(self, extractions: List[Dict]) -> str:
        """Build a human-readable summary from extractions."""
        if not extractions:
            return "Aucune entité significative extraite."

        # Count by class
        counts: Dict[str, int] = {}
        for ext in extractions:
            cls = ext.get("class", "UNKNOWN")
            counts[cls] = counts.get(cls, 0) + 1

        class_labels = {
            "PER": "personne(s)",
            "ORG": "organisation(s)",
            "LOC": "lieu(x)",
            "MONEY": "montant(s)",
            "DATE": "date(s)",
            "DOC": "référence(s)",
            "REL": "relation(s)",
        }

        parts = []
        for cls, count in sorted(counts.items(), key=lambda x: -x[1]):
            label = class_labels.get(cls, cls)
            parts.append(f"{count} {label}")

        return f"Analyse avancée : {', '.join(parts)} identifié(e)s."


# Singleton
_langextract_service: Optional[LangExtractService] = None


def get_langextract_service() -> LangExtractService:
    """Get the LangExtract service singleton."""
    global _langextract_service
    if _langextract_service is None:
        _langextract_service = LangExtractService()
    return _langextract_service
