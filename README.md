# Archon - Digital Investigation Platform

Archon est une application locale d'investigation numerique pour explorer de gros volumes documentaires
(dossiers projets, archives, PDF/images/videos/emails), indexer le contenu, puis naviguer rapidement via
recherche hybride (lexicale + semantique) et vues d'analyse.

Ce README est ecrit comme un runbook "copier-coller": si vous recupererez tout le projet sur une machine
neuve, vous pouvez le lancer et comprendre son fonctionnement de bout en bout.

## 1. Vue d'ensemble

Archon combine:

- un frontend React/Vite (navigation et investigation),
- un backend FastAPI (API metier),
- des workers Celery (pipeline lourd de scan/indexation),
- PostgreSQL (metadata),
- Meilisearch (full-text),
- Qdrant (vecteurs pour recherche semantique),
- Redis (broker de taches / progression).

Concept cle:

- Un "projet" = un dossier de premier niveau dans `DOCUMENTS_PATH`.
- Un "scan" = traitement asynchrone de ce projet.
- Les documents scannes deviennent consultables dans:
  - recherche 3 panneaux (filtres + liste + viewer),
  - timeline,
  - graphe d'entites,
  - galerie media,
  - chat RAG.

## 2. Architecture

```text
Frontend (React, Nginx, :3100)
        |
        v
Backend API (FastAPI, :8100)
        |
        +--> PostgreSQL (metadata)
        +--> Meilisearch (index lexical)
        +--> Qdrant (index vectoriel)
        |
        +--> Redis (broker/events) <--> Celery workers (scan/index/NER/embeddings)
```

Ports exposes par defaut:

- `3100` -> UI
- `8100` -> API

Les autres services (Postgres/Meili/Qdrant/Redis) sont internes au reseau Docker dans les compose fournis.

## 3. Flux fonctionnel (comment le systeme travaille)

1. Vous deposez des fichiers dans `DOCUMENTS_PATH/<nom_projet>/...`.
2. L'UI detecte ce dossier comme projet.
3. Vous lancez un scan.
4. Les workers executent un pipeline batche:
   - decouverte des fichiers,
   - hash/dedup,
   - extraction texte (OCR si necessaire),
   - insertion metadata DB,
   - indexation Meilisearch,
   - vectorisation Qdrant (selon config),
   - extraction d'entites (NER).
5. Les pages recherche/timeline/graphe/galerie se nourrissent de ces index.

## 4. Installation "copier-coller" (recommandee)

### Prerequis

- Docker + Docker Compose plugin (`docker compose`)
- 8 GB RAM minimum (16 GB conseille)
- Cle API Gemini pour les features IA/semantique

### Etapes

```bash
# 1) Recuperer le projet
git clone <URL_DU_REPO>
cd Archon

# 2) Configurer l'environnement
cp .env.example .env

# 3) Editer .env et renseigner au minimum:
#    - GEMINI_API_KEY
#    - JWT_SECRET_KEY (si auth active)

# 4) Creer les dossiers documents projets
mkdir -p documents/MonProjet

# 5) Lancer la stack
docker compose up -d --build

# 6) Ouvrir l'application
# UI  : http://localhost:3100
# API : http://localhost:8100
```

Verification rapide:

```bash
curl http://localhost:8100/api/health/
```

## 5. Premier demarrage (auth et bootstrap)

Par defaut (`DISABLE_AUTH=false`), l'auth est active:

- au premier demarrage, creez le premier compte via l'interface,
- ce premier compte devient admin (bootstrap),
- ensuite l'admin peut creer des analystes.

Pour du dev local uniquement, vous pouvez bypass l'auth avec:

```env
DISABLE_AUTH=true
```

## 6. Ajouter des donnees et lancer un scan

Exemple:

```bash
mkdir -p documents/Epstein
cp -R /chemin/vers/mes/fichiers/* documents/Epstein/
```

Puis dans l'UI:

1. Aller sur `Projets`.
2. Ouvrir le projet.
3. Lancer un scan.
4. Suivre la progression dans `Scans`.

Note:

- Un projet non scanne affiche une estimation du nombre de fichiers (suffixe `+`).
- Apres scan complet, les stats deviennent exactes cote index.

## 7. Recherche et analyse

Archon supporte trois modes:

1. Lexical (Meilisearch) -> mots-cles.
2. Semantique (Qdrant) -> similarite de sens.
3. Hybride -> fusion classements (RRF ponderee par `semantic_weight`).

UX principale:

- panneau gauche: filtres/tri/recherche,
- panneau central: liste des documents,
- panneau droit: viewer/preview du document selectionne.

### RAG (qualite, roadmap)

La qualite RAG (grounding, retrieval, citations, evaluation) est pilotee en mode "docs-only":

- `docs/rag_docs_index.md` (point d'entree)
- `docs/rag_search_analysis.md` (etat actuel + priorites)
- `docs/rag_search_execution_plan.md` (plan 90 jours / tickets)
- `docs/rag_status_board.md` (suivi)
- `docs/rag_decision_log.md` (decisions)
- `docs/deep_dive_AnkitNayak-eth_EpsteinFiles-RAG.md` (deep dive externe: pratiques chunking/MMR/prompt)

## 8. Fichiers et dossiers importants

```text
Archon/
├── docker-compose.yaml              # stack locale standard
├── docker-compose.prod.yaml         # profil plus lourd / tuning prod
├── .env.example                     # variables d'environnement
├── backend/
│   ├── app/api/                     # endpoints FastAPI
│   ├── app/services/                # OCR, search, embeddings, NER, etc.
│   ├── app/workers/                 # Celery tasks pipeline scan
│   └── tests/                       # pytest backend
├── docs/                             # specs + runbooks + plan RAG (docs-only)
├── frontend/
│   ├── src/pages/                   # pages UI
│   ├── src/components/              # composants
│   ├── src/hooks/                   # hooks donnees
│   └── src/lib/                     # clients API/utilitaires
└── documents/                       # vos donnees locales (non committees)
```

## 9. Variables d'environnement

Variables principales (`.env`):

- `GEMINI_API_KEY`: requis pour recherche semantique/chat IA.
- `JWT_SECRET_KEY`: requis si auth active.
- `DOCUMENTS_PATH`: chemin des projets documentaires (defaut `./documents`).
- `DISABLE_AUTH`: `false` en normal, `true` uniquement en dev.
- `CORS_ORIGINS`: liste d'origines autorisees.

Variables production (`docker-compose.prod.yaml`):

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `MEILISEARCH_API_KEY`
- `FLOWER_USER`, `FLOWER_PASSWORD`

## 10. Commandes utiles

### Docker

```bash
# Lancer la stack locale
docker compose up -d

# Rebuild complet
docker compose up -d --build

# Profil production local
docker compose -f docker-compose.prod.yaml up -d --build

# Logs backend
docker compose logs -f backend

# Logs workers
docker compose logs -f celery-worker

# Arreter
docker compose down

# Arreter + supprimer volumes
docker compose down -v
```

### Qualite code

```bash
# Frontend
cd frontend && npm ci && npm run lint && npm run build

# Backend
cd backend && python3 -m pytest tests/ -v --tb=short
```

## 11. Lancement sans Docker (optionnel)

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

## 12. Depannage

### La liste projets est vide

- verifier que `DOCUMENTS_PATH` pointe vers un dossier existant,
- verifier qu'il contient des sous-dossiers (un par projet),
- verifier le montage volume Docker dans `docker-compose*.yaml`.

### Timeline / Graphe / Galerie semblent vides

- lancer un scan complet du projet,
- verifier le statut dans la page `Scans`,
- verifier les logs worker: `docker compose logs -f celery-worker`.

### L'UI charge mais les recherches ne repondent pas

- verifier l'API: `curl http://localhost:8100/api/health/`,
- verifier Meilisearch/Qdrant/Redis dans `docker compose ps`,
- verifier que `GEMINI_API_KEY` est renseignee pour la partie semantique.

### Erreurs OCR

- les binaires OCR sont installes dans les images Docker backend/workers,
- en mode local hors Docker, il faut installer Tesseract/ffmpeg/poppler/pst-utils.

## 13. Securite et usage

- Ne pas activer `DISABLE_AUTH=true` en production.
- Utiliser des secrets forts (`JWT_SECRET_KEY`, DB password, Meilisearch key).
- Les donnees traitees peuvent etre sensibles: respecter vos contraintes legales/compliance.

## 14. API de reference

Une fois le backend lance:

- OpenAPI/Swagger: `http://localhost:8100/docs`

Exemples d'endpoints:

- `POST /api/scan/`
- `POST /api/search/`
- `GET /api/projects/`
- `GET /api/documents/{id}`
- `POST /api/chat/`
- `GET /api/entities/`
- `GET /api/timeline/aggregation`

---

Si vous devez onboarder une equipe rapidement: commencez par les sections 4, 5, 6, puis 10.
