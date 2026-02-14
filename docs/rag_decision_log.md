# RAG Decision Log

Ce fichier centralise les décisions d'architecture et de delivery liées au plan RAG.

## DEC-001 - Initialisation du programme RAG
Date: 2026-02-14
Contexte:
- Besoin de fiabiliser retrieval/citations/QA dans Archon.
Options:
1. Réécriture complète.
2. Évolution incrémentale avec flags + KPI.
Décision:
- Option 2 retenue.
Impacts:
- Roadmap 90 jours, faible risque de rupture.
Reversibilité:
- Forte (flags + rollback).

## DEC-002 - Gestion des placeholders OCR différée (media)
Date: 2026-02-14
Contexte:
- Le scan stocke des placeholders `[IMAGE]/[VIDEO] OCR déféré…` pour conserver les fichiers en base sans OCR lourd.
- Risque: pollution de l’index vectoriel (Qdrant) si ces placeholders sont embedés.
Options:
1. OCR media pendant le scan (coût élevé, latence scan).
2. Conserver placeholders mais bloquer embeddings sur ces contenus (skip) + purge si déjà indexé.
3. Conserver placeholders et déclencher OCR+embeddings “à la demande” (viewer / tâche) avec mise à jour index.
Décision:
- Option 2 immédiatement (P0): aucun placeholder ne doit être embedé; on purge les vecteurs existants si détectés.
Impacts:
- Améliore la qualité retrieval sans modifier le temps de scan.
- Les documents media restent non-searchables sémantiquement tant que l’OCR réel n’est pas produit (à traiter dans tickets suivants si nécessaire).
Reversibilité:
- Totale (on peut réactiver l’OCR media plus tôt via évolution de pipeline si besoin).

## DEC-003 - Reranker P0: Gemini “JSON scoring” (single call) derrière feature flag
Date: 2026-02-14
Contexte:
- On veut un reranker cross-encoder-style pour augmenter la précision top-k (search + chat) sans big-bang.
- Contrainte: garder un fallback stable (pas de regression) et pouvoir couper rapidement en cas d’impact latence/coût.
Options:
1. Reranker local (transformers/FlagEmbedding) dans les workers/API.
2. Reranker SaaS (Cohere/Jina/Voyage) via clé séparée.
3. Reranker Gemini (même clé que le reste) en 1 appel: scoring JSON de `query + passages`.
Décision:
- Option 3 pour P0: implémentation rapide et qualité forte, sans nouvelle dépendance lourde ni clé supplémentaire.
Impacts:
- Qualité retrieval améliorée quand activé.
- Coût/latence supplémentaires, contrôlés via `RAG_RERANK_ENABLED`, `RAG_RERANK_TOP_N`, `RAG_RERANK_TOP_K_OUT`.
Reversibilité:
- Totale: flag désactivable (env) + fallback au ranking existant.

## Template
Date: YYYY-MM-DD
Contexte:
- ...
Options:
1. ...
2. ...
Décision:
- ...
Impacts:
- ...
Reversibilité:
- ...
