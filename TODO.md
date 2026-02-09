# Archon - TODO

## ✅ Phases terminées (1-14)

- Phase 1-4: UX Foundations, Browse & Filters, Favorites & Tags, Navigation Multi-Pages
- Phase 5: Extraction Archives (ZIP, RAR, 7Z, TAR)
- Phase 6: Timeline / Heatmap Interactive
- Phase 7: NER (SpaCy — People, Organizations, Locations)
- Phase 8: Interface Cockpit (4 zones synchronisées)
- Phase 9: Chaîne de Preuve (MD5/SHA256 + Audit Logs)
- Phase 10: Chat IA (RAG Gemini Flash + Qdrant retrieval)
- Phase 11: Système Multi-Projets
- Phase 12: Workflow Investigatif (Notes + Synthèse IA des favoris)
- Phase 13: Economies d'échelle (Estimateur de coûts + toggles IA)
- Phase 14: Vérification totale (1.37M docs / 210GB)

---

## 🔴 Bugs corrigés (Audit Feb 2026)

- [x] `run_scan.delay` signature mismatch (enable_embeddings positional → keyword)
- [x] Hash columns commentées dans models.py → décommentées
- [x] `enable_embeddings` ignoré dans le worker Celery → guard conditionnel ajouté
- [x] CORS manquant pour port 3100
- [x] SSE events `onmessage` → `addEventListener` pour events nommés
- [x] `DocumentType.VIDEO` manquant dans l'enum
- [x] `doc.content_text` → `doc.text_content` dans favorites.py (synthèse vide)
- [x] `doc.content` → `doc.text_content` dans export.py (CSV/PDF vides)
- [x] Timeline chargeait tous les docs en mémoire → SQL GROUP BY
- [x] VIDEO type manquant dans stats.py, schemas.py, documents.py, api.ts

---

## 🎨 UX — Améliorations (Feb 2026)

### Round 1 — Navigation ✅

- [x] Suppression du bouton Scanner en double dans le header
- [x] Renommage des labels : Cockpit → Analyse, IA → Chat IA
- [x] Déplacement de Scans en bouton utilitaire (droite)
- [x] Header compact (h-16 → h-14)
- [x] Galerie : images + vidéos

### Round 2 — Différenciation des pages ✅

- [x] Recherche = recherche simple (widgets Timeline/Entités retirés)
- [x] Analyse = dashboard investigation (filtres + entités + timeline compacte)
- [x] Ajout filtre Vidéos dans le panneau Analyse

### Round 3 — États vides + Raccourcis ✅

- [x] Hook `useKeyboardShortcuts` créé
- [x] Raccourci `/` → focus recherche, `Escape` → blur
- [x] 4 suggestions de prompts cliquables sur le Chat IA vide

### Round 4 — Thème + Backend ✅

- [x] Toggle dark/light mode avec `ThemeProvider` + localStorage
- [x] Light theme CSS complet (variables `.light`)
- [x] Bouton Sun/Moon dans le header
- [x] Remplacement de tous les `print()` par `logger` (5 fichiers backend)

---

## 🏗️ Features restantes

### Priorité Haute

- [x] **Isolation chat par session** : Historique par onglet via `X-Session-Id` header
- [x] **Rate limiting API Gemini** : 15 req/min chat, 10 req/min doc AI (sliding window)
- [x] **Gestion projets dans l'UI** : Renommer, archiver, supprimer un projet

### Priorité Moyenne

- [x] **Lazy Video OCR** : Déférer l'OCR vidéo jusqu'à l'accès
- [x] **Incremental Indexing** : Ne re-scanner que les fichiers modifiés (via hash)
- [x] **Zip bomb protection** : Vérification taille décompressée
- [x] **Faceted search** : Endpoint `/api/search/facets` + filtres size/date/entity

### Priorité Basse

- [x] **Internationalisation (i18n)** : Support FR/EN avec sélecteur de langue
- [x] **Breadcrumb** dans le viewer de documents
- [x] **Tests unitaires** : pytest (hashing, rate limiter, archive extracteur)
- [x] **CI/CD** : GitHub Actions (ruff, pytest, tsc, docker build)

---

## 🔒 Audit Feb 2026 — Améliorations

- [x] **JWT Authentication** : Login, register, refresh, RBAC (admin/analyst/viewer)
- [x] **Protected Routes** : Frontend redirect /login, authFetch avec token refresh
- [x] **Health Check** : `/api/health` (DB, Redis, Meilisearch, Qdrant)
- [x] **Error Boundary** : Crash handler React avec fallback UI
- [x] **Shell Injection Fix** : subprocess → os.walk
- [x] **Memory Leak Fix** : Chat sessions TTL (1h/100 max)
- [x] **Secrets Externalized** : docker-compose.prod.yaml → env vars
- [x] **datetime.utcnow** → `datetime.now(timezone.utc)` (12 instances)
- [x] **Batch Embeddings** : embed_content(list) par lots de 100
- [x] **API Prefix Standardized** : 12 routers uniformisés
- [x] **i18n Prompts** : AI system prompts FR/EN
- [x] **Naming Cleanup** : "War Room" → "Archon" (26 files)

---

## 🔮 Nice-to-Have — Feb 2026

- [x] **Alembic Migrations** : Scaffolding complet (env.py, script template, versions/)
- [x] **Redis Rate Limiter** : Sorted set sliding window, fallback in-memory si Redis down
- [x] **Docker Multi-Stage** : 3 stages (base → builder → runtime), non-root user, healthcheck
- [x] **Tests d'Intégration** : 30+ tests (health, auth/RBAC, documents, favorites, tags, audit, entities)
- [x] **AI.md** : Prompt contextuel ~800 lignes pour audit externe (API, UX, pipeline, architecture)
- [x] **GalleryPage Auth Fix** : fetch() → authFetch() (contournement JWT corrigé)

---

## ⚠️ Configuration

```bash
export GEMINI_API_KEY="clé_gemini"
export DOCUMENTS_PATH="/chemin/vers/documents"
docker compose up -d
```

## Accès

- **App**: http://localhost:3100
- **API**: http://localhost:8100/docs
