# Plan d'exécution RAG pour Archon (90 jours)

Date: 14 février 2026  
Référence: `docs/rag_search_analysis.md`

## 1. Objectif

Faire passer Archon d'un RAG hybride "Gen-1" à une version plus fiable pour investigation, sans rupture d'architecture.

Cibles prioritaires:
- améliorer la précision de retrieval,
- rendre les citations vérifiables dans le viewer,
- installer une boucle d'évaluation anti-régression,
- conserver la stabilité production.

## 2. Principes de delivery

- Pas de big-bang: déploiement incrémental avec feature flags.
- Décisions guidées par métriques, pas par perception.
- Fallback systématique vers le comportement actuel.
- Chaque sprint doit produire un livrable démontrable.

## 3. KPI de pilotage

KPI à mesurer avant/après chaque jalon:
- `Context Precision@10` (retrieval utile).
- `Answer Relevance` (réponse répond à la question).
- `Faithfulness` (absence d'hallucination).
- `Citation Coverage` (% phrases avec source validable).
- Latence `p50/p95` recherche et chat.

Seuils de passage recommandés:
- +15% minimum sur précision retrieval top-10.
- Aucun recul >5% sur latence p95 sans justification.
- 0 régression critique sur tests de non-régression métier.

## 4. Gouvernance projet

Rituels:
- Weekly review technique (30 min).
- Démo fin de sprint.
- Revue KPI avant activation d'un flag en défaut.

Definition of Done (DoD) pour chaque ticket:
- code + tests,
- logs/metrics exploitables,
- rollback documenté,
- note de validation fonctionnelle.

## 5. Backlog structuré

## 5.1 P0 (impact fort, court terme)

`RAG-P0-01` Corriger cohérence OCR différée image/vidéo  
- But: éviter indexation vectorielle de placeholders.  
- Zones: `backend/app/workers/tasks.py`, `backend/app/services/embeddings.py`.  
- Critère: aucun chunk placeholder indexé dans Qdrant.

`RAG-P0-02` Ajouter service reranker cross-encoder (feature flag)  
- Zones: `backend/app/services/reranker.py` (nouveau), `backend/app/config.py`.  
- Critère: reranker désactivable à chaud, fallback stable.

`RAG-P0-03` Intégrer reranking dans recherche hybride  
- Zones: `backend/app/api/search.py`.  
- Critère: pipeline `retrieve -> fuse -> rerank -> paginate` validé.

`RAG-P0-04` Intégrer reranking dans chat RAG  
- Zones: `backend/app/services/ai_chat.py`.  
- Critère: contexte chat top-k reranké, latence contrôlée.

`RAG-P0-05` Dataset d'évaluation RAG (questions métier + sources)  
- Zones: `backend/tests/` (fixtures dédiées).  
- Critère: set de test versionné et rejouable en CI.

`RAG-P0-06` Pipeline QA RAG en CI (Ragas + DeepEval)  
- Zones: `backend/tests/`, script CI.  
- Critère: rapport de métriques à chaque PR sur périmètre RAG.

## 5.2 P1 (structurant)

`RAG-P1-01` Pilote parsing structuré Docling  
- Zones: `backend/app/services/document_parser.py` (nouveau), `backend/app/workers/tasks.py`.  
- Critère: parsing activable par flag et fallback OCR actuel.

`RAG-P1-02` Étendre payload chunk provenance  
- But: stocker `start_char/end_char/page/bbox` quand disponible.  
- Zones: `backend/app/services/embeddings.py`, `backend/app/services/qdrant.py`.  
- Critère: provenance renvoyée par API retrieval/chat.

`RAG-P1-03` Contrat citations backend strict  
- But: relier chaque citation à des chunks/doc/page.  
- Zones: `backend/app/services/ai_chat.py`, `backend/app/api/chat.py`, `backend/app/schemas.py`.  
- Critère: réponse chat inclut structure citation machine-checkable.

`RAG-P1-04` Viewer preuve (highlight source)  
- Zones: `frontend/src/pages/ChatPage.tsx`, `frontend/src/components/viewer/DocumentViewer.tsx`.  
- Critère: clic citation ouvre doc + passage surligné.

`RAG-P1-05` A/B dense+sparse Qdrant (POC)  
- But: comparer stack actuelle vs option Qdrant hybride avancée.  
- Critère: décision chiffrée go/no-go, sans migration forcée.

## 5.3 P2 (avancé)

`RAG-P2-01` Graphe relationnel typé (au-delà co-occurrence)  
- Zones: `backend/app/api/entities.py`, exploitation `deep_analysis`.  
- Critère: edges avec type de relation et preuve.

`RAG-P2-02` Prototype mode enquêteur relationnel  
- But: requêtes 2-hop/3-hop graphe + retrieval.  
- Critère: cas d'usage démontré sur dossier pilote.

`RAG-P2-03` Orchestration agentique ciblée (POC LangGraph)  
- Critère: valeur prouvée sur use case précis (chronologie/fact-check).

## 6. Plan par sprint (6 sprints x 2 semaines)

## Sprint 1

Objectif: baseline et sécurisation P0.
- Implémenter `RAG-P0-01`.
- Créer dataset évaluation initial (`RAG-P0-05`).
- Ajouter instrumentation KPI de base.

Sortie attendue:
- baseline métrique versionnée,
- bug OCR différée neutralisé.

## Sprint 2

Objectif: reranker en recherche.
- Implémenter `RAG-P0-02`, `RAG-P0-03`.
- Ajouter tests ranking dédiés.

Sortie attendue:
- flag reranker opérationnel sur `/api/search`.

## Sprint 3

Objectif: reranker en chat + CI QA.
- Implémenter `RAG-P0-04`, `RAG-P0-06`.
- Ajuster seuils et budget latence.

Sortie attendue:
- chat RAG reranké,
- dashboard KPI CI exploitable.

## Sprint 4

Objectif: parsing structuré pilote.
- Implémenter `RAG-P1-01`.
- Démarrer `RAG-P1-02` (provenance minimale: offsets/page).

Sortie attendue:
- pipeline Docling activable sur corpus pilote.

## Sprint 5

Objectif: citations vérifiables bout en bout.
- Finaliser `RAG-P1-02`, `RAG-P1-03`, `RAG-P1-04`.

Sortie attendue:
- citation chat -> document -> passage source vérifiable.

## Sprint 6

Objectif: arbitrage stratégique P1/P2.
- Implémenter `RAG-P1-05` (A/B dense+sparse).
- Préparer backlog P2 sur résultats réels.

Sortie attendue:
- décision d'architecture documentée (maintien dual-index vs extension Qdrant).

## 7. Plan de deep dive GitHub (en parallèle)

## Wave A (Sprints 1-2)

- `IBM/docling`: extraction structurée, ordre de lecture, tables.
- `FlagOpen/FlagEmbedding`: reranker + embeddings.
- `qdrant/qdrant`: patterns dense/sparse/multi-vector.

Livrable deep dive:
- note d'implémentation par repo (ce qu'on reprend / ce qu'on ignore / risques).

## Wave B (Sprints 3-4)

- `infiniflow/ragflow`: stratégie ingestion/citation.
- `explodinggradients/ragas` et `confident-ai/deepeval`: QA RAG.
- `weaviate/Verba`: UX preuve/citation.

## Wave C (Sprints 5-6)

- `HKU-Smart-Lab/LightRAG`, `microsoft/graphrag`, `langchain-ai/langgraph`.

## 8. Risques et parades

Risque: latence reranker trop élevée  
Parade: limiter top-N reranké, cache, mode async, feature flag.

Risque: parsing structuré instable sur certains formats  
Parade: fallback OCR/parseur actuel par type MIME.

Risque: explosion complexité citations  
Parade: livrer en paliers (offsets textuels -> page -> bbox).

Risque: migration retrieval trop agressive  
Parade: A/B systématique et maintien Meilisearch tant que non démontré.

## 9. Checklist de lancement (semaine 0)

- Nommer owner par stream: Retrieval, Ingestion, Frontend preuve, QA.
- Geler jeu d'évaluation initial.
- Valider conventions feature flags.
- Préparer dashboard métriques (CI + runtime).

## 10. Prochaine action recommandée

Démarrer Sprint 1 avec un mini lot de tickets:
- `RAG-P0-01`,
- `RAG-P0-05`,
- instrumentation KPI minimale.

Ce lot réduit le risque et prépare les gains rapides des sprints 2-3.

## 11. Dépendances inter-tickets

Ordre recommandé pour limiter les blocages:

1. `RAG-P0-01` -> prérequis qualité index pour tous les tickets retrieval.
2. `RAG-P0-05` -> prérequis mesure pour `RAG-P0-03`, `RAG-P0-04`, `RAG-P1-05`.
3. `RAG-P0-02` -> prérequis technique pour `RAG-P0-03` et `RAG-P0-04`.
4. `RAG-P0-03` + `RAG-P0-04` -> prérequis benchmark pour décider `RAG-P1-05`.
5. `RAG-P1-01` -> prérequis provenance fiable pour `RAG-P1-02`.
6. `RAG-P1-02` -> prérequis backend pour `RAG-P1-03` et `RAG-P1-04`.
7. `RAG-P1-03` -> prérequis contrat API pour `RAG-P1-04`.
8. `RAG-P1-05` -> prérequis arbitrage architecture avant `RAG-P2-*`.

## 12. Stratégie feature flags

Flags backend recommandés:
- `RAG_RERANK_ENABLED` (défaut `false`): active reranking.
- `RAG_RERANK_TOP_N` (défaut `50`): volume reranké.
- `RAG_RERANK_TOP_K_OUT` (défaut `10`): top-k final envoyé au LLM.
- `RAG_STRUCTURED_PARSER_ENABLED` (défaut `false`): active Docling.
- `RAG_CITATION_STRICT_MODE` (défaut `false`): impose citations structurées.

Règles d'activation:
- Activer d'abord sur environnement dev.
- Puis canary projet pilote.
- Puis activation globale seulement si KPI >= seuils section 3.

## 13. Critères de release et rollback

Release gate par sprint:
- tests unitaires backend/frontend verts,
- tests de non-régression RAG verts,
- latence p95 dans budget,
- aucun incident bloquant de citation/provenance.

Rollback immédiat si:
- baisse `Context Precision@10` > 10%,
- hausse latence p95 > 20% sans mitigation,
- réponses non sourcées sur scénarios critiques.

Plan rollback:
1. Désactiver feature flag concerné.
2. Purger uniquement les artefacts du nouveau flux (si nécessaire).
3. Relancer benchmark baseline pour valider retour à l'état stable.

## 14. Templates de suivi (docs-only)

## 14.1 Template Deep Dive Repo

À copier dans un fichier `docs/deep_dive_<repo>.md`:

```md
# Deep dive: <owner/repo>

## Objectif d'évaluation
- ...

## Ce qui est réutilisable dans Archon
- ...

## Ce qui n'est pas retenu
- ...

## Risques (techniques/licence/sécurité)
- ...

## POC minimal recommandé
- ...

## Décision
- Go / No-Go / Revisit
```

## 14.2 Template Decision Log

À copier dans `docs/rag_decision_log.md`:

```md
## DEC-XXX - <titre>
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
```

## 15. Tableau de statut manuel (à tenir dans docs)

Créer/maintenir `docs/rag_status_board.md` avec ce format:

```md
| Ticket      | Statut        | Owner | Sprint | Bloqué par | Notes |
|-------------|---------------|-------|--------|------------|-------|
| RAG-P0-01   | todo/in_prog  | ...   | S1     | -          | ...   |
```

Statuts recommandés:
- `todo`
- `in_progress`
- `blocked`
- `review`
- `done`
