# Deep Dive - EpsteinFiles-RAG

## Contexte
- Repo: `AnkitNayak-eth/EpsteinFiles-RAG`
- Date: 2026-02-14
- Évaluateur: codex
- Lié au ticket: `RAG-P1-02` (provenance chunk), `RAG-P0-05/06` (QA dataset + CI)

## Objectif d'évaluation
- Comprendre quelles pratiques RAG concrètes (préparation des docs, chunking, retrieval, prompt de grounding)
  améliorent le plus la factualité et la pertinence.
- Identifier ce qui est transposable dans Archon (stack Qdrant + Meilisearch + Gemini) sans big-bang.

## Ce qui est réutilisable dans Archon
- Pipeline “stages” très explicite: `clean -> chunk -> embed -> retrieve -> answer`.
  - À reprendre surtout en *documentation* + “contrats” entre étapes (inputs/outputs, invariants).
- Préparation/normalisation de texte avant chunking:
  - collapse whitespace, suppression des sauts de lignes excessifs,
  - reconstruction d’un document à partir de fragments (ici: lignes groupées par fichier).
  - Transposable Archon: normalisation post-extraction (OCR/email/pdf) avant chunking/embeddings pour réduire bruit et doublons.
- Chunking via `RecursiveCharacterTextSplitter` (LangChain):
  - chunk + overlap + heuristiques “structure-aware”.
  - Archon: à évaluer vs notre chunking actuel (tokens approximés) sur un dataset QA (RAG-P0-05/06).
- Déduplication de chunks (hash texte normalisé):
  - Aligné avec l’amélioration déjà en place côté Archon (sha256 sur texte normalisé).
- Retrieval MMR:
  - Utilisé par défaut dans leur retriever pour éviter “10 chunks du même doc”.
  - Archon: déjà implémenté côté Qdrant (MMR) mais à piloter finement (lambda, candidate_multiplier) via QA.
- Prompt strict “grounded-only”:
  - Si info absente: répondre explicitement “non trouvé”.
  - Archon: à renforcer via un contrat citations + preuves (RAG-P1-03/04).

## Ce qui n'est pas retenu
- ChromaDB (nous avons Qdrant et une stack Docker complète).
- Modèle embeddings local `all-MiniLM-L6-v2` (priorité qualité “best results”, pas priorité “local fast”).
- Streamlit UI (Archon a déjà un frontend complet).
- Scripts dataset spécifiques (HuggingFace “Epstein Files 20K”).

## Risques
- Technique:
  - “LangChain splitter” n’est pas automatiquement meilleur; nécessite une mesure (QA) et un tuning.
- Licence:
  - MIT (ok) mais on réutilise surtout des idées, pas du copier-coller de code.
- Sécurité:
  - N/A (repo démonstration; Archon reste auth + RBAC).
- Ops:
  - N/A (aucun composant infra supplémentaire requis pour reprendre les concepts).

## POC minimal recommandé
- Ajouter une étape de normalisation de texte *avant* chunking/embeddings (post-extraction):
  - collapse whitespace, suppression duplicats évidents, nettoyage “boilerplate”,
  - conservation d’une “provenance” (page/time offsets) pour citations.
- Mettre en place un dataset QA (RAG-P0-05) et comparer:
  - chunking actuel Archon vs splitter “recursive”,
  - MMR tuning (lambda + fetch_k/candidate_multiplier),
  - recall@k, precision@k, groundedness (heuristique).

## Effort estimé
- Prototype: 1-2 jours (normalisation + flag + métriques simples).
- Intégration: 3-6 jours (provenance chunk, citations viewer, tuning + QA CI).

## Décision
- Go (réutiliser les *concepts* de préparation/normalisation + pipeline stages + QA).
- Justification:
  - Les gains sont majoritairement sur “qualité retrieval” et “grounding”, compatibles avec le plan Archon (P0/P1).

