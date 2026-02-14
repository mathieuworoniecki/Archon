# AUDIT MEGA COMPLET - Repository Archon

Date: 13/02/2026
Type: audit exhaustif fonction-par-fonction (backend + frontend + tests)

## Mise a jour execution (13/02/2026 - post-corrections)

Etat de traitement des points non-OK du plan:

- Traites dans cette passe:
  - `backend/app/api/scan.py::create_scan` (verrou local + advisory lock PG + dedup idempotent)
  - `backend/app/api/scan.py::estimate_scan` (cache signe path+mtime+size, garde profondeur, ignore dirs couteux)
  - `backend/app/api/search.py::hybrid_search` (fusion ponderee effective via `semantic_weight`)
  - `frontend/src/pages/EntitiesPage.tsx::EntitiesPage` (merge mode stabilise via phases explicites)
  - `frontend/src/pages/EntitiesPage.tsx::fetchCoOccurrences` (AbortController + sequence guard anti-race)
  - `frontend/src/pages/FavoritesPage.tsx::handleRemoveFavorite` (queue/timers robustes + cleanup unmount)
  - `frontend/src/pages/FavoritesPage.tsx::generateSynthesis` (validation payload + retry/backoff)
  - `frontend/src/pages/HomePage.tsx::handleSearch` + `handleModeChange` (sync URL/mode/localStorage)
  - `frontend/src/pages/TimelinePage.tsx::handleDecadeClick` (toggle deterministe)
- Deja traites dans le code courant (verifies):
  - `backend/app/services/meilisearch.py::MeilisearchService.search`
  - `backend/app/workers/tasks.py::run_scan` (pipeline batche discover/hash/dedup/index/persist + reprise)
  - `frontend/src/hooks/useSearch.ts::loadMore` et callback associe
  - `frontend/src/pages/*::getDateRangeFromParam/getDateFromDays` (mutualisation via `lib/dateRange.ts`)
  - `frontend/src/pages/*::formatNumber/formatDuration` (mutualisation via `lib/formatters.ts`)
  - `frontend/src/router.tsx::RootLayout` + `shortcuts__callback` (landmarks/ARIA/focus + deps i18n)
  - `frontend/src/pages/ChatPage.tsx::sendMessage` (AbortController + requestId anti-stale)

## Couverture

| Zone | Fichiers | Fonctions |
|---|---:|---:|
| Backend App | 35 | 249 |
| Backend Tests | 14 | 234 |
| Frontend Src | 72 | 1104 |
| Total | 121 | 1587 |

## Scores Globaux

| Score global | Valeur |
|---|---:|
| Logique moyenne | 7.27/10 |
| Pertinence moyenne | 6.83/10 |
| Potentiel d'evolution moyen | 4.85/10 |

| Statut | Nombre de fonctions |
|---|---:|
| OK | 1559 |
| fragile | 9 |
| doublon | 8 |
| illogique | 4 |
| incoherent | 6 |
| a_refaire | 1 |

## Verification Runtime

| Verification | Commande | Resultat |
|---|---|---|
| Backend tests | `cd backend && python3 -m pytest tests/ -q` | `242 passed, 4 skipped` |
| Frontend build | `cd frontend && npm run build` | OK (warning chunk size) |
| Frontend lint | `cd frontend && npm run lint` | OK |

## Points Critiques

### Corriges

- `backend/app/api/deep_analysis.py`: endpoints securises (auth + role).
- `backend/app/api/audit.py`: creation manuelle admin-only et metadata auteur.
- `backend/app/services/ai_chat.py`: retrieval context + prompt fix.
- `backend/app/services/pii_detector.py`: respect des filtres `enabled_types` par requete.
- `backend/app/workers/tasks.py`: persistance robuste de l'etat FAILED.

### Restants prioritaires

- Aucun restant prioritaire bloquant apres corrections et verification runtime.

## Plan d'amelioration detaille (tous les points non-OK)

| Fonction | Statut | En quoi ameliorer | Comment ameliorer (actionnable) |
|---|---|---|---|
| `backend/app/api/scan.py::create_scan` | fragile | Eviter les doublons de scan en lancement concurrent. | Ajouter contrainte unique DB sur `(project_id, normalized_path, active_status)`, utiliser transaction avec lock (`SELECT ... FOR UPDATE`) et retourner le scan existant en cas de conflit. |
| `backend/app/api/scan.py::estimate_scan` | illogique | Reduire le cout I/O sur gros arbres de fichiers. | Mettre un cache par `(path, mtime, size)`, ajouter mode echantillonnage pour tres gros volumes et limiter profondeur/ignore patterns. |
| `backend/app/api/search.py::hybrid_search` | incoherent | Rendre le poids semantique reellement influent sur le ranking final. | Normaliser scores lexical/vector, appliquer fusion ponderee unique, puis ajouter tests de monotonicite sur `semantic_weight`. |
| `backend/app/services/meilisearch.py::MeilisearchService.search` | fragile | Securiser la construction des filtres. | Remplacer les strings brutes par un builder type (whitelist champs/operateurs + escaping), rejeter filtres invalides, ajouter tests malformed/injection. |
| `backend/app/workers/tasks.py::run_scan` | illogique | Diminuer la complexite et fiabiliser dedup/hash. | Decouper en pipeline (`discover -> hash -> dedup -> index -> persist`), definir politique de hash stable, checkpoints idempotents avec reprise. |
| `frontend/src/hooks/useSearch.ts::loadMore` | illogique | Eviter la derive pagination/filtre entre requetes. | Stocker un `querySignature` (term+filters+sort) dans le curseur, invalider `loadMore` si signature change, reset page sur changement de filtres. |
| `frontend/src/hooks/useSearch.ts::loadMore__callback` | illogique | Meme risque de derive que `loadMore`. | Appliquer les memes garde-fous de signature et reset explicite; couvrir par test hook sur changement rapide de filtre. |
| `frontend/src/pages/BrowsePage.tsx::getDateRangeFromParam` | doublon | Supprimer duplication avec HomePage. | Extraire dans `frontend/src/lib/dateRange.ts` et reutiliser partout, avec tests unitaires sur plages invalides/partielles. |
| `frontend/src/pages/BrowsePage.tsx::getDateFromDays` | doublon | Supprimer helper date duplique. | Centraliser dans le meme util date partage et remplacer les copies locales. |
| `frontend/src/pages/ChatPage.tsx::sendMessage` | fragile | Fiabiliser stream/cancel et eviter etats stale. | Creer un `AbortController` par envoi, annuler stream precedent avant nouveau submit, utiliser `requestId` pour ignorer reponses obsoletes. |
| `frontend/src/pages/EntitiesPage.tsx::EntitiesPage` | a_refaire | Refaire la logique merge-mode trop fragile. | Extraire en machine d'etat (selection source/cible -> preview -> confirm), verrouiller actions pendant merge, messages d'erreur/succes explicites. |
| `frontend/src/pages/EntitiesPage.tsx::EntityDetailPanel` | fragile | Eviter affichage stale lors de changement d'entite. | Requeter par cle stable `(entityId, filters)`, nettoyer etat sur changement, utiliser couche cache type React Query/SWR avec invalidation claire. |
| `frontend/src/pages/EntitiesPage.tsx::fetchCoOccurrences` | fragile | Eviter race conditions sur switches rapides. | Ajouter annulation (`AbortController`) + numero de sequence et ignorer resultat si `entityId` courant a change. |
| `frontend/src/pages/FavoritesPage.tsx::handleRemoveFavorite` | fragile | Stabiliser logique timer undo/remove. | Piloter les suppressions en file par `favoriteId` avec expiration, annuler timer sur undo/unmount, tester cas multi-remove rapides. |
| `frontend/src/pages/FavoritesPage.tsx::generateSynthesis` | fragile | Durcir le traitement des erreurs de payload. | Valider schema de reponse (ex: Zod), gerer payload vide/partiel, ajouter retry/backoff et message erreur precis. |
| `frontend/src/pages/HomePage.tsx::getDateRangeFromParam` | doublon | Supprimer duplication avec BrowsePage. | Mutualiser dans `frontend/src/lib/dateRange.ts`, importer le meme helper dans Home et Browse. |
| `frontend/src/pages/HomePage.tsx::handleSearch` | incoherent | Simplifier couplage fragile mode/date <-> URL. | Creer un unique hook de serialisation URL (source de verite), appliquer transitions atomiques des params. |
| `frontend/src/pages/HomePage.tsx::handleSearch__callback` | incoherent | Meme couplage URL fragile que `handleSearch`. | Reutiliser le meme hook URL state et limiter callback a dispatch d'intention. |
| `frontend/src/pages/HomePage.tsx::handleModeChange` | incoherent | Completer persistance de mode. | Persister mode dans URL + localStorage avec regles de precedence explicites et sync sur `popstate`. |
| `frontend/src/pages/HomePage.tsx::handleModeChange__callback` | incoherent | Meme faiblesse de persistance que `handleModeChange`. | Recentrer la logique dans un seul handler et garder callback pur (sans logique de persistence). |
| `frontend/src/pages/HomePage.tsx::getDateFromDays` | doublon | Supprimer helper duplique avec BrowsePage. | Factoriser dans util date partage + tests unitaires timezone/locale. |
| `frontend/src/pages/ProjectDashboard.tsx::formatNumber` | doublon | Eviter formatage numerique duplique. | Centraliser dans `frontend/src/lib/formatters.ts` avec `Intl.NumberFormat` configure. |
| `frontend/src/pages/ProjectDashboard.tsx::formatDuration` | doublon | Eviter formatage duree duplique. | Centraliser dans `frontend/src/lib/formatters.ts` et harmoniser affichage court/long. |
| `frontend/src/pages/ScansPage.tsx::formatNumber` | doublon | Meme doublon de formatage numerique. | Remplacer par util partage `formatNumber` importee depuis `lib/formatters.ts`. |
| `frontend/src/pages/ScansPage.tsx::formatDuration` | doublon | Meme doublon de formatage duree. | Remplacer par util partage `formatDuration` importee depuis `lib/formatters.ts`. |
| `frontend/src/pages/TimelinePage.tsx::handleDecadeClick` | fragile | Clarifier UX selection/deselection decennie. | Utiliser etat deterministe (`selectedDecade` ou `null`), comportement toggle explicite et tests UI sur clic repetes. |
| `frontend/src/router.tsx::RootLayout` | incoherent | Renforcer semantique/accessibilite navigation. | Structurer landmarks (`header/nav/main/footer`), labels ARIA, gestion focus au changement de route, verifier au clavier. |
| `frontend/src/router.tsx::shortcuts__callback` | fragile | Eviter desync des raccourcis avec deps/i18n. | Recalculer map commandes sur deps completes (i18n inclus), cleanup listeners systematique, tests changement de langue. |

## Matrice Exhaustive Par Fichier

Colonnes:
- `Logique`: coherence interne et correction technique.
- `Pertinence`: valeur fonctionnelle pour le produit.
- `Potentiel evolution`: gain attendu si retravail prioritaire (plus haut = plus de ROI).

Legende statut: `OK`, `fragile`, `doublon`, `illogique`, `incoherent`, `a_refaire`.

## Backend App

### `backend/app/api/admin.py` (6 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 58 | `list_users` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 100 | `get_user` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 122 | `update_user_role` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 160 | `update_user_active` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 199 | `create_user` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 239 | `delete_user` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |

### `backend/app/api/audit.py` (6 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 42 | `get_client_ip` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 50 | `_compute_entry_hash` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 61 | `log_audit_action` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 99 | `get_audit_logs` | `async_function` | 8/10 | 8/10 | 6/10 | OK | Admin-only access enforced. |
| 140 | `get_document_audit_trail` | `async_function` | 8/10 | 8/10 | 6/10 | OK | Restricted to admin/analyst. |
| 181 | `create_audit_log` | `async_function` | 8/10 | 8/10 | 7/10 | OK | Admin-only + actor metadata recorded. |

### `backend/app/api/auth.py` (6 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 32 | `auth_config` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 74 | `login` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 108 | `register` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 156 | `admin_register` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 201 | `get_me` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 214 | `refresh_token` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |

### `backend/app/api/chat.py` (8 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 47 | `_get_session_id` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 53 | `chat` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 77 | `chat_stream` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 91 | `event_generator` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 112 | `summarize_document` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 143 | `ask_question_about_document` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 176 | `get_chat_history` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 188 | `clear_chat_history` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |

### `backend/app/api/deep_analysis.py` (4 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 21 | `get_deep_analysis` | `function` | 8/10 | 8/10 | 6/10 | OK | Auth required (hardening applied). |
| 38 | `get_deep_analysis_status` | `function` | 8/10 | 7/10 | 6/10 | OK | Auth required (hardening applied). |
| 60 | `trigger_deep_analysis` | `function` | 8/10 | 9/10 | 7/10 | OK | Role guard admin/analyst applied. |
| 98 | `trigger_batch_deep_analysis` | `function` | 8/10 | 9/10 | 7/10 | OK | Role guard admin/analyst applied. |

### `backend/app/api/documents.py` (9 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 22 | `list_documents` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 104 | `get_document` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 113 | `get_document_content` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 144 | `get_document_file` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 208 | `get_document_highlights` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 262 | `delete_document` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 292 | `get_document_thumbnail` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 410 | `scan_for_redactions` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 458 | `get_document_redaction` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/api/entities.py` (6 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 48 | `list_entities` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 90 | `get_entity_types` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 113 | `get_document_entities` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 133 | `search_by_entity` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 196 | `get_entity_graph` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 297 | `merge_entities` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/api/export.py` (8 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 30 | `export_csv` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 97 | `export_pdf` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 169 | `export_search_results_csv` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 250 | `_concordance_encode` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 262 | `_make_bates` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 268 | `export_dat` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 349 | `export_opt` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 417 | `export_redacted_pdf` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/api/favorites.py` (7 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 21 | `list_favorites` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 65 | `create_favorite` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 121 | `get_favorite_by_document` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 153 | `update_favorite` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 195 | `delete_favorite` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 213 | `check_favorite_status` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 229 | `synthesize_favorites` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |

### `backend/app/api/health.py` (1 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 18 | `health_check` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |

### `backend/app/api/projects.py` (7 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 40 | `get_directory_stats` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 111 | `_get_documents_dir` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 116 | `_resolve_project_path` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 144 | `list_projects` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 190 | `get_project` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 224 | `list_project_files` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 273 | `get_project_stats` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |

### `backend/app/api/scan.py` (14 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 22 | `create_scan` | `function` | 6/10 | 9/10 | 9/10 | fragile | Concurrent starts can race without hard uniqueness lock on path. |
| 73 | `estimate_scan` | `function` | 6/10 | 8/10 | 9/10 | illogique | Repeated traversal is expensive on very large trees. |
| 150 | `categorize_ext` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 246 | `list_scans` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 264 | `get_scan` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 273 | `get_scan_progress` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 304 | `stream_scan_progress` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 322 | `event_generator` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 445 | `delete_scan` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 486 | `rename_scan` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 499 | `cancel_scan` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 520 | `resume_scan` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 569 | `list_interrupted_scans` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 578 | `factory_reset` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/api/search.py` (4 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 26 | `reciprocal_rank_fusion` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 117 | `hybrid_search` | `async_function` | 6/10 | 9/10 | 8/10 | incoherent | semantic_weight partially disconnected from ranking fusion. |
| 277 | `get_search_facets` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 371 | `quick_search` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |

### `backend/app/api/stats.py` (3 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 17 | `get_stats` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 79 | `stream_stats` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 89 | `event_generator` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |

### `backend/app/api/tags.py` (5 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 18 | `list_tags` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 36 | `create_tag` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 66 | `get_tag` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 87 | `update_tag` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 122 | `delete_tag` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/api/timeline.py` (2 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 37 | `get_timeline_aggregation` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 142 | `get_timeline_range` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/config.py` (2 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 59 | `Settings.data_dir` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 68 | `get_settings` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/database.py` (4 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 25 | `_run_migrations` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 51 | `init_db` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 57 | `get_db` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 67 | `get_db_context` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/main.py` (9 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 35 | `lifespan` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 45 | `_recover_orphaned_scans` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 124 | `ConnectionManager.__init__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 127 | `ConnectionManager.connect` | `async_method` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 133 | `ConnectionManager.disconnect` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 139 | `ConnectionManager.broadcast` | `async_method` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 156 | `websocket_scan_progress` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 255 | `root` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 265 | `health_check` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/services/ai_chat.py` (18 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 23 | `ChatMessage.__init__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 28 | `ChatMessage.to_dict` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 38 | `DocumentContext.__init__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 44 | `DocumentContext.to_dict` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 84 | `AIChatService._get_system_prompt` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 87 | `AIChatService.__init__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 94 | `AIChatService._retrieve_context` | `method` | 8/10 | 9/10 | 7/10 | OK | Uses Qdrant chunk_text correctly now. |
| 122 | `AIChatService._build_context_prompt` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 134 | `AIChatService._build_conversation_context` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 147 | `AIChatService.chat` | `async_method` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 210 | `AIChatService.stream_chat` | `async_method` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 272 | `AIChatService.summarize_document` | `async_method` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 305 | `AIChatService.answer_about_document` | `async_method` | 8/10 | 9/10 | 7/10 | OK | Prompt source fixed via _get_system_prompt. |
| 331 | `AIChatService.clear_history` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 335 | `AIChatService.get_history` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 348 | `_evict_stale_sessions` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 363 | `get_chat_service` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 373 | `clear_session` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/services/archive_extractor.py` (14 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 41 | `ArchiveExtractor.__init__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 55 | `ArchiveExtractor._check_size_limit` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 69 | `ArchiveExtractor.is_archive` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 82 | `ArchiveExtractor._create_temp_dir` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 88 | `ArchiveExtractor._extract_zip` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 116 | `ArchiveExtractor._extract_rar` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 134 | `ArchiveExtractor._extract_7z` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 155 | `ArchiveExtractor._extract_tar` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 178 | `ArchiveExtractor.extract_archive` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 205 | `ArchiveExtractor.extract_recursive` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 267 | `ArchiveExtractor.cleanup` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 277 | `ArchiveExtractor.__enter__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 280 | `ArchiveExtractor.__exit__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 284 | `get_archive_extractor` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/services/email_parser.py` (9 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 43 | `EmailResult.to_searchable_text` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 95 | `EmailParserService.is_email_file` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 99 | `EmailParserService.get_email_type` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 110 | `EmailParserService.parse_eml` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 129 | `EmailParserService.parse_mbox` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 158 | `EmailParserService.parse_pst` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 214 | `EmailParserService.extract_text` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 253 | `EmailParserService._parse_message` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 325 | `get_email_parser` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/services/embeddings.py` (9 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 21 | `EmbeddingsService.__init__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 27 | `EmbeddingsService.count_tokens` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 31 | `EmbeddingsService.chunk_text` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 70 | `EmbeddingsService.get_embedding` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 79 | `EmbeddingsService.get_embeddings_batch` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 104 | `EmbeddingsService.get_query_embedding` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 113 | `EmbeddingsService.embed_chunks` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 132 | `EmbeddingsService.process_document` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 147 | `get_embeddings_service` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/services/forensic_image.py` (10 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 51 | `ForensicImageService.__init__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 62 | `ForensicImageService.is_forensic_image` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 66 | `ForensicImageService.get_image_type` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 77 | `ForensicImageService.mount_image` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 112 | `ForensicImageService.unmount_and_cleanup` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 144 | `ForensicImageService.list_files` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 171 | `ForensicImageService._mount_e01` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 276 | `ForensicImageService._mount_dd` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 314 | `ForensicImageService._mount_aff` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 365 | `get_forensic_service` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/services/langextract_service.py` (6 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 34 | `_build_examples` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 107 | `LangExtractService.__init__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 112 | `LangExtractService.available` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 123 | `LangExtractService.analyze_document` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 203 | `LangExtractService._build_summary` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 236 | `get_langextract_service` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/services/meilisearch.py` (9 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 15 | `MeilisearchService.__init__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 23 | `MeilisearchService._ensure_index` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 39 | `MeilisearchService.index_document` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 67 | `MeilisearchService.index_documents_batch` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 76 | `MeilisearchService.search` | `method` | 5/10 | 8/10 | 9/10 | fragile | Raw filter string construction remains sensitive to malformed input. |
| 144 | `MeilisearchService.delete_document` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 150 | `MeilisearchService.delete_by_scan` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 156 | `MeilisearchService.health_check` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 169 | `get_meilisearch_service` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/services/ner_service.py` (5 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 45 | `NERService.__init__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 56 | `NERService.nlp` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 82 | `NERService.extract_entities` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 151 | `NERService.get_entity_summary` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 172 | `get_ner_service` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/services/ocr.py` (11 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 34 | `OCRService.__init__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 37 | `OCRService._check_tesseract` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 45 | `OCRService.detect_type` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 62 | `OCRService.extract_text` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 88 | `OCRService._extract_from_email` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 100 | `OCRService._extract_from_pdf` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 132 | `OCRService._extract_from_image` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 150 | `OCRService._extract_from_text` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 171 | `OCRService._extract_from_video` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 250 | `OCRService.get_file_metadata` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 266 | `get_ocr_service` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/services/pii_detector.py` (6 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 80 | `PIIDetector.__init__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 96 | `PIIDetector.detect` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 132 | `PIIDetector.redact_text` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 156 | `PIIDetector._validate_ssn` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 171 | `PIIDetector._validate_luhn` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 194 | `get_pii_detector` | `function` | 8/10 | 8/10 | 7/10 | OK | Request-specific enabled_types respected. |

### `backend/app/services/qdrant.py` (8 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 21 | `QdrantService.__init__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 26 | `QdrantService._ensure_collection` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 57 | `QdrantService.index_chunks` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 102 | `QdrantService.search` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 166 | `QdrantService.delete_by_document` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 183 | `QdrantService.delete_by_scan` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 200 | `QdrantService.health_check` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 213 | `get_qdrant_service` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/services/redaction_detector.py` (1 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 62 | `detect_redaction` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/utils/auth.py` (8 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 30 | `hash_password` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 35 | `verify_password` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 40 | `create_access_token` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 60 | `create_refresh_token` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 71 | `decode_token` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 88 | `get_current_user` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 127 | `require_role` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 129 | `role_checker` | `async_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |

### `backend/app/utils/hashing.py` (4 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 19 | `compute_fast_hash` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 48 | `compute_file_hashes` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 76 | `compute_content_hashes` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 84 | `verify_file_hash` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/utils/rate_limiter.py` (7 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 34 | `RateLimiter.__init__` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 59 | `RateLimiter._get_client_key` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 66 | `RateLimiter._check_redis` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 95 | `RateLimiter._check_memory` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 114 | `RateLimiter.check` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 142 | `RateLimiter.get_remaining` | `method` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 166 | `_get_redis_url` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `backend/app/workers/tasks.py` (13 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 52 | `update_scan_progress` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 62 | `log_scan_error` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 74 | `compute_fast_hash_safe` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 83 | `compute_proof_hashes_safe` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 91 | `extract_file_safe` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 124 | `discover_files_streaming` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 135 | `_scan_dir` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 171 | `run_scan` | `function` | 5/10 | 9/10 | 10/10 | illogique | Very complex flow; dedup/hash strategy still inconsistent and needs refactor. |
| 223 | `on_discovery_progress` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 532 | `run_ner_batch` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 607 | `run_embeddings_batch` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 683 | `process_document` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 736 | `run_deep_analysis` | `function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

## Backend Tests

### `backend/tests/conftest.py` (12 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 29 | `setup_test_db` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 40 | `db_engine` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 49 | `db_session` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 60 | `client` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 62 | `override_get_db` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 77 | `admin_user` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 98 | `admin_headers` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 104 | `analyst_user` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 125 | `analyst_headers` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 133 | `temp_dir` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 142 | `sample_text_file` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 150 | `sample_zip_file` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |

### `backend/tests/test_archive_extractor.py` (10 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 16 | `TestArchiveExtractor.extractor` | `method` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 19 | `TestArchiveExtractor.test_zip_extraction` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 34 | `TestArchiveExtractor.test_tar_extraction` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 51 | `TestArchiveExtractor.test_supports_zip` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 56 | `TestArchiveExtractor.test_supports_tar` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 62 | `TestArchiveExtractor.test_not_archive` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 68 | `TestArchiveExtractor.test_zip_bomb_protection` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 81 | `TestArchiveExtractor.test_path_traversal_protection_zip` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 93 | `TestArchiveExtractor.test_empty_zip` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 105 | `TestArchiveExtractor.test_non_existent_archive` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |

### `backend/tests/test_auth_security.py` (59 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 20 | `TestAllRoutesRequireAuth.test_scan_list_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 23 | `TestAllRoutesRequireAuth.test_scan_create_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 26 | `TestAllRoutesRequireAuth.test_scan_estimate_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 29 | `TestAllRoutesRequireAuth.test_scan_progress_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 32 | `TestAllRoutesRequireAuth.test_scan_delete_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 35 | `TestAllRoutesRequireAuth.test_scan_factory_reset_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 39 | `TestAllRoutesRequireAuth.test_search_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 42 | `TestAllRoutesRequireAuth.test_search_facets_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 45 | `TestAllRoutesRequireAuth.test_search_quick_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 49 | `TestAllRoutesRequireAuth.test_documents_list_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 52 | `TestAllRoutesRequireAuth.test_documents_get_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 55 | `TestAllRoutesRequireAuth.test_documents_delete_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 59 | `TestAllRoutesRequireAuth.test_export_csv_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 62 | `TestAllRoutesRequireAuth.test_export_pdf_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 65 | `TestAllRoutesRequireAuth.test_export_dat_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 68 | `TestAllRoutesRequireAuth.test_export_opt_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 71 | `TestAllRoutesRequireAuth.test_export_redacted_pdf_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 74 | `TestAllRoutesRequireAuth.test_export_search_csv_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 78 | `TestAllRoutesRequireAuth.test_chat_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 81 | `TestAllRoutesRequireAuth.test_chat_summarize_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 85 | `TestAllRoutesRequireAuth.test_projects_list_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 89 | `TestAllRoutesRequireAuth.test_favorites_list_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 92 | `TestAllRoutesRequireAuth.test_favorites_create_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 96 | `TestAllRoutesRequireAuth.test_audit_list_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 100 | `TestAllRoutesRequireAuth.test_entities_list_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 103 | `TestAllRoutesRequireAuth.test_entity_types_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 107 | `TestAllRoutesRequireAuth.test_tags_list_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 110 | `TestAllRoutesRequireAuth.test_tags_create_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 114 | `TestAllRoutesRequireAuth.test_timeline_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 118 | `TestAllRoutesRequireAuth.test_stats_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 122 | `TestAllRoutesRequireAuth.test_deep_analysis_get_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 125 | `TestAllRoutesRequireAuth.test_deep_analysis_status_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 128 | `TestAllRoutesRequireAuth.test_deep_analysis_trigger_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 131 | `TestAllRoutesRequireAuth.test_deep_analysis_batch_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 140 | `TestPublicEndpoints.test_health_no_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 144 | `TestPublicEndpoints.test_auth_config_no_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 148 | `TestPublicEndpoints.test_auth_login_no_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 161 | `TestRegistrationSecurity.test_bootstrap_register_first_user_is_admin` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 170 | `TestRegistrationSecurity.test_register_blocked_after_first_user` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 184 | `TestRegistrationSecurity.test_admin_register_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 192 | `TestRegistrationSecurity.test_admin_register_creates_analyst` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 201 | `TestRegistrationSecurity.test_analyst_cannot_admin_register` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 215 | `TestRBACEnforcement.test_factory_reset_requires_admin` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 220 | `TestRBACEnforcement.test_factory_reset_allowed_for_admin` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 225 | `TestRBACEnforcement.test_audit_list_requires_admin` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 230 | `TestRBACEnforcement.test_audit_list_allowed_for_admin` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 234 | `TestRBACEnforcement.test_redacted_pdf_requires_admin_or_analyst` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 242 | `TestRBACEnforcement.test_audit_log_creation_requires_admin` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 250 | `TestRBACEnforcement.test_deep_analysis_trigger_allowed_for_analyst` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 261 | `TestJWTValidation.test_invalid_token_returns_401` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 266 | `TestJWTValidation.test_expired_token_returns_401` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 280 | `TestJWTValidation.test_refresh_token_not_accepted_as_access` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 288 | `TestJWTValidation.test_valid_token_returns_data` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 299 | `TestAuthEndpoints.test_login_valid` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 310 | `TestAuthEndpoints.test_login_wrong_password` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 317 | `TestAuthEndpoints.test_login_nonexistent_user` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 324 | `TestAuthEndpoints.test_me_returns_user_info` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 331 | `TestAuthEndpoints.test_refresh_token_flow` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 343 | `TestAuthEndpoints.test_refresh_with_access_token_fails` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |

### `backend/tests/test_email_parser.py` (7 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 13 | `TestEmailParserInit.test_import_and_create` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 18 | `TestEmailParserInit.test_extension_detection` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 27 | `TestEmailParserInit.test_email_type_detection` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 40 | `TestEMLParsing.test_parse_simple_eml` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 66 | `TestEMLParsing.test_parse_eml_not_found` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 73 | `TestEMLParsing.test_searchable_text_output` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 95 | `TestEMLParsing.test_extract_text_method` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |

### `backend/tests/test_export_api.py` (12 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 10 | `TestExportCSV.test_csv_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 13 | `TestExportCSV.test_csv_with_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 22 | `TestExportPDF.test_pdf_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 25 | `TestExportPDF.test_pdf_with_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 33 | `TestExportDAT.test_dat_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 36 | `TestExportDAT.test_dat_with_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 44 | `TestExportOPT.test_opt_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 47 | `TestExportOPT.test_opt_with_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 55 | `TestExportSearchCSV.test_search_csv_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 60 | `TestExportRedactedPDF.test_redacted_pdf_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 65 | `TestExportRedactedPDF.test_redacted_pdf_admin_allowed` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 72 | `TestExportRedactedPDF.test_redacted_pdf_analyst_allowed` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |

### `backend/tests/test_export_dat.py` (10 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 9 | `make_mock_document` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 36 | `TestConcordanceDelimiters.test_concordance_encode_basic` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 41 | `TestConcordanceDelimiters.test_concordance_encode_none` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 46 | `TestConcordanceDelimiters.test_concordance_encode_newlines` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 52 | `TestConcordanceDelimiters.test_concordance_encode_crlf` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 62 | `TestBatesNumbering.test_default_padding` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 67 | `TestBatesNumbering.test_custom_prefix` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 71 | `TestBatesNumbering.test_large_number` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 79 | `TestDATFields.test_required_fields_present` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 86 | `TestDATFields.test_field_count` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |

### `backend/tests/test_graph_and_redaction_api.py` (14 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 12 | `TestEntityGraphEndpoint.test_graph_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 17 | `TestEntityGraphEndpoint.test_graph_returns_structure` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 28 | `TestEntityGraphEndpoint.test_graph_entity_type_filter` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 37 | `TestEntityGraphEndpoint.test_graph_invalid_entity_type` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 42 | `TestEntityGraphEndpoint.test_graph_limit_parameter` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 49 | `TestEntityGraphEndpoint.test_graph_min_count_parameter` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 58 | `TestEntityGraphEndpoint.test_graph_limit_validation` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 66 | `TestEntityGraphEndpoint.test_graph_node_structure` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 78 | `TestEntityGraphEndpoint.test_graph_edge_structure` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 93 | `TestRedactionScanEndpoint.test_redaction_scan_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 98 | `TestRedactionScanEndpoint.test_redaction_scan_requires_admin_or_analyst` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 108 | `TestRedactionScanEndpoint.test_redaction_scan_returns_summary` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 125 | `TestDocumentRedactionEndpoint.test_redaction_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 130 | `TestDocumentRedactionEndpoint.test_redaction_not_found` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |

### `backend/tests/test_hashing.py` (10 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 12 | `TestComputeFileHashes.test_basic_hash` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 23 | `TestComputeFileHashes.test_empty_file` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 33 | `TestComputeFileHashes.test_non_existent_file` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 39 | `TestComputeFileHashes.test_deterministic` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 49 | `TestComputeFileHashes.test_large_file` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 64 | `TestComputeContentHashes.test_basic` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 70 | `TestComputeContentHashes.test_empty_content` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 79 | `TestVerifyFileHash.test_matching_hash` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 87 | `TestVerifyFileHash.test_mismatched_hash` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 93 | `TestVerifyFileHash.test_case_insensitive` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |

### `backend/tests/test_integration.py` (25 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 15 | `TestHealth.test_health_endpoint_returns_200` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 23 | `TestHealth.test_health_no_auth_required` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 32 | `TestAuth.test_register_first_user_is_admin` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 42 | `TestAuth.test_register_blocked_after_first_user` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 54 | `TestAuth.test_admin_register_creates_analyst` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 63 | `TestAuth.test_register_duplicate_username_fails` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 75 | `TestAuth.test_login_valid_credentials` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 85 | `TestAuth.test_login_wrong_password` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 92 | `TestAuth.test_me_endpoint` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 99 | `TestAuth.test_me_without_token` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 103 | `TestAuth.test_refresh_token` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 122 | `TestProtectedEndpoints.test_stats_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 127 | `TestProtectedEndpoints.test_search_with_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 141 | `TestStats.test_stats_returns_structure` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 151 | `TestDocuments.test_list_documents_empty` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 158 | `TestDocuments.test_list_documents_filters_by_project_path` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 211 | `TestDocuments.test_get_nonexistent_document` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 219 | `TestTimeline.test_timeline_filters_by_project_path` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 281 | `TestFavorites.test_list_favorites_empty` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 295 | `TestTags.test_list_tags_empty` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 300 | `TestTags.test_create_tag` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 309 | `TestTags.test_create_duplicate_tag_fails` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 318 | `TestAudit.test_list_audit_logs` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 327 | `TestEntities.test_list_entities_empty` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 332 | `TestEntities.test_entity_types` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |

### `backend/tests/test_pii_detector.py` (18 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 10 | `TestPIIDetection.test_detect_ssn` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 18 | `TestPIIDetection.test_reject_invalid_ssn` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 26 | `TestPIIDetection.test_detect_email` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 34 | `TestPIIDetection.test_detect_credit_card` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 42 | `TestPIIDetection.test_reject_invalid_credit_card` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 50 | `TestPIIDetection.test_detect_french_phone` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 57 | `TestPIIDetection.test_no_false_positives_on_clean_text` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 64 | `TestPIIDetection.test_multiple_pii_in_one_text` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 78 | `TestPIIRedaction.test_redact_text` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 86 | `TestPIIRedaction.test_redact_clean_text_unchanged` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 96 | `TestLuhnValidation.test_valid_visa` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 100 | `TestLuhnValidation.test_valid_mastercard` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 104 | `TestLuhnValidation.test_invalid_number` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 108 | `TestLuhnValidation.test_too_short` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 116 | `TestSSNValidation.test_valid_ssn` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 120 | `TestSSNValidation.test_invalid_area_000` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 124 | `TestSSNValidation.test_invalid_area_666` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 128 | `TestSSNValidation.test_invalid_area_900` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |

### `backend/tests/test_rate_limiter.py` (8 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 12 | `_make_request` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 24 | `TestRateLimiter.test_allows_within_limit` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 32 | `TestRateLimiter.test_blocks_over_limit` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 44 | `TestRateLimiter.test_different_clients_independent` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 59 | `TestRateLimiter.test_window_expiration` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 72 | `TestRateLimiter.test_forwarded_for_header` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 83 | `TestRateLimiter.test_get_remaining` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 97 | `TestRateLimiter.test_cleanup_removes_old_entries` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |

### `backend/tests/test_redaction_detector.py` (28 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 13 | `TestDetectRedaction.test_none_text_returns_clean` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 19 | `TestDetectRedaction.test_empty_text_returns_clean` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 24 | `TestDetectRedaction.test_short_text_returns_clean` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 28 | `TestDetectRedaction.test_clean_text_returns_clean` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 40 | `TestExplicitMarkers.test_redacted_bracket` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 48 | `TestExplicitMarkers.test_expurge_bracket` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 54 | `TestExplicitMarkers.test_xxxx_pattern` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 60 | `TestExplicitMarkers.test_block_characters` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 66 | `TestExplicitMarkers.test_withheld_keyword` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 71 | `TestExplicitMarkers.test_sealed_keyword` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 76 | `TestExplicitMarkers.test_classified_with_context` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 82 | `TestExplicitMarkers.test_underscores` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 92 | `TestClassificationMarkers.test_foia_exemption_b6` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 98 | `TestClassificationMarkers.test_foia_exemption_b7` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 103 | `TestClassificationMarkers.test_classified_by_pattern` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 109 | `TestClassificationMarkers.test_foia_keyword` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 118 | `TestObscuredPatterns.test_asterisks` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 124 | `TestObscuredPatterns.test_long_dashes` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 130 | `TestObscuredPatterns.test_hashes` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 139 | `TestConfidenceScoring.test_high_confidence_explicit` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 146 | `TestConfidenceScoring.test_lower_confidence_obscured` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 154 | `TestConfidenceScoring.test_multiple_signal_types` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 166 | `TestRedactionResultStructure.test_fields_present` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 173 | `TestRedactionResultStructure.test_markers_found_is_sorted` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 178 | `TestRedactionResultStructure.test_confidence_bounded` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 189 | `TestEdgeCases.test_word_redacted_in_bracket_context` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 195 | `TestEdgeCases.test_code_with_underscores_not_triggered` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 201 | `TestEdgeCases.test_normal_dashes_not_triggered` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |

### `backend/tests/test_scan_api.py` (14 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 12 | `TestScanList.test_list_scans_empty` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 18 | `TestScanList.test_list_scans_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 23 | `TestScanCreate.test_create_scan_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 26 | `TestScanCreate.test_create_scan_with_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 37 | `TestScanEstimate.test_estimate_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 40 | `TestScanEstimate.test_estimate_with_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 51 | `TestScanProgress.test_progress_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 54 | `TestScanProgress.test_progress_nonexistent_scan` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 60 | `TestScanDelete.test_delete_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 63 | `TestScanDelete.test_delete_nonexistent_scan` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 67 | `TestScanDelete.test_delete_requires_admin_or_analyst` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 74 | `TestScanFactoryReset.test_factory_reset_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 77 | `TestScanFactoryReset.test_factory_reset_requires_admin` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 81 | `TestScanFactoryReset.test_factory_reset_admin_allowed` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |

### `backend/tests/test_search_api.py` (7 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 11 | `_meilisearch_available` | `function` | 8/10 | 7/10 | 5/10 | OK | Fixture/helper for tests. |
| 18 | `TestSearch.test_search_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 21 | `TestSearch.test_search_with_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 33 | `TestSearchFacets.test_facets_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 36 | `TestSearchFacets.test_facets_with_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 42 | `TestQuickSearch.test_quick_search_requires_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |
| 45 | `TestQuickSearch.test_quick_search_with_auth` | `method` | 8/10 | 8/10 | 5/10 | OK | Test case contributes directly to regression safety. |

## Frontend Src

### `frontend/src/components/AppBreadcrumb.tsx` (1 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 19 | `AppBreadcrumb` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `frontend/src/components/CommandPalette.tsx` (34 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 21 | `getRecentSearches` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 29 | `addRecentSearch` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 31 | `anonymous_filter_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 40 | `CommandPalette` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 46 | `navItems` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 46 | `navItems__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 47 | `action` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 48 | `action` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 49 | `action` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 50 | `action` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 51 | `action` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 52 | `action` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 53 | `action` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 54 | `action` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 57 | `recentItems` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 57 | `recentItems__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 58 | `anonymous_map_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 63 | `action` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 70 | `allItems` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 70 | `allItems__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 74 | `anonymous_filter_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 80 | `anonymous_useEffect_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 85 | `anonymous_useEffect_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 89 | `anonymous_setTimeout_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 93 | `handleKeyDown` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 93 | `handleKeyDown__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 97 | `anonymous_setActiveIndex_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 101 | `anonymous_setActiveIndex_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 143 | `anonymous_jsx_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 160 | `anonymous_map_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 161 | `sectionItems` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 161 | `sectionItems__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 169 | `anonymous_map_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 175 | `anonymous_jsx_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/ErrorBoundary.tsx` (4 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 19 | `getDerivedStateFromError` | `method_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 23 | `componentDidCatch` | `method_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 27 | `render` | `method_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 48 | `anonymous_jsx_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/browse/BrowseFilters.tsx` (11 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 49 | `BrowseFilters` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 60 | `getDateFromDays` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 66 | `handleDatePreset` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 78 | `anonymous_find_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 84 | `anonymous_map_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 93 | `anonymous_jsx_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 125 | `anonymous_map_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 126 | `anonymous_jsx_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 132 | `anonymous_jsx_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 149 | `anonymous_map_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 152 | `anonymous_jsx_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/cockpit/FilterPanel.tsx` (12 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 22 | `FilterPanel` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 25 | `handleSearch` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 31 | `handleKeyDown` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 37 | `toggleFileType` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 40 | `anonymous_filter_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 45 | `handleEntitySelect` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 58 | `anonymous_jsx_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 81 | `anonymous_jsx_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 89 | `anonymous_jsx_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 97 | `anonymous_jsx_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 111 | `anonymous_map_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 116 | `anonymous_jsx_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/cockpit/MetadataBar.tsx` (3 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 18 | `MetadataBar` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 25 | `anonymous_filter_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 60 | `anonymous_map_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/entities/EntityFilter.tsx` (8 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 18 | `EntityFilter` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 30 | `getTypeCount` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 31 | `summary` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 31 | `summary__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 51 | `anonymous_map_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 64 | `anonymous_jsx_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 81 | `anonymous_map_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 88 | `anonymous_jsx_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/favorites/FavoriteButton.tsx` (2 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 14 | `FavoriteButton` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 31 | `anonymous_jsx_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/gallery/GalleryView.tsx` (34 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 20 | `GalleryView` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 30 | `mediaDocuments` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 30 | `mediaDocuments__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 31 | `anonymous_filter_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 38 | `isVideo` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 43 | `filteredDocuments` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 43 | `filteredDocuments__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 48 | `anonymous_filter_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 50 | `anonymous_filter_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 55 | `anonymous_filter_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 57 | `anonymous_filter_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 59 | `anonymous_filter_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 65 | `getThumbnailUrl` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 69 | `handleClick` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 73 | `handleDoubleClick` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 101 | `anonymous_jsx_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 119 | `anonymous_jsx_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 134 | `anonymous_jsx_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 143 | `anonymous_jsx_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 152 | `anonymous_jsx_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 169 | `anonymous_map_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 175 | `anonymous_jsx_13` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 188 | `anonymous_map_14` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 194 | `anonymous_jsx_15` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 208 | `anonymous_jsx_16` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 224 | `anonymous_map_17` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 227 | `anonymous_jsx_18` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 228 | `anonymous_jsx_19` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 240 | `anonymous_jsx_20` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 276 | `anonymous_map_21` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 279 | `anonymous_jsx_22` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 280 | `anonymous_jsx_23` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 304 | `anonymous_jsx_24` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 361 | `anonymous_jsx_25` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/gallery/MediaViewer.tsx` (25 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 16 | `MediaViewer` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 30 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 37 | `anonymous_useEffect_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 38 | `handleKeyDown` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 44 | `anonymous_setZoom_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 45 | `anonymous_setZoom_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 49 | `anonymous_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 52 | `goToPrev` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 52 | `goToPrev__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 53 | `anonymous_setCurrentIndex_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 59 | `goToNext` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 59 | `goToNext__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 60 | `anonymous_setCurrentIndex_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 66 | `toggleOcr` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 66 | `toggleOcr__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 108 | `anonymous_jsx_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 108 | `anonymous_setZoom_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 112 | `anonymous_jsx_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 112 | `anonymous_setZoom_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 138 | `anonymous_jsx_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 179 | `anonymous_jsx_13` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 180 | `anonymous_jsx_14` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 216 | `anonymous_map_15` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 223 | `anonymous_jsx_16` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 233 | `anonymous_jsx_17` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/graph/RelationshipGraph.tsx` (53 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 57 | `RelationshipGraph` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 70 | `getNodeColor` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 70 | `getNodeColor__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 72 | `anonymous_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 77 | `anonymous_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 81 | `radiusScale` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 81 | `radiusScale__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 82 | `anonymous_map_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 87 | `edgeScale` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 87 | `edgeScale__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 88 | `anonymous_map_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 92 | `anonymous_useEffect_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 99 | `simNodes` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 99 | `simNodes__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 100 | `simEdges` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 100 | `simEdges__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 107 | `zoom__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 116 | `anonymous_id_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 118 | `anonymous_strength_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 122 | `anonymous_radius_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 131 | `link__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 142 | `anonymous_on_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 147 | `anonymous_on_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 151 | `anonymous_on_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 160 | `anonymous_attr_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 161 | `anonymous_attr_13` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 163 | `anonymous_attr_14` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 169 | `anonymous_attr_15` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 171 | `anonymous_attr_16` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 178 | `anonymous_text_17` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 179 | `anonymous_attr_18` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 182 | `anonymous_attr_19` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 188 | `anonymous_on_20` | `function_expression` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 196 | `anonymous_attr_21` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 201 | `anonymous_attr_22` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 207 | `anonymous_on_23` | `function_expression` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 215 | `anonymous_attr_24` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 217 | `anonymous_on_25` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 223 | `anonymous_on_26` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 225 | `anonymous_attr_27` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 226 | `anonymous_attr_28` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 227 | `anonymous_attr_29` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 228 | `anonymous_attr_30` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 230 | `anonymous_attr_31` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 233 | `anonymous_32` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 239 | `activeTypes` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 239 | `activeTypes__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 240 | `anonymous_map_33` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 241 | `anonymous_filter_34` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 256 | `anonymous_map_35` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 265 | `anonymous_36` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 266 | `n` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 266 | `n__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/projects/ProjectSelector.tsx` (5 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 24 | `formatBytes` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 32 | `formatDate` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 41 | `ProjectSelector` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 80 | `anonymous_map_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 85 | `anonymous_jsx_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/scan/ScanConfigPanel.tsx` (4 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 19 | `ScanConfigPanel` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 30 | `formatNumber` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 38 | `anonymous_filter_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 82 | `anonymous_map_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/scan/ScanDetailModal.tsx` (8 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 33 | `ScanDetailModal` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 38 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 43 | `anonymous_then_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 44 | `anonymous_then_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 45 | `anonymous_catch_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 46 | `anonymous_finally_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 61 | `formatDuration` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 209 | `anonymous_map_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/search/ResultCard.tsx` (9 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 16 | `ResultCard` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 21 | `getFileIcon` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 36 | `handleMouseEnter` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 36 | `handleMouseEnter__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 39 | `anonymous_setTimeout_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 42 | `handleMouseLeave` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 42 | `handleMouseLeave__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 70 | `anonymous_jsx_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 177 | `anonymous_jsx_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/search/ResultList.tsx` (26 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 28 | `ResultList` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 46 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 52 | `anonymous_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 58 | `anonymous_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 63 | `toggleSelection` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 63 | `toggleSelection__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 65 | `anonymous_setSelectedIds_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 76 | `selectAll` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 76 | `selectAll__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 77 | `anonymous_map_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 80 | `clearSelection` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 80 | `clearSelection__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 84 | `handleBatchFavorite` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 84 | `handleBatchFavorite__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 89 | `anonymous_map_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 99 | `handleBatchExport` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 99 | `handleBatchExport__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 104 | `selectedResults` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 104 | `selectedResults__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 107 | `anonymous_map_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 131 | `anonymous_map_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 221 | `anonymous_jsx_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 255 | `anonymous_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 258 | `anonymous_map_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 265 | `anonymous_jsx_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 276 | `anonymous_jsx_13` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/search/SearchBar.tsx` (26 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 40 | `SearchBar` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 50 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 56 | `anonymous_useEffect_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 62 | `anonymous_useEffect_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 64 | `anonymous_map_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 70 | `fetchFacets` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 70 | `fetchFacets__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 74 | `anonymous_then_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 75 | `anonymous_catch_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 78 | `anonymous_useEffect_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 80 | `toggleFileType` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 80 | `toggleFileType__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 81 | `anonymous_setFileTypes_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 82 | `anonymous_filter_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 86 | `handleSubmit` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 104 | `anonymous_filter_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 105 | `anonymous_map_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 109 | `anonymous_find_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 111 | `anonymous_map_13` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 124 | `anonymous_map_14` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 140 | `anonymous_jsx_15` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 155 | `anonymous_map_16` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 162 | `anonymous_jsx_17` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 183 | `anonymous_jsx_18` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 193 | `anonymous_map_19` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 199 | `anonymous_jsx_20` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/search/SearchStartPanel.tsx` (4 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 7 | `getRecentSearches` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 20 | `SearchStartPanel` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 52 | `anonymous_map_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 56 | `anonymous_jsx_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/search/SearchStatsPanel.tsx` (7 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 21 | `formatBytes` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 29 | `SearchStatsPanel` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 42 | `anonymous_map_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 50 | `anonymous_forEach_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 78 | `anonymous_filter_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 79 | `anonymous_map_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 100 | `anonymous_map_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/timeline/TimelineHeatmap.tsx` (13 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 16 | `getIntensityColor` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 27 | `formatDateLabel` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 41 | `getTooltipText` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 44 | `anonymous_map_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 49 | `TimelineHeatmap` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 60 | `displayData` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 60 | `displayData__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 63 | `anonymous_filter_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 70 | `maxCount` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 70 | `maxCount__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 72 | `anonymous_map_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 98 | `anonymous_map_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 108 | `anonymous_jsx_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/ui/EmptyState.tsx` (4 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 10 | `EmptyState` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 14 | `handleStartScan` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 22 | `handleSelectProject` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 26 | `getScanButtonLabel` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |

### `frontend/src/components/ui/alert-dialog.tsx` (14 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 15 | `AlertDialogOverlay` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 18 | `AlertDialogOverlay__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 30 | `AlertDialogContent` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 33 | `AlertDialogContent__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 52 | `AlertDialogHeader` | `arrow_function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 66 | `AlertDialogFooter` | `arrow_function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 80 | `AlertDialogTitle` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 83 | `AlertDialogTitle__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 92 | `AlertDialogDescription` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 95 | `AlertDialogDescription__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 105 | `AlertDialogAction` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 108 | `AlertDialogAction__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 117 | `AlertDialogCancel` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 120 | `AlertDialogCancel__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/ui/badge.tsx` (1 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 28 | `Badge` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `frontend/src/components/ui/button.tsx` (2 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 38 | `Button` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 39 | `Button__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/ui/card.tsx` (10 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 4 | `Card` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 7 | `Card__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 22 | `CardHeader` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 25 | `CardHeader__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 34 | `CardTitle` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 37 | `CardTitle__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 46 | `CardDescription` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 49 | `CardDescription__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 58 | `CardContent` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 61 | `CardContent__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/ui/checkbox.tsx` (2 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 7 | `Checkbox` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 10 | `Checkbox__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/ui/dialog.tsx` (9 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 11 | `DialogOverlay` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 14 | `DialogOverlay__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 26 | `DialogContent` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 29 | `DialogContent__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 54 | `DialogHeader` | `arrow_function` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 65 | `DialogTitle` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 68 | `DialogTitle__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 77 | `DialogDescription` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 80 | `DialogDescription__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/ui/dropdown-menu.tsx` (13 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 9 | `DropdownMenu` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 13 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 14 | `handleClickOutside` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 20 | `anonymous_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 25 | `anonymous_map_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 29 | `onClick` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 34 | `onClose` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 50 | `DropdownMenuTrigger` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 63 | `DropdownMenuContent` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 78 | `anonymous_map_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 81 | `onSelect` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 101 | `DropdownMenuItem` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 116 | `DropdownMenuSeparator` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `frontend/src/components/ui/input.tsx` (2 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 7 | `Input` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 8 | `Input__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/ui/label.tsx` (2 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 11 | `Label` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 15 | `Label__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/ui/popover.tsx` (2 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 10 | `PopoverContent` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 13 | `PopoverContent__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/ui/progress.tsx` (2 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 5 | `Progress` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 8 | `Progress__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/ui/scroll-area.tsx` (4 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 5 | `ScrollArea` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 8 | `ScrollArea__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 23 | `ScrollBar` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 26 | `ScrollBar__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/ui/select.tsx` (14 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 13 | `SelectTrigger` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 16 | `SelectTrigger__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 33 | `SelectScrollUpButton` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 36 | `SelectScrollUpButton__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 50 | `SelectScrollDownButton` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 53 | `SelectScrollDownButton__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 68 | `SelectContent` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 71 | `SelectContent__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 104 | `SelectLabel` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 107 | `SelectLabel__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 116 | `SelectItem` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 119 | `SelectItem__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 138 | `SelectSeparator` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 141 | `SelectSeparator__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/ui/skeleton.tsx` (10 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 3 | `Skeleton` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 19 | `ProjectCardSkeleton` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 40 | `ResultCardSkeleton` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 59 | `ScanRowSkeleton` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 73 | `GraphSkeleton` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 77 | `anonymous_map_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 93 | `TimelineSkeleton` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 98 | `anonymous_map_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 117 | `GalleryGridSkeleton` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 120 | `anonymous_map_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/ui/slider.tsx` (2 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 5 | `Slider` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 8 | `Slider__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/ui/switch.tsx` (2 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 6 | `Switch` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 9 | `Switch__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/ui/tabs.tsx` (6 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 10 | `TabsList` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 13 | `TabsList__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 26 | `TabsTrigger` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 29 | `TabsTrigger__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 41 | `TabsContent` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 44 | `TabsContent__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/ui/textarea.tsx` (2 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 7 | `Textarea` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 8 | `Textarea__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/components/viewer/DeepAnalysisPanel.tsx` (18 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 33 | `DeepAnalysisPanel` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 42 | `checkAnalysis` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 42 | `checkAnalysis__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 84 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 93 | `anonymous_useEffect_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 96 | `interval` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 96 | `interval__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 113 | `anonymous_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 118 | `anonymous_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 122 | `anonymous_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 126 | `grouped` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 126 | `grouped__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 137 | `StatusBadge` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 167 | `anonymous_jsx_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 205 | `anonymous_map_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 220 | `anonymous_map_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 227 | `anonymous_map_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 245 | `anonymous_map_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/components/viewer/DocumentViewer.tsx` (36 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 40 | `Breadcrumb` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 48 | `anonymous_map_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 61 | `RedactionBadge` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 65 | `anonymous_useEffect_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 67 | `anonymous_then_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 69 | `anonymous_catch_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 94 | `EntityPanel` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 100 | `anonymous_useEffect_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 103 | `anonymous_then_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 105 | `anonymous_catch_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 106 | `anonymous_finally_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 112 | `grouped` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 112 | `grouped__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 120 | `anonymous_jsx_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 142 | `anonymous_map_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 155 | `anonymous_sort_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 155 | `anonymous_map_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 183 | `ProjectOverviewPanel` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 198 | `types` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 204 | `types__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 206 | `formatBytes` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 244 | `anonymous_map_13` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 272 | `DocumentViewer` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 279 | `anonymous_useEffect_14` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 287 | `anonymous_then_15` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 291 | `anonymous_catch_16` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 292 | `anonymous_finally_17` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 309 | `highlightText` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 326 | `anonymous_jsx_18` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 337 | `anonymous_jsx_19` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 350 | `anonymous_jsx_20` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 358 | `anonymous_jsx_21` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 365 | `anonymous_jsx_22` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 381 | `anonymous_jsx_23` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 417 | `anonymous_jsx_24` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 425 | `anonymous_jsx_25` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/contexts/CockpitContext.tsx` (13 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 45 | `useCockpit` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 60 | `CockpitProvider` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 69 | `setSelectedDocument` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 69 | `setSelectedDocument__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 74 | `updateFilters` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 74 | `updateFilters__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 75 | `anonymous_setFilters_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 78 | `setResults` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 78 | `setResults__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 83 | `setLoading` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 83 | `setLoading__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 87 | `clearSelection` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 87 | `clearSelection__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/contexts/I18nContext.tsx` (8 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 17 | `getNestedValue` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 30 | `I18nProvider` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 31 | `anonymous_useState_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 36 | `setLocale` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 36 | `setLocale__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 41 | `t` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 41 | `t__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 52 | `useTranslation` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `frontend/src/contexts/ProjectContext.tsx` (10 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 40 | `ProjectProvider` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 41 | `anonymous_useState_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 53 | `fetchProjects` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 53 | `fetchProjects__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 69 | `anonymous_useEffect_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 71 | `selectProject` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 71 | `selectProject__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 76 | `clearProject` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 76 | `clearProject__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 96 | `useProject` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `frontend/src/hooks/useBrowse.ts` (27 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 13 | `useBrowse` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 27 | `fetchDocuments` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 27 | `fetchDocuments__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 44 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 46 | `anonymous_setFilters_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 57 | `anonymous_useEffect_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 61 | `updateFilters` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 61 | `updateFilters__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 62 | `anonymous_setFilters_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 69 | `toggleFileType` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 69 | `toggleFileType__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 70 | `anonymous_setFilters_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 73 | `anonymous_filter_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 83 | `setDateRange` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 83 | `setDateRange__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 84 | `anonymous_setFilters_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 92 | `setSortBy` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 92 | `setSortBy__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 93 | `anonymous_setFilters_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 100 | `nextPage` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 100 | `nextPage__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 104 | `anonymous_setFilters_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 111 | `prevPage` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 111 | `prevPage__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 115 | `anonymous_setFilters_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 122 | `clearFilters` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 122 | `clearFilters__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/hooks/useEntities.ts` (8 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 31 | `useEntities` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 39 | `fetchEntities` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 39 | `fetchEntities__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 61 | `fetchTypeSummary` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 61 | `fetchTypeSummary__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 73 | `searchDocumentsByEntity` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 73 | `searchDocumentsByEntity__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 88 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/hooks/useFavorites.ts` (9 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 11 | `useFavorite` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 17 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 24 | `checkStatus` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 38 | `toggleFavorite` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 38 | `toggleFavorite__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 69 | `useFavorites` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 75 | `fetchFavorites` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 75 | `fetchFavorites__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 90 | `anonymous_useEffect_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/hooks/useKeyboardShortcuts.ts` (4 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 19 | `useKeyboardShortcuts` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 20 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 21 | `handleKeyDown` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 48 | `anonymous_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/hooks/useProjects.ts` (4 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 20 | `useProjects` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 26 | `fetchProjects` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 26 | `fetchProjects__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 48 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/hooks/useScanProgress.ts` (9 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 4 | `useScanProgress` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 11 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 20 | `connection__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 24 | `connection__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 28 | `connection__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 32 | `connection__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 40 | `anonymous_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 45 | `disconnect` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 45 | `disconnect__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/hooks/useSearch.ts` (10 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 15 | `useSearch` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 27 | `performSearch` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 27 | `performSearch__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 59 | `loadMore` | `wrapper_function` | 6/10 | 8/10 | 9/10 | illogique | Pagination can drift from initial filter set in edge cases. |
| 59 | `loadMore__callback` | `arrow_function` | 6/10 | 8/10 | 9/10 | illogique | Callback inherits pagination/filter drift risk. |
| 75 | `anonymous_setResults_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 86 | `clearResults` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 86 | `clearResults__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 97 | `retry` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 97 | `retry__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |

### `frontend/src/hooks/useStats.ts` (4 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 4 | `useStats` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 9 | `fetchStats` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 9 | `fetchStats__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 22 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/hooks/useTheme.tsx` (6 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 12 | `ThemeProvider` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 13 | `anonymous_useState_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 18 | `anonymous_useEffect_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 28 | `toggleTheme` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 29 | `anonymous_setTheme_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 39 | `useTheme` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `frontend/src/hooks/useTimeline.ts` (6 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 31 | `useTimeline` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 40 | `fetchTimeline` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 40 | `fetchTimeline__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 62 | `fetchRange` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 62 | `fetchRange__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 78 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/lib/api.ts` (39 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 154 | `estimateScan` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 162 | `createScan` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 172 | `getScans` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 178 | `getScan` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 184 | `getScanProgress` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 190 | `cancelScan` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 197 | `resumeScan` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 205 | `deleteScan` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 219 | `getSearchFacets` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 228 | `search` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 253 | `getDocument` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 259 | `getDocumentHighlights` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 275 | `getDocumentFileUrl` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 279 | `getStats` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 307 | `getDocuments` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 313 | `anonymous_forEach_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 329 | `checkHealth` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 337 | `connectScanStream` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 352 | `parseSSEEvents` | `function_declaration` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 368 | `connect` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 447 | `close` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 456 | `connectScanWebSocket` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 464 | `anonymous_connectScanStream_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 465 | `anonymous_connectScanStream_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 504 | `getTags` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 510 | `createTag` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 520 | `updateTag` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 530 | `deleteTag` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 536 | `getFavorites` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 539 | `anonymous_forEach_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 549 | `addFavorite` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 559 | `updateFavorite` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 569 | `removeFavorite` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 574 | `checkFavoriteStatus` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 581 | `factoryReset` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 622 | `getDeepAnalysis` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 628 | `getDeepAnalysisStatus` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 634 | `triggerDeepAnalysis` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 642 | `triggerBatchDeepAnalysis` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |

### `frontend/src/lib/auth.ts` (12 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 18 | `getToken` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 22 | `getRefreshToken` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 26 | `setTokens` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 31 | `setUser` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 35 | `getUser` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 41 | `clearAuth` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 47 | `isAuthDisabled` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 51 | `checkAuthConfig` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 63 | `isAuthenticated` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 80 | `getAuthHeaders` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 88 | `authFetch` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 115 | `tryRefreshToken` | `function_declaration` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |

### `frontend/src/lib/entityTypes.ts` (1 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 39 | `getEntityLabel` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `frontend/src/lib/utils.ts` (4 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 4 | `cn` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 8 | `formatFileSize` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 16 | `formatDate` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 27 | `getFileIcon` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `frontend/src/main.tsx` (1 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 12 | `anonymous_finally_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/pages/BrowsePage.tsx` (32 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 21 | `getDateRangeFromParam` | `function_declaration` | 6/10 | 6/10 | 9/10 | doublon | Duplicate utility logic also exists in HomePage. |
| 48 | `BrowsePage` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 85 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 95 | `anonymous_useEffect_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 104 | `anonymous_useEffect_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 106 | `debounce` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 106 | `debounce__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 113 | `anonymous_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 116 | `handleSelectResult` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 116 | `handleSelectResult__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 120 | `handleSearchSubmit` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 120 | `handleSearchSubmit__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 127 | `handleSearchKeyDown` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 127 | `handleSearchKeyDown__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 133 | `handleClearSearch` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 133 | `handleClearSearch__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 138 | `getDateFromDays` | `arrow_function` | 5/10 | 6/10 | 9/10 | doublon | Duplicate helper with HomePage. |
| 144 | `handleDatePreset` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 155 | `browseResultsAsSearchResults` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 155 | `browseResultsAsSearchResults__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 175 | `anonymous_find_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 206 | `anonymous_jsx_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 227 | `anonymous_map_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 235 | `anonymous_jsx_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 256 | `anonymous_map_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 257 | `anonymous_jsx_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 262 | `anonymous_jsx_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 278 | `anonymous_map_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 281 | `anonymous_jsx_13` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 297 | `anonymous_jsx_14` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 323 | `anonymous_jsx_15` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 326 | `anonymous_jsx_16` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/pages/ChatPage.tsx` (57 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 18 | `preprocessCitations` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 19 | `anonymous_replace_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 23 | `CitationBadge` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 27 | `anonymous_jsx_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 28 | `anonymous_jsx_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 29 | `anonymous_jsx_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 62 | `loadConversations` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 71 | `saveConversations` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 75 | `createConversation` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 86 | `ChatPage` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 87 | `anonymous_useState_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 91 | `anonymous_useState_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 107 | `anonymous_find_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 112 | `anonymous_useEffect_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 117 | `anonymous_useEffect_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 121 | `updateConversation` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 121 | `updateConversation__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 122 | `anonymous_setConversations_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 123 | `anonymous_map_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 128 | `handleCitationHover` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 128 | `handleCitationHover__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 132 | `handleCitationClick` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 132 | `handleCitationClick__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 140 | `markdownComponents` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 140 | `markdownComponents__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 141 | `p` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 142 | `ul` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 143 | `ol` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 144 | `li` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 145 | `strong` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 146 | `code` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 154 | `a` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 166 | `h1` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 167 | `h2` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 168 | `h3` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 171 | `sendMessage` | `arrow_function` | 6/10 | 9/10 | 9/10 | fragile | Streaming/cancellation path needs stronger guards. |
| 206 | `anonymous_catch_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 259 | `handleNewConversation` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 261 | `anonymous_setConversations_13` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 266 | `handleDeleteConversation` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 274 | `anonymous_setConversations_14` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 275 | `filtered` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 275 | `filtered__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 288 | `handleKeyPress` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 320 | `anonymous_map_15` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 329 | `anonymous_jsx_16` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 336 | `anonymous_jsx_17` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 351 | `anonymous_jsx_18` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 373 | `anonymous_map_19` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 376 | `anonymous_jsx_20` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 378 | `anonymous_setTimeout_21` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 391 | `anonymous_map_22` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 461 | `anonymous_jsx_23` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 465 | `anonymous_setTimeout_24` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 487 | `anonymous_jsx_25` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 512 | `anonymous_map_26` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 519 | `anonymous_jsx_27` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/pages/CockpitPage.tsx` (9 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 12 | `CockpitContent` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 26 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 47 | `anonymous_useEffect_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 51 | `anonymous_useEffect_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 55 | `handleSearch` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 55 | `handleSearch__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 63 | `handleSelectResult` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 63 | `handleSelectResult__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 114 | `CockpitPage` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

### `frontend/src/pages/EntitiesPage.tsx` (33 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 20 | `EntitiesPage` | `function_declaration` | 6/10 | 9/10 | 9/10 | a_refaire | Merge-mode UX/flow remains fragile. |
| 38 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 47 | `anonymous_catch_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 48 | `anonymous_finally_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 53 | `totalEntities` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 53 | `totalEntities__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 54 | `totalMentions` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 54 | `totalMentions__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 83 | `anonymous_jsx_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 91 | `anonymous_map_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 93 | `summary` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 93 | `summary__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 102 | `anonymous_jsx_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 120 | `anonymous_jsx_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 130 | `anonymous_jsx_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 171 | `anonymous_map_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 180 | `anonymous_jsx_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 182 | `anonymous_setMergeSelected_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 250 | `anonymous_jsx_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 253 | `selectedEntities` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 253 | `selectedEntities__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 258 | `anonymous_map_13` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 267 | `anonymous_map_14` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 304 | `anonymous_jsx_15` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 326 | `EntityDetailPanel` | `function_declaration` | 6/10 | 8/10 | 9/10 | fragile | Co-occurrence fetch lifecycle can show stale data. |
| 344 | `anonymous_useEffect_16` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 345 | `fetchCoOccurrences` | `arrow_function` | 6/10 | 8/10 | 9/10 | fragile | No robust cancellation/guard on rapid entity switching. |
| 358 | `sorted` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 359 | `anonymous_sort_17` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 361 | `sorted__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 428 | `anonymous_map_18` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 437 | `anonymous_jsx_19` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 464 | `anonymous_map_20` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/pages/FavoritesPage.tsx` (73 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 30 | `loadCollections` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 37 | `saveCollections` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 41 | `FavoritesPage` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 57 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 58 | `anonymous_catch_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 67 | `createCollection` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 82 | `toggleDocInCollection` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 83 | `updated` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 83 | `updated__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 89 | `anonymous_filter_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 97 | `deleteCollection` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 98 | `updated` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 98 | `updated__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 104 | `activeCollection` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 104 | `activeCollection__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 110 | `handleRemoveFavorite` | `wrapper_function` | 6/10 | 8/10 | 8/10 | fragile | Timer-based remove/undo remains state-sensitive. |
| 110 | `handleRemoveFavorite__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 112 | `anonymous_setHiddenIds_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 118 | `timer` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 118 | `timer__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 126 | `anonymous_setHiddenIds_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 139 | `onClick` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 142 | `anonymous_setHiddenIds_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 153 | `toggleTagFilter` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 153 | `toggleTagFilter__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 154 | `anonymous_setSelectedTagIds_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 156 | `anonymous_filter_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 163 | `startEditingNote` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 168 | `saveNote` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 178 | `cancelEditingNote` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 183 | `toggleFavoriteTag` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 184 | `currentTagIds` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 184 | `currentTagIds__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 187 | `anonymous_filter_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 198 | `generateSynthesis` | `arrow_function` | 6/10 | 8/10 | 8/10 | fragile | Error-path handling around response payload can be hardened. |
| 213 | `getFileTypeIcon` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 222 | `formatFileSize` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 228 | `exportFavorites` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 228 | `exportFavorites__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 231 | `anonymous_map_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 232 | `anonymous_map_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 299 | `anonymous_map_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 308 | `anonymous_jsx_13` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 325 | `anonymous_jsx_14` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 329 | `anonymous_map_15` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 334 | `anonymous_jsx_16` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 340 | `anonymous_jsx_17` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 350 | `anonymous_jsx_18` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 351 | `anonymous_jsx_19` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 368 | `anonymous_jsx_20` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 378 | `anonymous_jsx_21` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 398 | `anonymous_jsx_22` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 428 | `anonymous_filter_23` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 429 | `anonymous_filter_24` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 430 | `anonymous_map_25` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 437 | `anonymous_jsx_26` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 459 | `anonymous_map_27` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 477 | `anonymous_jsx_28` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 485 | `anonymous_jsx_29` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 495 | `anonymous_map_30` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 496 | `isSelected` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 496 | `isSelected__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 501 | `anonymous_jsx_31` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 525 | `anonymous_jsx_32` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 533 | `anonymous_jsx_33` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 540 | `anonymous_map_34` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 546 | `anonymous_jsx_35` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 561 | `anonymous_jsx_36` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 564 | `anonymous_jsx_37` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 572 | `anonymous_jsx_38` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 590 | `anonymous_jsx_39` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 615 | `anonymous_jsx_40` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 626 | `anonymous_jsx_41` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/pages/GalleryPage.tsx` (16 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 12 | `GalleryPage` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 24 | `fetchMedia` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 24 | `fetchMedia__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 34 | `anonymous_setDocuments_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 46 | `anonymous_useEffect_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 48 | `handleLoadMore` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 48 | `handleLoadMore__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 55 | `anonymous_useEffect_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 58 | `anonymous_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 66 | `anonymous_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 70 | `handleSearch` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 92 | `searchDocs` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 92 | `searchDocs__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 134 | `anonymous_jsx_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 144 | `anonymous_jsx_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 165 | `anonymous_jsx_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/pages/GraphPage.tsx` (35 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 32 | `GraphPage` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 51 | `measureContainer` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 51 | `measureContainer__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 61 | `anonymous_useEffect_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 64 | `anonymous_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 68 | `fetchGraph` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 68 | `fetchGraph__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 78 | `anonymous_then_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 83 | `anonymous_catch_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 84 | `anonymous_finally_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 87 | `anonymous_useEffect_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 89 | `handleNodeClick` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 105 | `toggleFullscreen` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 111 | `shortestPath` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 111 | `shortestPath__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 136 | `getNodeName` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 136 | `anonymous_find_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 139 | `communities` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 139 | `communities__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 144 | `anonymous_forEach_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 158 | `nodeIds` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 158 | `nodeIds__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 162 | `shuffled` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 162 | `shuffled__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 189 | `anonymous_forEach_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 226 | `anonymous_jsx_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 239 | `anonymous_jsx_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 263 | `anonymous_jsx_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 268 | `anonymous_map_13` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 276 | `anonymous_jsx_14` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 291 | `anonymous_map_15` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 296 | `anonymous_jsx_16` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 309 | `anonymous_map_17` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 314 | `anonymous_jsx_18` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 351 | `anonymous_jsx_19` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/pages/HomePage.tsx` (45 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 34 | `getDateRangeFromParam` | `function_declaration` | 5/10 | 6/10 | 9/10 | doublon | Duplicate utility logic also exists in BrowsePage. |
| 59 | `HomePage` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 77 | `anonymous_useState_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 87 | `saveRecentSearch` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 87 | `saveRecentSearch__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 92 | `anonymous_filter_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 99 | `handleSearch` | `wrapper_function` | 5/10 | 9/10 | 9/10 | incoherent | Mode/date URL state coupling is brittle. |
| 100 | `handleSearch__callback` | `arrow_function` | 5/10 | 9/10 | 9/10 | incoherent | Mode/date URL state coupling is brittle. |
| 120 | `anonymous_useEffect_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 129 | `anonymous_map_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 140 | `anonymous_useEffect_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 150 | `anonymous_useEffect_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 153 | `debounce` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 153 | `debounce__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 159 | `anonymous_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 163 | `handleSelectResult` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 163 | `handleSelectResult__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 167 | `handleStartScan` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 167 | `handleStartScan__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 169 | `project` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 169 | `project__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 175 | `handleModeChange` | `wrapper_function` | 6/10 | 8/10 | 8/10 | incoherent | Mode persistence in URL is incomplete. |
| 175 | `handleModeChange__callback` | `arrow_function` | 6/10 | 8/10 | 8/10 | incoherent | Mode persistence in URL is incomplete. |
| 207 | `getDateFromDays` | `arrow_function` | 5/10 | 6/10 | 9/10 | doublon | Duplicate helper with BrowsePage. |
| 213 | `handleDatePreset` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 224 | `browseResultsAsSearchResults` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 224 | `browseResultsAsSearchResults__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 243 | `anonymous_find_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 270 | `anonymous_jsx_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 282 | `anonymous_jsx_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 304 | `anonymous_map_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 334 | `anonymous_jsx_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 337 | `ids` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 337 | `ids__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 362 | `anonymous_jsx_13` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 394 | `anonymous_jsx_14` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 399 | `anonymous_jsx_15` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 409 | `anonymous_map_16` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 416 | `anonymous_jsx_17` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 438 | `anonymous_map_18` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 439 | `anonymous_jsx_19` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 444 | `anonymous_jsx_20` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 460 | `anonymous_map_21` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 463 | `anonymous_jsx_22` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 477 | `anonymous_jsx_23` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/pages/LoginPage.tsx` (6 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 8 | `LoginPage` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 18 | `handleSubmit` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 144 | `anonymous_jsx_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 165 | `anonymous_jsx_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 176 | `anonymous_jsx_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 214 | `anonymous_jsx_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/pages/ProjectDashboard.tsx` (78 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 39 | `ProjectDashboard` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 59 | `anonymous_useState_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 89 | `anonymous_useEffect_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 95 | `anonymous_useEffect_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 97 | `anonymous_useEffect_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 105 | `fetchScans` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 112 | `running` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 112 | `running__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 122 | `openScanDialog` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 128 | `scan` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 128 | `scan__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 143 | `handleConfirmScan` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 175 | `handleDeleteScan` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 187 | `handleCancelScan` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 198 | `formatBytes` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 206 | `formatNumber` | `arrow_function` | 6/10 | 6/10 | 8/10 | doublon | Same formatter duplicated in ScansPage. |
| 208 | `formatDuration` | `arrow_function` | 6/10 | 6/10 | 8/10 | doublon | Same formatter duplicated in ScansPage. |
| 222 | `getProjectScans` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 223 | `anonymous_filter_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 226 | `getLastScan` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 232 | `getInterruptedScan` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 234 | `anonymous_find_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 239 | `handleDeleteProject` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 256 | `handleRenameScan` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 273 | `handleFactoryReset` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 281 | `anonymous_setTimeout_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 306 | `anonymous_jsx_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 312 | `anonymous_jsx_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 362 | `anonymous_jsx_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 378 | `anonymous_map_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 477 | `anonymous_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 479 | `total` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 479 | `total__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 485 | `anonymous_map_13` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 496 | `anonymous_map_14` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 518 | `anonymous_map_15` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 574 | `anonymous_map_16` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 591 | `anonymous_map_17` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 619 | `anonymous_jsx_18` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 620 | `proj` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 620 | `proj__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 620 | `anonymous_find_19` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 632 | `anonymous_jsx_20` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 633 | `proj` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 633 | `proj__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 633 | `anonymous_find_21` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 644 | `anonymous_jsx_22` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 681 | `anonymous_map_23` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 684 | `hasCompletedScan` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 684 | `hasCompletedScan__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 739 | `anonymous_24` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 757 | `anonymous_jsx_25` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 772 | `anonymous_jsx_26` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 776 | `anonymous_jsx_27` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 792 | `anonymous_jsx_28` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 801 | `anonymous_jsx_29` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 811 | `anonymous_jsx_30` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 820 | `anonymous_jsx_31` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 837 | `anonymous_jsx_32` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 865 | `anonymous_map_33` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 902 | `anonymous_jsx_34` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 906 | `anonymous_jsx_35` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 920 | `anonymous_jsx_36` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 923 | `anonymous_jsx_37` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 931 | `anonymous_38` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 932 | `scan` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 932 | `scan__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 947 | `anonymous_jsx_39` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 956 | `anonymous_jsx_40` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 974 | `anonymous_jsx_41` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 983 | `anonymous_jsx_42` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 990 | `anonymous_jsx_43` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 996 | `anonymous_jsx_44` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 998 | `project` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 998 | `project__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 1014 | `anonymous_jsx_45` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 1056 | `anonymous_jsx_46` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 1078 | `anonymous_jsx_47` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/pages/ScansPage.tsx` (46 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 38 | `ScansPage` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 56 | `anonymous_useState_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 77 | `anonymous_useEffect_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 81 | `anonymous_useEffect_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 89 | `anonymous_useEffect_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 97 | `fetchEstimate` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 110 | `anonymous_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 115 | `handleProjectChange` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 116 | `project` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 116 | `project__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 122 | `fetchScans` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 129 | `running` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 129 | `running__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 143 | `handleStartScan` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 158 | `handleCancelScan` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 169 | `handleResumeScan` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 179 | `handleDeleteScan` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 189 | `openRenameDialog` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 194 | `handleRenameScan` | `arrow_function` | 7/10 | 8/10 | 6/10 | OK | Async orchestration path appears coherent in current design. |
| 216 | `formatNumber` | `arrow_function` | 6/10 | 6/10 | 8/10 | doublon | Same formatter duplicated in ProjectDashboard. |
| 218 | `getStatusBadge` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 230 | `formatDuration` | `arrow_function` | 6/10 | 6/10 | 8/10 | doublon | Same formatter duplicated in ProjectDashboard. |
| 243 | `anonymous_find_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 257 | `anonymous_jsx_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 291 | `anonymous_jsx_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 307 | `anonymous_map_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 406 | `anonymous_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 408 | `total` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 408 | `total__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 414 | `anonymous_map_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 425 | `anonymous_map_12` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 447 | `anonymous_map_13` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 491 | `anonymous_jsx_14` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 496 | `anonymous_jsx_15` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 530 | `anonymous_map_16` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 596 | `anonymous_map_17` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 635 | `anonymous_jsx_18` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 640 | `anonymous_jsx_19` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 644 | `anonymous_jsx_20` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 647 | `anonymous_jsx_21` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 650 | `anonymous_jsx_22` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 665 | `anonymous_jsx_23` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 670 | `anonymous_jsx_24` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 683 | `anonymous_jsx_25` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 696 | `anonymous_jsx_26` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 707 | `anonymous_jsx_27` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/pages/TimelinePage.tsx` (23 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 24 | `formatDate` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 34 | `TimelinePage` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 51 | `decades` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 51 | `decades__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 65 | `decadeCounts` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 65 | `decadeCounts__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 68 | `anonymous_forEach_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 81 | `handleDateClick` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 81 | `handleDateClick__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 110 | `anonymous_setZoomStack_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 119 | `handleZoomOut` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 119 | `handleZoomOut__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 120 | `anonymous_setZoomStack_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 125 | `handleBreadcrumbClick` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 125 | `handleBreadcrumbClick__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 129 | `anonymous_setZoomStack_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 134 | `handleDecadeClick` | `arrow_function` | 6/10 | 7/10 | 8/10 | fragile | Decade selection/deselection state can be confusing. |
| 141 | `handleGoToAnalysis` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 214 | `anonymous_jsx_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 226 | `anonymous_map_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 230 | `anonymous_jsx_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 278 | `anonymous_map_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 286 | `anonymous_jsx_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |

### `frontend/src/router.tsx` (30 fonctions)

| Ligne | Fonction | Type | Logique | Pertinence | Potentiel evolution | Statut | Explication |
|---:|---|---|---:|---:|---:|---|---|
| 29 | `ProtectedRoute` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 37 | `AnalysisRedirect` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 51 | `ProjectGuard` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 60 | `RootLayout` | `function_declaration` | 6/10 | 9/10 | 8/10 | incoherent | Navigation composition still has semantics/accessibility tradeoffs. |
| 70 | `shortcuts` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 70 | `shortcuts__callback` | `arrow_function` | 6/10 | 8/10 | 9/10 | fragile | Memoized shortcuts can desync with changing deps/localization. |
| 73 | `handler` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 75 | `anonymous_setTimeout_1` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 84 | `handler` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 85 | `anonymous_setIsPaletteOpen_2` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 91 | `handler` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 95 | `handler` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 100 | `handler` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 109 | `handler` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 118 | `formatDocumentCount` | `arrow_function` | 7/10 | 7/10 | 6/10 | OK | Internal function with no critical anomaly detected. |
| 157 | `anonymous_jsx_3` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 175 | `anonymous_map_4` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 180 | `anonymous_map_5` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 229 | `anonymous_jsx_6` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 243 | `anonymous_jsx_7` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 279 | `anonymous_jsx_8` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 290 | `HealthIndicator` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |
| 294 | `fetchHealth` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 294 | `fetchHealth__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 304 | `anonymous_useEffect_9` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 307 | `anonymous_10` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 313 | `allHealthy` | `wrapper_function` | 7/10 | 6/10 | 4/10 | OK | React wrapper callback (useCallback/useMemo/useEffect). |
| 313 | `allHealthy__callback` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Inner callback attached to wrapper hook. |
| 330 | `anonymous_map_11` | `arrow_function` | 7/10 | 6/10 | 4/10 | OK | Anonymous internal callback for render/iteration/event handling. |
| 411 | `AppRouter` | `function_declaration` | 8/10 | 8/10 | 6/10 | OK | Top-level function/method with clear intent. |

## Fichiers Sans Fonction Detectee

Nombre: 12

- `backend/app/__init__.py`
- `backend/app/api/__init__.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/services/__init__.py`
- `backend/app/utils/__init__.py`
- `backend/app/workers/__init__.py`
- `backend/app/workers/celery_app.py`
- `backend/tests/__init__.py`
- `frontend/src/components/ui/collapsible.tsx`
- `frontend/src/pages/index.ts`
- `frontend/src/vite-env.d.ts`


## ADDENDUM CONSOLIDE

### Source fusionnee: AUDIT_MULTI_AGENT_ACTIONS.md

# AUDIT MULTI-AGENT - Actions d'amelioration

Date: 2026-02-13
Perimetre: backend + frontend
Approche: 5 agents paralleles (debug, features, refactor, performance, qualite/tests)

## Synthese rapide

- Couverture analysee: code applicatif backend/frontend + flux critiques scan/search/viewer.
- Conclusion: il reste des risques critiques (securite scan path, concurrence scan), des manques produit (audit UI, watchlist), et de la dette structurelle (api.ts monolithique, pipeline scan trop dense).
- Priorite immediate: corriger les P0/P1 avant nouveaux ajouts.

## Backlog priorise (en quoi + comment)

| Categorie | Fichier / fonction | Priorite | En quoi ameliorer | Comment modifier |
|---|---|---|---|---|
| Debug | `backend/app/api/scan.py::create_scan`, `estimate_scan` + `backend/app/workers/tasks.py::discover_files_streaming` | P0 | Bloquer scans hors perimetre autorise (risque path traversal, fuite, DoS). | Normaliser `Path.resolve()`, verifier `relative_to(scan_root)`, refuser hors racine, appliquer le meme garde-fou cote worker. |
| Debug | `backend/app/api/scan.py::create_scan` | P1 | Eviter doubles scans concurrents. | Transaction + verrou (`SELECT ... FOR UPDATE`) et contrainte unique `(path,status actif)`; retourner scan existant en cas de conflit. |
| Debug | `backend/app/api/scan.py::estimate_scan` | P1 | Eviter endpoint bloquant sur gros volumes. | Deporter en tache async/polling, limiter duree de parcours, cache resultat par chemin normalise. |
| Debug | `frontend/src/hooks/useSearch.ts::loadMore` | P2 | Eviter derive pagination/filtres. | Ajouter `querySignature`, invalider `loadMore` si filtres changent, forward complet des filtres (`scan_ids`, `limit`, etc.). |
| Debug | `frontend/src/pages/LoginPage.tsx::handleSubmit` | P2 | Eviter boucle de redirection en echec auto-login apres register. | Naviguer seulement si `loginRes.ok` + tokens poses; sinon rester sur page et afficher erreur. |
| Features | `frontend/src/pages/AuditPage.tsx` (nouveau) + `frontend/src/lib/api.ts` | P1 | Exposer la chaine de preuve audit au front. | Ajouter page audit (filtres + table + details hash/previous_hash + export CSV), brancher `/api/audit` et `/api/audit/document/{id}`. |
| Features | `backend/app/api/watchlist.py`, `frontend/src/pages/WatchlistPage.tsx` (nouveaux) | P2 | Automatiser la veille sur nouvelles preuves. | Modele `WatchlistRule`, job periodique (Celery), snapshot resultats, UI gestion regles/alertes. |
| Features | `backend/app/api/tasks.py`, `frontend/src/pages/TasksPage.tsx` (nouveaux) | P2 | Supporter collaboration investigation. | Entite `InvestigationTask` (assignation, statut, priorite), CRUD + panel taches par document/projet. |
| Refactor | `backend/app/api/scan.py` | P1 | Reduire dette de flux scan trop centralise. | Extraire `scan_lifecycle.py`, `scan_estimator.py`, `scan_progress_streamer.py`; routes API = orchestration mince. |
| Refactor | `backend/app/api/documents.py` | P2 | Clarifier responsabilites documents/media/redaction. | Extraire `document_media.py`, `document_highlights.py`, `document_redaction.py` + builder de requetes documents. |
| Refactor | `backend/app/services/ai_chat.py` | P2 | Rendre chat testable et evolutif. | Separer `chat_context.py` + `prompt_builder.py`; conserver `AIChatService` comme coordination. |
| Refactor | `frontend/src/lib/api.ts` | P1 | Casser monolithe API front. | Split en modules `api/client.ts`, `api/scan.ts`, `api/documents.ts`, `api/search.ts`, etc. |
| Refactor | `frontend/src/hooks/*` | P2 | Supprimer boilerplate loading/error/refetch. | Introduire `useApiResource` partage puis migrer `useProjects`, `useFavorites`, `useStats`, `useEntities`. |
| Performance | `backend/app/workers/tasks.py::run_ner_batch`, `run_embeddings_batch` | P1 | Eviter pics RAM sur gros scans. | Remplacer `.all()` par `yield_per()`/pagination curseur; commit/flush par batch. |
| Performance | `backend/app/api/documents.py` + `backend/app/models.py` | P2 | Accelerer browse + facettes. | Ajouter index trigram sur `file_name`; remplacer multi-counts par agregations SQL uniques (`CASE WHEN`). |
| Performance | `backend/app/api/search.py` | P2 | Reduire cout filtres entites sur gros corpus. | Pousser filtrage en sous-requete SQL plutot que remonter tous IDs en memoire Python. |
| Performance | `frontend/src/components/viewer/DocumentViewer.tsx`, `DeepAnalysisPanel.tsx` | P2 | Diminuer rafales API/polling. | Cache par `documentId`, eviter retrigger inutile, backoff polling (ex. 3s -> 10s progressif). |
| Performance | `frontend/src/components/search/ResultList.tsx` | P1 | Eviter DOM massif en infinite scroll. | Virtualiser la liste (`react-virtual`) ou plafonner accumulation des resultats montes. |
| Qualite/Tests | `backend/tests/*` | P1 | Couvrir endpoints non testes (documents, stats, favorites, tags, projects, audit, chat...). | Ajouter suites dediees + cas auth/roles + 404/422 + contrats SSE. |
| Qualite/Tests | `backend/app/api/*.py` | P1 | Stabiliser contrats de reponse. | Ajouter schemas Pydantic de sortie (documents/scan/stats/health), valider cas limites via tests. |
| Observabilite | `backend/app/main.py`, `backend/app/api/scan.py`, `documents.py`, `workers/tasks.py` | P1 | Ameliorer debug production. | Logs structures, metrics Prometheus (`/metrics`), correlation-id HTTP <-> Celery. |
| Qualite Front | `frontend/package.json`, `frontend/src/lib/api.ts`, pages critiques | P2 | Capturer regressions UI/reseau en CI. | Ajouter Vitest + Testing Library + MSW, script `npm test`, tests des flux scan/search/login. |

## Ordre d'execution recommande

1. Securiser scan path + concurrence (`P0/P1` backend scan).
2. Fiabiliser contrats/tests/observabilite backend (`P1`).
3. Refactor scan + split `frontend/src/lib/api.ts` (`P1`).
4. Optimisations performance backend/frontend (`P1/P2`).
5. Nouvelles features (Audit UI puis Watchlist puis Tasks).


### Source fusionnee: VISION_UX_UI_FEATURES.md

# VISION UX/UI + FEATURES - ARCHON

Date: 2026-02-13
Portee: toutes les pages `frontend/src/pages` + navigation globale + design system.

## 1) Direction produit (vision)

### Domain (ce que le produit doit ressentir)
- Poste de commandement d'investigation documentaire.
- Tri de signal faible -> preuve exploitable.
- Flux continu: chercher -> relier -> verifier -> conserver.
- Fiabilite operationnelle sur des scans longs et des gros volumes.
- Collaboration analyste (partage, taches, contexte).

### Color world (deja present mais a mieux systematiser)
- `#0F1215` (fond profond cockpit).
- `rgba(22,27,34,0.60)` (verre fume / surfaces).
- `#F59E0B` (focus/action critique).
- `#2D6A78` (etat stable/validation).
- `#E2E8F0` + `#64748B` (hierarchie texte).

### Signature interface a renforcer
- Signature actuelle forte: `glass + scanlines + HUD glow`.
- A renforcer: la signature doit etre appliquee de facon coherente sur toutes les pages, pas seulement header/login.

### Defaults a eviter
- Navigation plate sans etat operationnel.
- Filtres denses sans hierarchie visuelle.
- Actions critiques melangees avec actions courantes.

## 2) Cartographie des pages (etat reel)

| Page | Route | Etat actuel | Maturite UX/UI | Potentiel feature |
|---|---|---|---:|---:|
| LoginPage | `/login` | Solide visuellement, onboarding faible | 7/10 | 8/10 |
| ProjectDashboard | `/projects` | Tres riche mais chargee et redondante avec Scans | 6/10 | 9/10 |
| HomePage | `/` | Hub principal Search+Browse, dense | 7/10 | 9/10 |
| ScansPage | `/scans` | Complete mais duplique beaucoup Dashboard | 6/10 | 8/10 |
| TimelinePage | `/timeline` | Bonne base analytique, guidage faible | 7/10 | 9/10 |
| GalleryPage | `/gallery` | Bonne base media, feedback etats a renforcer | 7/10 | 9/10 |
| ChatPage | `/chat` | Bonne logique conversation, confiance source perfectible | 7/10 | 9/10 |
| EntitiesPage | `/entities` | Valeur forte, mode merge fragile | 6/10 | 10/10 |
| GraphPage | `/graph` | Puissant mais controles experts peu guides | 6/10 | 10/10 |
| FavoritesPage | `/favorites` | Tres utile, UX edition/collections heterogene | 6/10 | 9/10 |
| BrowsePage | non routee | Existant mais remplace par Home mode browse | 4/10 | 6/10 |
| CockpitPage | non accessible (`/cockpit` redirige `/`) | Concept utile mais inutilisable en l'etat | 3/10 | 9/10 |

## 3) Vision par page: etat actuel -> ameliorations UX/UI -> features

### LoginPage
Etat actuel: beau split visuel et branding coherent.
UX/UI a ameliorer:
- Mieux separer parcours `connexion` vs `inscription` (etat et feedback differents).
- Eviter la redirection silencieuse si auto-login post-inscription echoue.
Features:
- Onboarding guide en 2-3 etapes (choix projet, premier scan, premier resultat).
- Bloc "etat systeme" minimal avant connexion (API/worker/disponibilite).

### ProjectDashboard
Etat actuel: cockpit projet riche, mais trop de responsabilites.
UX/UI a ameliorer:
- Sortir les actions destructives dans une zone "Operations critiques" dediee.
- Clarifier differenciation `Projet` vs `Scan` (suppression/rename).
Features:
- Hub Ops unifie (scan live + historique + actions) au lieu de dupliquer dans ScansPage.
- Health KPI par projet (latence indexation, erreurs recentes, backlog).

### HomePage
Etat actuel: page centrale puissante, mais cognitive load elevee.
UX/UI a ameliorer:
- Rendre explicite la difference `Search` vs `Browse` (aide inline + labels).
- Afficher un resume de filtres persistent au-dessus de la liste.
Features:
- Onglets de contexte (sauvegarder plusieurs recherches actives).
- Suggestions intelligentes de requetes/filtres selon historique.

### ScansPage
Etat actuel: fonctionnel, mais recopie une grande partie du Dashboard.
UX/UI a ameliorer:
- Eviter la confusion d'etat entre pages (source unique de verite scan).
- Distinguer clairement file active, file interrompue, historique termine.
Features:
- File de scans avec priorite et planification horaire.
- Resume de qualite scan (fichiers ignores, OCR echoue, temps par type).

### TimelinePage
Etat actuel: bon niveau analytique et drilldown, guidage perfectible.
UX/UI a ameliorer:
- Ameliorer lisibilite du zoom et des breadcrumbs.
- Mieux expliquer la transition vers l'analyse/browse.
Features:
- Stories temporelles (resume automatique d'une periode).
- Alertes temporelles (pics anormaux de documents).

### GalleryPage
Etat actuel: bonne base media + infinite scroll.
UX/UI a ameliorer:
- Meilleur feedback sur recherche vide/chargement/fin de pagination.
- Rendre les filtres actifs plus visibles sans ouvrir un panneau.
Features:
- Clustering visuel (similarite image + OCR).
- Storyboard media (selection ordonnee exportable).

### ChatPage
Etat actuel: citation + contexte utiles, UX conversation a stabiliser.
UX/UI a ameliorer:
- Mieux signaler le statut streaming/cancel/retry.
- Rendre les citations plus exploitables sans quitter le chat (hover card source).
Features:
- Mode "briefing" (synthese exec + preuves citees).
- Liaison directe chat -> favoris/taches/entities.

### EntitiesPage
Etat actuel: tres forte valeur, mode merge fragile.
UX/UI a ameliorer:
- Transformer merge en flow guide (source -> cible -> preview -> confirmer).
- Mieux synchroniser panel detail et selection courante.
Features:
- Historique des merges avec rollback.
- Suggestions de merge assistees (score confiance + justification).

### GraphPage
Etat actuel: puissant, mais controles complexes pour non-experts.
UX/UI a ameliorer:
- Ajouter aides contextuelles sur pathfinding, seuils, communautes.
- Legende communautes et explication des couleurs/poids.
Features:
- Scenarios investigatifs predefinis (fraude, collusion, pivot identite).
- Export de parcours relationnel en preuve partageable.

### FavoritesPage
Etat actuel: utile pour capitaliser, mais interactions heterogenes.
UX/UI a ameliorer:
- Uniformiser edition notes/tags/collections (moins de micro-modes).
- Clarifier l'undo suppression et les etats temporaires.
Features:
- Collections serveur (pas seulement localStorage) et partage equipe.
- Synthese comparee par collection (evolution dans le temps).

### BrowsePage (non routee)
Etat actuel: doublon partiel de Home browse.
UX/UI a ameliorer:
- Decision produit: supprimer ou reintroduire proprement.
Features:
- Si conservee: positionner comme "Browse Expert" avec filtres avances.

### CockpitPage (non accessible)
Etat actuel: bon concept 3 colonnes, mais inaccessible via route.
UX/UI a ameliorer:
- Reactiver vraie route `/cockpit` ou retirer toute mention cockpit.
Features:
- En faire le poste investigation "pro" (filtres experts + viewer + metadata bar).

## 4) Axes transverses UX/UI

- Unifier navigation `header/navGroups` + `CommandPalette` + raccourcis sur la meme source de donnees.
- Ajouter des etats globaux lisibles: scan actif, erreurs recentes, degradations service.
- Harmoniser la densite UI (hauteurs boutons, paddings, styles badges) entre pages.
- Isoler les actions destructives dans des parcours de confirmation explicites (impact scope clair).
- Stabiliser la coherence i18n dans toutes les UI (palette incluse).

## 5) Roadmap recommandee

### 0-30 jours (impact fort rapide)
- Corriger les flows critiques: login post-register, merge entities, pagination loadMore.
- Rendre visibles les filtres actifs (Home/Browse/Gallery) et clarifier Search vs Browse.
- Reactiver ou retirer Cockpit pour eliminer la confusion navigation.

### 30-60 jours
- Creer un `Ops Hub` unique (scan live + historique + actions) pour supprimer la duplication Dashboard/Scans.
- Refondre Experience Entities+Graph (flow guide + aides contextuelles).
- Centraliser tokens/surfaces (niveaux d'elevation, bordures, focus, spacing).

### 60-90 jours
- Lancer features collaboratives: watchlists, tasks d'investigation, collections partagees.
- Ajouter narration intelligente: stories timeline, briefings chat, parcours preuves exportables.

## 6) Decision produit immediate (a trancher)

1. `CockpitPage`: activer reellement ou supprimer.
2. `BrowsePage`: garder comme mode expert ou retirer du code vivant.
3. `Ops`: fusionner l'orchestration scan dans un seul ecran de reference.



### Source fusionnee: audit.md

# 🔍 Audit UX Intelligence — Archon Platform

> **Objectif** : Identifier les frictions, les features manquantes et les patterns "intelligents"
> qui séparent une app pro d'une app agréable à utiliser.

---

## 🔴 Priorité Critique — L'app est lourde à cause de ça

### 1. Pas de Toast / Feedback Instantané

**Problème** : Toutes les actions (suppression, rename, annulation, lancement de scan) n'ont aucun feedback visuel. L'utilisateur clique et ne sait pas si ça a marché.
**Solution** : Implémenter un système de `Toast` (notifications éphémères en bas de l'écran).

```
✅ "Scan lancé" • ✅ "Scan annulé" • ⚠️ "Erreur connexion" • 🗑️ "Scan supprimé"
```

**Impact** : Énorme — c'est LE pattern qui rend une app vivante et réactive.

---

### 2. Aucune Confirmation Intelligente avant Suppression

**État** : Corrigé.
**Maintenant** :
- confirmation avant suppression (dialogs existants conservés),
- suppression différée de 5s avec action `Undo`,
- exécution API uniquement si pas d'annulation.
**Fichiers** : `frontend/src/pages/ProjectDashboard.tsx`, `frontend/src/pages/ScansPage.tsx`.

---

### 3. Scan Dialog trop Primitif

**Problème actuel** :

- Pas de prévisualisation avant le scan : combien de fichiers vont être traités ? Quels types ?
- L'API `estimateScan()` existe dans `api.ts` mais n'est **jamais utilisée** dans le dialog !
- Le coût estimé des embeddings est calculé côté backend mais jamais affiché

**Solution** : Quand le dialog s'ouvre, appeler `estimateScan(path)` et afficher :

```
📦 ~134 000 fichiers détectés
├── 42 000 PDF  •  68 000 Images  •  24 000 Textes
├── 💾 Taille estimée : 30 GB
└── 🧠 Embeddings : ~$0.13 (free tier disponible ✓)
```

---

### 4. SSE : Aucun Auto-Reconnect

**État** : Corrigé.
**Maintenant** :
- `connectScanStream` applique un reconnect automatique avec backoff exponentiel,
- `useScanProgress` expose l'état `isReconnecting`,
- la vue de scan affiche un badge de reconnexion pendant la reprise.

---

## 🟠 Priorité Haute — Frictions Majeures

### 5. Types Dupliqués (Dette Technique = Bugs)

**État** : Corrigé.
**Avant** : `ScanRecord` était dupliqué localement.
**Maintenant** : type unique dans `frontend/src/lib/api.ts`, importé par `frontend/src/pages/ProjectDashboard.tsx` et `frontend/src/pages/ScansPage.tsx`.

## SUIVI EXECUTION (ordre applique)

Date de mise a jour: 2026-02-13 (batch multi-agents)

### Termine - Batch 1

1. `P0` Securisation path scan:
   - `backend/app/utils/paths.py`: ajout validation canonique sous racine autorisee.
   - `backend/app/api/scan.py`: `create_scan`, `estimate_scan`, `resume_scan` verifies path + rejects outside root.
   - `backend/app/workers/tasks.py`: `discover_files_streaming` revalide le path cote worker.
2. `P1` Concurrence `create_scan`:
   - verrou advisory transactionnel PostgreSQL par path.
   - reutilisation du scan actif (`pending/running`) au lieu de lancer un doublon.
3. `P1` Robustesse `estimate_scan`:
   - suppression de la double traversee.
   - bornes de temps/dossiers/fichiers avec retour `incomplete` + `incomplete_reason`.
4. `P2` Pagination front `loadMore`:
   - `frontend/src/hooks/useSearch.ts`: signature de requete, propagation complete des filtres/options, rejet des reponses stale, dedup resultats.
5. `P2` Login register->login:
   - `frontend/src/pages/LoginPage.tsx`: plus de redirection si auto-login post-register echoue.
6. `P1` Feature Audit UI:
   - `frontend/src/pages/AuditPage.tsx` creee.
   - route `/audit` + entree nav.
   - `frontend/src/lib/api.ts`: `fetchAuditLogs`, `fetchDocumentAuditTrail`.
   - i18n FR/EN ajoute.
7. `P1` Perf/observabilite backend:
   - `backend/app/workers/tasks.py`: `run_ner_batch` et `run_embeddings_batch` en pagination curseur (plus de `.all()` massif).
   - `backend/app/api/search.py`: facettes taille fichier en une seule aggregation SQL.
   - `backend/app/main.py` + `backend/app/telemetry/metrics.py`: middleware HTTP + endpoint `/metrics`.
8. `P1` Contrats API documents:
   - `backend/app/schemas.py` + `backend/app/api/documents.py`: `response_model` explicites (`content`, `highlights`, `delete`, `redaction`).
9. `P2` UX cockpit/timeline:
   - `frontend/src/router.tsx`: route `/cockpit` reactivee.
   - `frontend/src/pages/TimelinePage.tsx`: clic date -> navigation `/cockpit?date=...`.
10. `P2` UX/perf viewer/search:
   - `frontend/src/components/viewer/DeepAnalysisPanel.tsx`: cache + polling backoff.
   - `frontend/src/components/viewer/DocumentViewer.tsx`: cache details/entities/redaction badge.
   - `frontend/src/components/search/ResultList.tsx`: virtualisation simple des longs resultats.
11. `P2` Features collaboration:
   - backend: `backend/app/api/watchlist.py`, `backend/app/api/investigation_tasks.py`, schemas/modeles associes.
   - frontend: `frontend/src/pages/WatchlistPage.tsx`, `frontend/src/pages/TasksPage.tsx`, `frontend/src/lib/api.ts`, `frontend/src/router.tsx`.

### Termine - Batch 2 (agents paralleles)

1. Robustesse recherche Meilisearch:
   - `backend/app/services/meilisearch.py`: builder de filtres valide + whitelist + escaping.
   - `backend/tests/test_meilisearch_filters.py`: couverture cas valides et malformed/injection.
2. Accessibilite layout principal:
   - `frontend/src/router.tsx`: skip-link, `aria-current`, landmarks/labels, focus `main` au changement de route.
3. Dedup helpers date:
   - `frontend/src/lib/dateRange.ts` + adoption dans `frontend/src/pages/HomePage.tsx` et `frontend/src/pages/BrowsePage.tsx`.
4. Dedup formatters:
   - `frontend/src/lib/formatters.ts` + adoption dans `frontend/src/pages/ProjectDashboard.tsx` et `frontend/src/pages/ScansPage.tsx`.
5. Durcissement watchlist/tasks:
   - `backend/app/schemas.py`: trim/validation stricte champs obligatoires.
   - `backend/app/models.py`: defaults timestamps corriges (callables).
   - tests: `backend/tests/test_watchlist_api.py` et `backend/tests/test_investigation_tasks_api.py`.

### Termine - Batch 3 (agents paralleles)

1. Chat streaming reel:
   - `frontend/src/pages/ChatPage.tsx`: switch vers `/api/chat/stream`, parsing SSE robuste (events/token/done/contexts), buffer anti-chunks partiels.
   - ajout `AbortController` + `requestId` pour annuler flux precedent et ignorer reponses obsoletes.
2. Undo delete sur scans/projets:
   - `frontend/src/pages/ProjectDashboard.tsx`, `frontend/src/pages/ScansPage.tsx`:
     suppression planifiee (5s), toast avec action `Undo`, cleanup timers au unmount.
3. Health indicator fiable:
   - `frontend/src/lib/api.ts`: contrat `HealthStatus` aligne payload backend.
   - `frontend/src/router.tsx`: `HealthIndicator` base sur `checkHealth()` + calcul degrade/healthy corrige.

### Termine - Batch 4 (agents paralleles)

1. Raccourcis clavier etendus:
   - `frontend/src/router.tsx`: ajout `N` (scans), `R` (scans/reprise rapide), `F` (favoris), aide `?` mise a jour.
   - `frontend/src/pages/documents/HomePage.tsx` + `frontend/src/components/viewer/DocumentViewer.tsx`: navigation documents `←/→` contextualisee au viewer (incluant pagination).
2. Resume post-scan actionnable:
   - `frontend/src/pages/ScansPage.tsx`: bloc de synthese en fin de scan (fichiers/erreurs/duree/top types) + actions rapides.
   - `frontend/src/locales/en.json`, `frontend/src/locales/fr.json`: nouvelles cles `scans.postScan*`.

### Validation globale (apres batch 1-4)

- Backend tests complets: `238 passed, 4 skipped`.
- Frontend build: OK (warnings non bloquants: `pdfjs-dist eval`, chunk size Vite).

---

### 6. Timeline Clique sur du Vide

**État** : Corrigé.
**Avant** : le clic heatmap n'amenait pas à une vue exploitable.
**Maintenant** : `frontend/src/pages/TimelinePage.tsx` navigue vers `/cockpit?date=...`.

---

### 7. Galerie sans Infinite Scroll

**État** : Corrigé.
**Maintenant** : `frontend/src/pages/GalleryPage.tsx` utilise `IntersectionObserver` pour chargement progressif.

---

### 8. Chat sans Streaming

**État** : Corrigé.
**Maintenant** : `ChatPage` consomme le flux SSE `/api/chat/stream` avec rendu progressif token par token, curseur de streaming et gestion robuste des annulations.

---

### 9. Raccourcis Clavier sous-Utilisés

**État** : Corrigé.
**Maintenant** : `Ctrl+K`, `?`, `N`, `R`, `F`, `G`, `T` et `←/→` sont actifs globalement (navigation documents contextualisée au viewer).
| Raccourci | Action |
|-----------|--------|
| `Ctrl+K` | Focus recherche (standard) |
| `N` | Nouveau scan |
| `R` | Reprendre dernier scan |
| `F` | Toggle favoris |
| `←` / `→` | Navigation documents |
| `?` | Afficher aide raccourcis |

---

## 🟡 Priorité Moyenne — Confort & Polish

### 10. Pas de Loading Skeletons

**État** : Corrigé.
**Avant** : spinner centré + page perçue comme "vide" pendant le chargement.
**Maintenant** : skeleton loaders alignés sur la structure attendue (projets, recherche, timeline, graphe, galerie, scans) via `frontend/src/components/ui/skeleton.tsx`.

---

### 11. Pas de Recherches Récentes / Suggestions

**État** : Corrigé (recherches récentes).
**Maintenant** :
- Historique des 10 dernières recherches (localStorage, partagé via `frontend/src/lib/recentSearches.ts`).
- `Ctrl+K` ouvre un command palette (navigation + recherches récentes).
- La barre de recherche (mode contenu) propose les recherches récentes en dropdown.
**Reste possible** : suggestions basées sur entités (NER) / auto-complete avancé.

---

### 12. Navigation : Pas de Breadcrumbs

**État** : Corrigé.
**Maintenant** : breadcrumb minimal via `frontend/src/components/AppBreadcrumb.tsx` (+ breadcrumb chemin dans le viewer).

---

### 13. Résumé Post-Scan absent

**État** : Corrigé.
**Maintenant** : `frontend/src/pages/ScansPage.tsx` affiche une synthèse post-scan (traités/erreurs/durée/top types) avec actions rapides (cockpit, galerie, export/fallback recherche).

Format cible livré :

```
✅ Scan terminé en 47min
├── 75 526 fichiers traités
├── 11 erreurs (voir détails)
├── Top types : 42k PDF, 28k Images, 5k Textes
└── [Ouvrir le Cockpit →] [Voir la Galerie →] [Exporter le rapport →]
```

---

### 14. Pas de Mode Hors-Ligne / Cache Local

**Problème** : Chaque navigation recharge tout depuis l'API. Si le backend est lent ou tombe, l'app est morte.
**Solution** : `react-query` ou `SWR` avec cache stale-while-revalidate. Les données déjà chargées restent visibles.

---

### 15. Favoris sans Organisation Intelligente

**Problème** : Les favoris sont une liste plate. Avec 100+ favoris, c'est inutilisable.
**Solution** :

- Dossiers de favoris / collections
- Vue "récemment ajoutés" vs "les plus consultés"
- Export des favoris en PDF/ZIP

---

## 🟢 Priorité "Nice to Have" — Ce qui fait la différence

### 16. Drag & Drop pour Lancer un Scan

Déposer un dossier sur la page projets → le scan démarre automatiquement.

### 17. Aperçu au Survol (Hover Preview)

Survoler un nom de fichier dans les résultats → tooltip avec aperçu (miniature pour images, premières lignes pour textes).

### 18. Dark/Light Toggle Animé

Le toggle theme actuel est brutal. Ajouter une transition CSS `color-scheme` douce.

### 19. Indicateurs de Santé du Système

**État** : Corrigé.
Un indicateur de santé est affiché dans le footer, avec détail par service et refresh manuel. Le calcul `healthy/degraded` est désormais aligné avec les statuts backend.

### 20. Onboarding Guidé pour Nouveaux Utilisateurs

Premier lancement → tour guidé avec 3-4 étapes : "Voici vos projets", "Lancez un scan", "Explorez vos documents".

---

## 📊 Matrice de Priorisation

| #   | Feature                 | Impact     | Effort      | Ratio | Etat |
| --- | ----------------------- | ---------- | ----------- | ----- | ---- |
| 1   | Toast / Feedback        | ⭐⭐⭐⭐⭐ | 🔧 Faible   | 🏆    | a faire |
| 3   | Scan Estimate Preview   | ⭐⭐⭐⭐⭐ | 🔧 Faible   | 🏆    | a faire |
| 2   | Confirm + Undo Delete   | ⭐⭐⭐⭐   | 🔧 Faible   | 🏆    | fait |
| 5   | Types consolidés        | ⭐⭐⭐     | 🔧 Faible   | 🏆    | fait |
| 4   | SSE Auto-Reconnect      | ⭐⭐⭐⭐   | 🔧🔧 Moyen  | ⭐⭐  | fait |
| 13  | Résumé Post-Scan        | ⭐⭐⭐⭐   | 🔧🔧 Moyen  | ⭐⭐  | fait |
| 9   | Raccourcis Clavier      | ⭐⭐⭐     | 🔧 Faible   | ⭐⭐  | fait |
| 10  | Loading Skeletons       | ⭐⭐⭐     | 🔧🔧 Moyen  | ⭐    | fait |
| 7   | Infinite Scroll Gallery | ⭐⭐⭐     | 🔧 Faible   | ⭐⭐  | fait |
| 11  | Command Palette         | ⭐⭐⭐⭐   | 🔧🔧🔧 Haut | ⭐    | fait |
| 6   | Timeline → Cockpit      | ⭐⭐⭐     | 🔧🔧 Moyen  | ⭐    | fait |
| 8   | Chat Streaming          | ⭐⭐⭐⭐   | 🔧🔧🔧 Haut | ⭐    | fait |
| 14  | Cache SWR               | ⭐⭐⭐     | 🔧🔧🔧 Haut | ○     | partiel |
| 19  | Health Indicator        | ⭐⭐       | 🔧 Faible   | ⭐    | fait |

---

## 🎯 Plan d'Action Recommandé

### Sprint 1 — Quick Wins (1-2 jours)

1. **Toast system** (sonner ou react-hot-toast) — `partiel`
2. **estimateScan()** dans le dialog de scan — `fait`
3. **Confirm dialog** avant suppression — `fait`
4. **Consolider les types** (`ScanRecord` → un seul endroit) — `fait`
5. **Infinite scroll** galerie — `fait`

### Sprint 2 — Intelligence (2-3 jours)

6. **SSE auto-reconnect** avec retry UI — `fait`
7. **Résumé post-scan** avec actions — `fait`
8. **Raccourcis clavier** étendus — `fait`
9. **Timeline → navigation vers cockpit** — `fait`
10. **Health indicator** sidebar — `fait`

### Sprint 3 — Polish (3-5 jours)

11. **Command palette** (`Ctrl+K`) — `fait`
12. **Chat streaming** SSE — `fait`
13. **Loading skeletons** — `fait`
14. **Breadcrumbs** — `fait`
15. **Hover preview** documents — `a faire`
