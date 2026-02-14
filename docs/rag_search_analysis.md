# Analyse croisée des deep dives RAG pour Archon

Date: 14 février 2026  
Sources analysées: `docs/rag_search1.md`, `docs/rag_search2.md`  
Référentiel comparatif: état actuel du code Archon (`backend/`, `frontend/`)

## 1. Synthèse exécutive

Les deux rapports convergent sur un point clé: Archon est déjà une base solide (pipeline asynchrone, recherche hybride, vues d’analyse), mais reste un RAG "Gen-1" sur 4 zones critiques:

- ingestion documentaire (chunking et structure encore trop "texte brut"),
- précision retrieval (pas de reranker cross-encoder),
- traçabilité fine des preuves (citation robuste page/zone),
- évaluation continue (pas de boucle QA RAG automatisée).

La meilleure stratégie n’est pas une réécriture, mais une montée en puissance incrémentale: **parser structuré + reranker + métriques de non-régression**, puis graphe/reasoning avancés.

## 2. Qualité des deux rapports (comparatif)

## 2.1 `rag_search1.md` (orientation "engineering pragmatique")

Points forts:
- Très bon inventaire des briques utiles et réutilisables.
- Focus licences/sécurité/observabilité (important pour un outil forensique).
- Recommandations compatibles avec une intégration progressive dans Archon.

Limites:
- Très large périmètre (beaucoup d’outils), donc besoin de priorisation stricte pour éviter la dispersion.

## 2.2 `rag_search2.md` (orientation "architecture cible")

Points forts:
- Vision système claire (ingestion -> retrieval -> graphe -> agents -> UX preuve).
- Feuille de route en phases exploitable.
- Très bon cadrage "investigation" (preuve, factualité, chain-of-custody).

Limites:
- Plusieurs affirmations fortes s’appuient sur des sources secondaires (blogs/vidéos) plutôt que docs primaires.
- Certaines propositions sont ambitieuses (Qdrant-only, agents, graphe dynamique) et doivent être validées par POC mesurés.
- Le fichier contient un payload image/base64 volumineux, ce qui le rend lourd à maintenir tel quel.

## 2.3 Conclusion comparative

- `rag_search1.md` est meilleur pour **sélectionner les briques**.
- `rag_search2.md` est meilleur pour **designer la trajectoire produit**.
- La combinaison optimale: **sélection P0/P1 issue du rapport 1 + roadmap progressive issue du rapport 2**.

## 3. État actuel d’Archon (factuel, code)

## 3.1 Ingestion, OCR, chunking

- OCR PDF/image via PyMuPDF + Tesseract (`backend/app/services/ocr.py`).
- Scan batch performant avec Celery (`backend/app/workers/tasks.py`).
- Chunking embeddings actuel = découpage taille fixe (tokens approximés en caractères) (`backend/app/services/embeddings.py`).
- Pas de parsing de structure documentaire (tables, layout, colonnes, bbox, lecture multi-colonnes) avant embedding.
- Point d’attention actuel: OCR différée pour médias pendant le scan, mais logique incomplète (risque d’indexer des placeholders plutôt que du texte réel sur certains cas image/vidéo).

## 3.2 Indexation et retrieval

- Hybride actuel: Meilisearch (lexical) + Qdrant (dense vectoriel) (`backend/app/api/search.py`).
- Fusion: RRF pondérée (`semantic_weight`) (`backend/app/api/search.py`).
- Qdrant: un seul vecteur dense (3072) par chunk (`backend/app/services/qdrant.py`).
- Diversification: MMR activable côté Qdrant (`backend/app/services/qdrant.py`).
- Absence de reranker cross-encoder (étape critique manquante).

## 3.3 NER, graphe, analyse avancée

- NER SpaCy simplifié (PER/ORG/LOC/MISC/DATE mapping) (`backend/app/services/ner_service.py`).
- Graphe actuel = co-occurrence d’entités par document (`backend/app/api/entities.py`).
- Analyse avancée LangExtract disponible (extractions + relations), mais non utilisée comme moteur principal du graphe/retrieval (`backend/app/services/langextract_service.py`, `backend/app/api/deep_analysis.py`).

## 3.4 Chat RAG, citations, mémoire

- Chat RAG récupère le contexte via Qdrant (MMR) (`backend/app/services/ai_chat.py`).
- Pas de vérificateur factuel automatique (agent critique / claim checking).
- Citation demandée dans le prompt, mais sans contrat strict machine-checkable côté backend.
- Mémoire = historique de session en mémoire (TTL 1h), pas de mémoire sémantique persistante type "facts" (`backend/app/services/ai_chat.py`).

## 3.5 QA / observabilité RAG

- Pas de pipeline d’évaluation RAG standardisé (Ragas/DeepEval/Phoenix).
- Existent déjà des tests utiles sur le ranking hybride (RRF/MMR), bonne base pour aller vers une QA RAG complète.

## 4. Infos utiles à extraire des rapports pour améliorer Archon (vs actuel)

## 4.1 Priorité P0 (impact fort, effort maîtrisé)

1. **Ajouter un reranker cross-encoder après retrieval hybride**  
Valeur: hausse forte de précision top-k, baisse faux positifs, meilleur contexte LLM.

2. **Passer à un chunking structuré (Docling/MinerU/RAGFlow parser) sur un sous-ensemble pilote**  
Valeur: meilleure conservation des tableaux/sections/ordre de lecture, citations plus fiables.

3. **Conserver des métadonnées de provenance par chunk** (`page`, `start/end`, `bbox` quand possible)  
Valeur: surlignage preuve dans le viewer, auditabilité renforcée.

4. **Mettre en place une boucle QA RAG en CI** (Ragas + DeepEval, jeu de questions métier)  
Valeur: éviter les régressions invisibles après changement de parsing/embedding/prompt.

5. **Corriger la cohérence OCR différée (images/vidéos) avant indexation sémantique**  
Valeur: éviter la pollution de l’index vectoriel par du pseudo-contenu.

## 4.2 Priorité P1 (fort potentiel, changement plus structurant)

1. **Tester dense+sparse dans Qdrant (BGE-M3 ou stratégie équivalente)** en A/B contre stack actuelle.

2. **Faire évoluer le graphe**: passer de co-occurrence brute à relations typées (en exploitant les sorties LangExtract).

3. **Fiabiliser les citations chat**: mapping explicite réponse -> chunks/documents -> positions (contrat backend strict).

## 4.3 Priorité P2 (long terme, à lancer après P0/P1 validés)

1. Mode "enquêteur" graphe+retrieval (LightRAG/GraphRAG-like) pour questions relationnelles globales.
2. Orchestration agentique (LangGraph) pour workflows planification + vérification.
3. Mémoire investigateur persistante (Mem0-like) si cas d’usage multi-sessions avéré.

## 5. Décisions d’architecture recommandées

- **Ne pas supprimer Meilisearch immédiatement**.  
Faire une transition pilotée par métriques (A/B retrieval), pas un "big-bang" Qdrant-only.

- **Conserver le pipeline Celery actuel** et enrichir les étapes, plutôt que remplacer le moteur global.

- **Mettre les critères forensiques au centre**: factualité, preuve localisable, reproductibilité, audit.

## 6. Feuille de route proposée (90 jours)

## Phase 1 (semaines 1-4): précision retrieval + baseline métrique

- Intégrer reranker cross-encoder (feature flag).
- Définir dataset d’évaluation métier (100-300 questions + sources attendues).
- Ajouter métriques CI: `faithfulness`, `context_precision`, `answer_relevance`, latence p95.

Livrable de sortie:
- Benchmark avant/après reproductible, décision chiffrée go/no-go.

## Phase 2 (semaines 5-8): qualité documentaire + preuve

- Pilote Docling sur corpus représentatif (PDF complexes, tableaux, scans).
- Enrichir payload index (page, offsets, bbox quand dispo).
- Exposer citations structurées dans API chat + viewer proof-highlight.

Livrable de sortie:
- Réponse chat cliquable jusqu’au passage source visualisé.

## Phase 3 (semaines 9-12): graphe intelligent + exploration avancée

- Construire graphe relationnel à partir des analyses avancées (pas seulement co-occurrence).
- Prototype mode "question relationnelle" (2-hop/3-hop) couplé au retrieval.
- Évaluer besoin réel d’agentic orchestrator (LangGraph) sur use cases concrets.

Livrable de sortie:
- MVP "mode enquêteur" sur un dossier pilote.

## 7. Liste des outils / repos GitHub à deep dive (phase suivante)

## 7.1 P0 (à étudier immédiatement)

1. **Docling** (`IBM/docling`)  
Pourquoi: parsing structuré PDF/Office exploitable rapidement dans workers.

2. **FlagEmbedding (BGE / rerankers)** (`FlagOpen/FlagEmbedding`)  
Pourquoi: embeddings/reranking open-source solides pour retrieval quality.

3. **Qdrant** (`qdrant/qdrant`) + exemples hybrides  
Pourquoi: stratégie dense+sparse/multi-vector dans l’infra déjà utilisée.

4. **RAGFlow** (`infiniflow/ragflow`)  
Pourquoi: patterns ingestion + citations + parsing en conditions réelles.

5. **Ragas** (`explodinggradients/ragas`)  
Pourquoi: standard d’évaluation RAG (qualité de réponse + retrieval).

6. **DeepEval** (`confident-ai/deepeval`)  
Pourquoi: tests de non-régression LLM/RAG intégrables CI.

## 7.2 P1 (après sécurisation P0)

1. **LightRAG** (`HKU-Smart-Lab/LightRAG`)  
Pourquoi: retrieval relationnel orienté graphe, incrémental.

2. **GraphRAG** (`microsoft/graphrag`)  
Pourquoi: référence méthodologique pour requêtes globales corpus.

3. **LangGraph** (`langchain-ai/langgraph`)  
Pourquoi: orchestration d’agents avec états/contrôle explicite.

4. **Verba** (`weaviate/Verba`)  
Pourquoi: patterns UX citations/preuve très proches du besoin Archon.

5. **Unstructured** (`Unstructured-IO/unstructured`)  
Pourquoi: alternative parsing/partitioning à comparer avec Docling.

6. **Cognita** (`truefoundry/cognita`)  
Pourquoi: blueprint architecture RAG backend modulaire.

## 7.3 P2 (exploration opportuniste)

1. **Mem0** (`mem0ai/mem0`)  
Pourquoi: mémoire conversationnelle/facts multi-session.

2. **R2R** (`SciPhi-AI/R2R`)  
Pourquoi: patterns API RAG + deep research orientés produit.

3. **Langflow** (`langflow-ai/langflow`)  
Pourquoi: prototypage rapide de pipelines avant intégration backend propre.

## 8. Outils à évaluer avec précaution (licence/sécurité)

- **Dify**: licence "open-source" avec clauses additionnelles à auditer.  
- **Open WebUI**: vérifier précisément contraintes licence récentes + historique de vulnérabilités avant usage core.

## 9. Plan d’exécution recommandé

1. Lancer un sprint P0 (reranker + évaluation + pilote Docling).  
2. Décider sur métriques, pas sur perception.  
3. Ensuite seulement engager les chantiers graphe/agents (P1/P2).

Ce plan maximise le gain qualité court terme tout en gardant Archon stable, auditable et compatible forensics.

## 10. Matrice de priorisation (chiffrée)

Notation:
- Impact: 1 (faible) -> 5 (fort)
- Effort: 1 (faible) -> 5 (fort)
- Risque: 1 (faible) -> 5 (fort)
- Confiance: 1 (faible) -> 5 (fort)

| Initiative | Impact | Effort | Risque | Confiance | Priorité |
|---|---:|---:|---:|---:|---|
| Reranker cross-encoder (search+chat) | 5 | 2 | 2 | 5 | P0 |
| QA RAG CI (Ragas/DeepEval) | 5 | 3 | 2 | 4 | P0 |
| Correction OCR différée / placeholders | 4 | 2 | 2 | 4 | P0 |
| Chunking structuré Docling (pilote) | 5 | 3 | 3 | 4 | P1 |
| Provenance chunk (page/offset/bbox) | 5 | 3 | 3 | 4 | P1 |
| Contrat citation strict backend+viewer | 5 | 3 | 3 | 4 | P1 |
| A/B dense+sparse Qdrant | 4 | 4 | 3 | 3 | P1 |
| Graphe relationnel typé | 4 | 4 | 4 | 3 | P2 |
| Orchestration agentique | 3 | 5 | 4 | 2 | P2 |

## 11. Inconnues critiques à valider avant engagement fort

1. Budget latence reranker acceptable par workflow (search interactif vs chat).
2. Qualité Docling sur corpus réel Archon (pdf scannés, emails, pièces mixtes).
3. Coût opérationnel d'une provenance riche (`bbox/page/offset`) sur stockage et payload API.
4. Robustesse de l'approche citation stricte sur réponses longues multi-sources.
5. Gain réel dense+sparse sur vos données par rapport au coût de migration.

## 12. Quick wins (5 jours)

1. Empêcher l'indexation vectorielle de contenus placeholders.
2. Ajouter un flag reranker (OFF par défaut) + route de test interne.
3. Créer un mini dataset d'évaluation (20-30 questions) pour baseline.
4. Ajouter un rapport markdown automatique des KPI après run de tests RAG.

## 13. Pack de handoff pour l'autre agent

Pour un passage de relais rapide, fournir:
- `docs/rag_search_analysis.md` (vision et priorités),
- `docs/rag_search_execution_plan.md` (tickets/sprints/gouvernance),
- baseline KPI actuelle (fichier de résultats),
- shortlist deep dive (ordre Wave A en premier).

Ordre de prise en main recommandé:
1. Lire sections P0 + Sprint 1/2.
2. Exécuter baseline métrique.
3. Prendre `RAG-P0-01` puis `RAG-P0-02/03`.
