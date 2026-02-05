# Archon - Digital Investigation Platform

Application d'investigation numérique locale pour analyser des documents volumineux (500k+ fichiers) avec une architecture hybride couplant recherche sémantique (IA) et recherche classique (mots-clés).

## 🚀 Quick Start

```bash
# 1. Cloner et configurer
git clone <repo>
cd Archon
cp .env.example .env

# 2. Ajouter votre clé Gemini (requis pour la recherche sémantique et IA)
# Éditer .env et renseigner GEMINI_API_KEY

# 3. Lancer l'application
docker-compose -f docker-compose.prod.yaml up -d

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
│   (port 3100)   │     │   (port 8100)   │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┼────────────┬─────────────┐
                    ▼            ▼            ▼             ▼
             ┌──────────┐ ┌───────────┐ ┌─────────┐ ┌────────────┐
             │Meilisearch│ │  Qdrant   │ │  Redis  │ │ PostgreSQL │
             │ Full-Text │ │  Vectors  │ │  Queue  │ │  Metadata  │
             │ (7700)   │ │  (6333)   │ │  (6379) │ │   (5432)   │
             └──────────┘ └───────────┘ └─────────┘ └────────────┘
```

## 🔍 Fonctionnalités

### Recherche & Indexation

- **Recherche Hybride** : Combine mots-clés (Meilisearch) et sémantique (Qdrant + Gemini)
- **OCR Automatique** : Extraction de texte des images, PDFs scannés et **vidéos** (Tesseract)
- **Video OCR** : Extraction de keyframes (1/30s) et OCR sur chaque frame avec déduplication
- **Multi-Passes Pipeline** : Detection → Extraction → Indexation → Vectorisation
- **Extraction Archives** : Support ZIP, RAR, 7z automatique

### Interface Utilisateur

- **7 Pages** : Recherche, Cockpit, Timeline, IA, Galerie, Favoris, Scans
- **Cockpit** : Vue split-screen avec filtres (type, date, taille)
- **Galerie Média** : Vue grille avec miniatures redimensionnables, lightbox, recherche OCR
- **Timeline** : Visualisation temporelle des documents avec heatmap
- **Chat IA** : Assistant RAG avec contexte des documents indexés
- **Favoris** : Notes personnelles, tags, synthèse IA automatique

### Investigation

- **Système de Projets** : Isolation des investigations par dossier
- **Extraction d'Entités (NER)** : Personnes, lieux, organisations, dates
- **Notes d'Investigation** : Annotations liées aux documents
- **Audit Log** : Traçabilité complète des actions

## 📁 Structure

```
Archon/
├── docker-compose.prod.yaml  # Production
├── docker-compose.yaml       # Development
├── .env.example              # Configuration
├── backend/                  # API FastAPI + Celery
│   ├── app/
│   │   ├── api/              # Routes (scan, search, documents, chat, etc.)
│   │   ├── services/         # Meilisearch, Qdrant, OCR, Embeddings, NER
│   │   └── workers/          # Celery tasks
│   └── Dockerfile
├── frontend/                 # React + Vite + Shadcn
│   ├── src/
│   │   ├── components/       # UI Components (cockpit, gallery, viewer, etc.)
│   │   ├── pages/            # 7 pages principales
│   │   ├── hooks/            # React Hooks
│   │   └── lib/              # API Client
│   └── Dockerfile
└── documents/                # Dossier de documents à scanner
```

## 🛠️ Commandes Utiles

```bash
# Démarrer (production)
docker-compose -f docker-compose.prod.yaml up -d

# Démarrer (développement)
docker-compose up -d

# Voir les logs
docker-compose logs -f backend

# Rebuild après modifications
docker-compose -f docker-compose.prod.yaml up -d --build

# Reset complet (supprime les données)
docker-compose down -v
```

## ⚙️ Configuration

| Variable         | Description                          | Défaut             |
| ---------------- | ------------------------------------ | ------------------ |
| `GEMINI_API_KEY` | Clé API Gemini pour embeddings et IA | -                  |
| `DOCUMENTS_PATH` | Chemin vers les documents            | `/documents`       |
| `DATABASE_URL`   | URL PostgreSQL                       | `postgresql://...` |

## 📖 API Endpoints

| Endpoint                        | Méthode | Description             |
| ------------------------------- | ------- | ----------------------- |
| `/api/scan/`                    | POST    | Lancer un nouveau scan  |
| `/api/search/`                  | POST    | Recherche hybride       |
| `/api/documents/{id}`           | GET     | Détails document        |
| `/api/documents/{id}/thumbnail` | GET     | Miniature (cache)       |
| `/api/projects/`                | GET     | Liste des projets       |
| `/api/chat/`                    | POST    | Chat IA avec RAG        |
| `/api/favorites/synthesize`     | POST    | Synthèse IA des favoris |
| `/api/entities/`                | GET     | Entités extraites (NER) |
| `/ws/scan/{id}`                 | WS      | Progression temps réel  |

## 🎯 Modes de Recherche

1. **Mots-clés** : Recherche exacte (Meilisearch seul)
2. **Hybride** : Fusion RRF des deux moteurs
3. **Sémantique** : Recherche par sens (Qdrant + Gemini)

## 🎬 Galerie Média

La nouvelle interface Galerie permet de :

- Visualiser toutes les images indexées en grille
- Redimensionner les miniatures avec un slider
- Naviguer en plein écran avec la lightbox (flèches clavier ← →)
- Zoomer (+/-) pour voir les détails
- Rechercher dans le texte OCR des images

## 📹 Video OCR

L'extraction de texte des vidéos fonctionne ainsi :

1. **FFmpeg** extrait 1 frame toutes les 30 secondes
2. **Tesseract** fait l'OCR de chaque frame
3. Les textes similaires sont dédupliqués
4. Le résultat est indexé avec timestamp (`--- Video @2:30 ---`)

---

Built with ❤️ for digital investigators
