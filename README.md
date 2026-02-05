# Archon - Digital Investigation Platform

Application d'investigation numérique locale pour analyser des documents volumineux (300k+ fichiers) avec une architecture hybride couplant recherche sémantique (IA) et recherche classique (mots-clés).

## 🚀 Quick Start

```bash
# 1. Cloner et configurer
git clone <repo>
cd Finders
cp .env.example .env

# 2. Ajouter votre clé Gemini (optionnel, pour la recherche sémantique)
# Éditer .env et renseigner GEMINI_API_KEY

# 3. Lancer l'application
docker-compose up -d

# 4. Accéder à l'interface
# Frontend: http://localhost:3100
# API: http://localhost:8100
# Meilisearch: http://localhost:7701
# Qdrant: http://localhost:6335/dashboard
```

## 📦 Architecture

```
┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│    Backend      │
│  React + Vite   │     │    FastAPI      │
│   (port 3000)   │     │   (port 8000)   │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
             ┌──────────┐ ┌───────────┐ ┌─────────┐
             │Meilisearch│ │  Qdrant   │ │  Redis  │
             │ Full-Text │ │  Vectors  │ │  Queue  │
             │ (7700)   │ │  (6333)   │ │  (6379) │
             └──────────┘ └───────────┘ └─────────┘
```

## 🔍 Fonctionnalités

- **Recherche Hybride** : Combine mots-clés (Meilisearch) et sémantique (Qdrant)
- **OCR Automatique** : Extraction de texte des images et PDFs scannés (Tesseract)
- **Multi-Passes Pipeline** : Detection → Extraction → Indexation → Vectorisation
- **Interface Split-Screen** : Résultats à gauche, visualiseur à droite
- **Highlighting** : Mots-clés surlignés dans les résultats et documents
- **Temps Réel** : Progression des scans via WebSocket

## 📁 Structure

```
Finders/
├── docker-compose.yaml    # Orchestration complète
├── .env.example           # Configuration
├── backend/               # API FastAPI + Celery
│   ├── app/
│   │   ├── api/           # Routes (scan, search, documents)
│   │   ├── services/      # Meilisearch, Qdrant, OCR, Embeddings
│   │   └── workers/       # Celery tasks
│   └── Dockerfile
├── frontend/              # React + Vite + Shadcn
│   ├── src/
│   │   ├── components/    # UI Components
│   │   ├── hooks/         # React Hooks
│   │   └── lib/           # API Client
│   └── Dockerfile
└── documents/             # Dossier de documents à scanner
```

## 🛠️ Commandes Utiles

```bash
# Démarrer tous les services
docker-compose up -d

# Voir les logs
docker-compose logs -f

# Logs d'un service spécifique
docker-compose logs -f backend

# Arrêter
docker-compose down

# Reset complet (supprime les données)
docker-compose down -v

# Rebuild après modifications
docker-compose up -d --build
```

## ⚙️ Configuration

| Variable | Description | Défaut |
|----------|-------------|--------|
| `GEMINI_API_KEY` | Clé API Gemini pour embeddings | - |
| `DOCUMENTS_PATH` | Chemin vers les documents | `./documents` |

## 📖 API Endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/scan/` | POST | Lancer un nouveau scan |
| `/api/scan/{id}` | GET | Détails d'un scan |
| `/api/search/` | POST | Recherche hybride |
| `/api/documents/{id}` | GET | Détails document |
| `/api/documents/{id}/file` | GET | Fichier original |
| `/ws/scan/{id}` | WS | Progression temps réel |

## 🎯 Modes de Recherche

1. **Mots-clés** : Recherche exacte (Meilisearch seul)
2. **Hybride** : Fusion RRF des deux moteurs
3. **Sémantique** : Recherche par sens (Qdrant + OpenAI)

---

Built with ❤️ for digital investigators
