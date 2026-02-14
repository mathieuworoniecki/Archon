# RAG Status Board

Mise à jour: 2026-02-14

## Légende statuts
- `todo`
- `in_progress`
- `blocked`
- `review`
- `done`

## Board

| Ticket    | Statut | Owner | Sprint | Bloqué par | Notes |
|-----------|--------|-------|--------|------------|-------|
| RAG-P0-01 | done   | codex | S1     | -          | Skip placeholders `[IMAGE]/[VIDEO] OCR…` (NER+embeddings), purge Qdrant si déjà indexé, nettoyage `qdrant_ids` + tests |
| RAG-P0-02 | done   | codex | S2     | RAG-P0-01  | `backend/app/services/reranker.py` + flags `RAG_RERANK_*` (Gemini JSON scorer, hot-disable via env) |
| RAG-P0-03 | done   | codex | S2     | RAG-P0-02  | Search: `retrieve -> fuse -> rerank -> paginate` (`backend/app/api/search.py`) |
| RAG-P0-04 | done   | codex | S3     | RAG-P0-02  | Chat: retrieve more -> rerank -> top-k (`backend/app/services/ai_chat.py`) |
| RAG-P0-05 | todo   | TBD   | S1     | -          | Dataset QA initial |
| RAG-P0-06 | todo   | TBD   | S3     | RAG-P0-05  | Pipeline QA CI |
| RAG-P1-01 | todo   | TBD   | S4     | RAG-P0-*   | Pilote Docling |
| RAG-P1-02 | todo   | TBD   | S4-S5  | RAG-P1-01  | Provenance chunk |
| RAG-P1-03 | todo   | TBD   | S5     | RAG-P1-02  | Contrat citation strict |
| RAG-P1-04 | todo   | TBD   | S5     | RAG-P1-03  | Viewer preuve |
| RAG-P1-05 | todo   | TBD   | S6     | RAG-P0-03/04 | A/B dense+sparse |
| RAG-P2-01 | todo   | TBD   | Post-S6 | RAG-P1-05 | Graphe relationnel typé |
| RAG-P2-02 | todo   | TBD   | Post-S6 | RAG-P2-01 | Mode enquêteur |
| RAG-P2-03 | todo   | TBD   | Post-S6 | RAG-P2-02 | POC agentique |
