# War Room - TODO : Fonctionnalités à développer

> 🎯 **Objectif** : Transformer War Room en une plateforme d'investigation complète permettant de scanner des documents, les indexer, chercher dans leur contenu texte tout en gardant accès aux fichiers originaux, organiser les découvertes avec des favoris/étiquettes, et filtrer/trier efficacement.

---

## 📌 Principes Fondamentaux

### Workflow Principal
```
[SCAN] Documents (PDF, images, texte)
    ↓
[EXTRACTION] OCR / parsing → texte brut
    ↓
[INDEXATION] Meilisearch (full-text) + Qdrant (sémantique)
    ↓
[RECHERCHE] Query sur le texte indexé
    ↓
[RÉSULTATS] Affiche le FICHIER ORIGINAL (pas juste le texte)
    ↓
[VISUALISATION] Voir le fichier source + texte extrait
    ↓
[ORGANISATION] Favoris + étiquettes
```

### Règle Clé : Granularité Fichier
- La recherche s'effectue sur le **texte extrait** stocké en base
- Les résultats affichent toujours le **fichier source original**
- L'utilisateur peut **visualiser le fichier original** (PDF, image, etc.)
- L'utilisateur peut **télécharger le fichier original**
- Le lien fichier → texte extrait doit être **transparent** pour l'utilisateur

---

## 🚨 Priorité 1 : UX Critique - État vide et Onboarding

### 1.1 Bloquer la recherche si aucun document indexé
- [ ] **Backend** : Endpoint `GET /api/stats` retournant :
  - `total_documents` : nombre total de documents indexés
  - `documents_by_type` : { pdf: X, image: Y, text: Z }
  - `total_scans` : nombre de scans effectués
  - `last_scan_date` : date du dernier scan
  - `index_size_bytes` : taille totale des index
- [ ] **Frontend** : Hook `useStats()` pour récupérer ces données
- [ ] **Frontend** : Composant `EmptyState` affiché quand `total_documents === 0`
  - Message : "Aucun document indexé"
  - Explication : "Scannez un dossier pour indexer vos documents et commencer à chercher"
  - Bouton CTA : "Lancer mon premier scan"
  - Illustration visuelle attrayante
- [ ] **Frontend** : Désactiver le champ de recherche et le bouton si rien n'est indexé
- [ ] **Frontend** : Afficher stats dans le header quand documents présents (ex: "1,234 documents indexés")

### 1.2 Améliorer le ScanModal
- [ ] Pré-remplir le chemin avec `/documents` (chemin Docker par défaut)
- [ ] Ajouter indication des types de fichiers supportés (PDF, images JPG/PNG/TIFF, texte TXT/MD/JSON)
- [ ] Afficher le nombre de documents déjà indexés
- [ ] Estimation du temps de scan basée sur le nombre de fichiers détectés
- [ ] Affichage détaillé de la progression par phase :
  - Phase 1 : Détection des fichiers
  - Phase 2 : Extraction du texte (OCR si nécessaire)
  - Phase 3 : Indexation Meilisearch
  - Phase 4 : Indexation Qdrant (embeddings)
- [ ] Afficher les erreurs en temps réel avec possibilité de les ignorer
- [ ] Bouton "Re-scanner" pour mettre à jour un dossier déjà scanné

---

## 🔎 Priorité 2 : Mode Navigation (Browse) sans Recherche

### 2.1 Concept
> **L'utilisateur doit pouvoir explorer les documents SANS taper de requête.**
> Exemple : "Montre-moi toutes les images" ou "Tous les PDFs de cette semaine"

### 2.2 Backend - API Browse/List
- [ ] Endpoint `GET /api/documents/` avec paramètres de filtrage :
  - `file_types[]` : filtrer par type (pdf, image, text)
  - `date_from` / `date_to` : plage de dates (date de modification du fichier)
  - `indexed_from` / `indexed_to` : plage de dates d'indexation
  - `scan_ids[]` : filtrer par scan source
  - `has_ocr` : filtrer les documents OCR
  - `min_size` / `max_size` : filtrer par taille
  - `sort_by` : date_desc, date_asc, name_asc, name_desc, size_desc, size_asc, indexed_desc
  - `limit` / `offset` : pagination
- [ ] Retourner les mêmes infos que la recherche pour cohérence UI

### 2.3 Frontend - Interface Browse
- [ ] Onglet ou toggle "Recherche" / "Explorer"
- [ ] Mode Explorer :
  - Pas de barre de recherche obligatoire
  - Panneau de filtres visible par défaut
  - Grille de résultats filtrés
- [ ] Chips de type de fichier cliquables :
  - 📄 PDF (X)
  - 🖼️ Images (Y)
  - 📝 Texte (Z)
- [ ] Filtres de date avec raccourcis :
  - "Aujourd'hui"
  - "7 derniers jours"
  - "Ce mois"
  - "Personnalisé..." (date picker)
- [ ] Dropdown de tri avec options :
  - Date (récent → ancien)
  - Date (ancien → récent)
  - Nom (A → Z)
  - Nom (Z → A)
  - Taille (grand → petit)
  - Taille (petit → grand)

---

## 🔍 Priorité 3 : Améliorer la Recherche

### 3.1 Combiner Recherche + Filtres
> **L'utilisateur doit pouvoir chercher "facture" ET filtrer par PDF uniquement**

- [ ] **Frontend** : Ajouter filtres à côté/sous la barre de recherche
- [ ] **Frontend** : Pouvoir combiner :
  - Requête texte : "facture client"
  - ET type : PDF seulement
  - ET date : 30 derniers jours
- [ ] **Frontend** : Chips actifs montrant les filtres appliqués
- [ ] **Frontend** : Bouton "× Effacer les filtres"
- [ ] **Backend** : Vérifier que l'API search supporte tous ces filtres combinés

### 3.2 Améliorer les résultats de recherche
- [ ] **Snippet avec contexte** : Extrait du texte où le terme a été trouvé (±100 caractères autour)
- [ ] **Highlighting** : Mettre en surbrillance les termes trouvés dans le snippet
- [ ] **Score de pertinence** : Afficher un indicateur visuel (barre, pourcentage, ou étoiles)
- [ ] **Source du match** : Badge "Mots-clés" / "Sémantique" / "Les deux"

---

## 📁 Priorité 4 : Affichage des Fichiers Originaux

### 4.1 Principe Fondamental
> **La recherche porte sur le TEXTE, mais l'utilisateur voit le FICHIER ORIGINAL**

### 4.2 ResultCard - Informations à afficher
- [ ] **Miniature** :
  - PDF : première page rendue en miniature
  - Images : thumbnail de l'image
  - Texte : icône générique avec aperçu des premières lignes
- [ ] **Nom du fichier** avec extension
- [ ] **Chemin complet** (tronqué avec tooltip au hover)
- [ ] **Type de fichier** avec icône (PDF 📄, Image 🖼️, Texte 📝)
- [ ] **Taille du fichier** (formatée : 1.2 MB, 456 KB)
- [ ] **Date de modification** du fichier original
- [ ] **Date d'indexation**
- [ ] **Snippet** : extrait du texte trouvé avec highlighting
- [ ] **Bouton favori** ⭐ (toggle)
- [ ] **Actions rapides** :
  - Voir le document
  - Ouvrir dans nouvel onglet
  - Télécharger l'original

### 4.3 DocumentViewer - Visualiser le fichier original
- [ ] **Header** avec :
  - Nom du fichier
  - Chemin complet (copiable)
  - Type et taille
  - Date modification / indexation
  - Bouton favori ⭐
  - Bouton télécharger ⬇️
  - Bouton ouvrir dans nouvel onglet ↗️
  - Bouton copier le texte extrait 📋
- [ ] **Vue PDF** (déjà implémentée) :
  - Navigation pages
  - Zoom
  - Highlighting du terme recherché dans le PDF si possible
- [ ] **Vue Image** (déjà implémentée) :
  - Zoom
  - Si OCR effectué, overlay du texte détecté optionnel
- [ ] **Vue Texte** :
  - Affichage formaté avec highlighting
  - Numéros de ligne
- [ ] **Panel métadonnées** (collapsible) :
  - Texte extrait complet
  - Infos OCR (confiance, langue détectée)
  - Chunks et embeddings générés (mode debug)
- [ ] **Navigation résultats** :
  - Boutons Précédent/Suivant pour naviguer dans les résultats
  - Raccourcis clavier (flèches)

### 4.4 Téléchargement et accès fichier original
- [ ] **Backend** : Endpoint `GET /api/documents/{id}/file` (déjà existant - vérifier)
- [ ] **Backend** : Headers corrects pour téléchargement (`Content-Disposition: attachment`)
- [ ] **Frontend** : Bouton "Télécharger l'original" fonctionnel
- [ ] **Frontend** : Bouton "Ouvrir dans nouvel onglet" (ouvre le fichier directement)
- [ ] **Frontend** : "Copier le chemin" pour accès manuel au fichier

---

## ⭐ Priorité 5 : Système de Favoris et Étiquettes

### 5.1 Modèle de données (Backend)
```python
class Tag(Base):
    id: int (PK)
    name: str (unique)
    color: str (hex, ex: #FF5733)
    created_at: datetime

class Favorite(Base):
    id: int (PK)
    document_id: int (FK → Document, unique)
    notes: str (nullable) - notes personnelles
    created_at: datetime
    updated_at: datetime
    tags: relationship → Tag (many-to-many)

class FavoriteTag(Base):  # Table de liaison
    favorite_id: int (FK)
    tag_id: int (FK)
```

- [ ] Créer les modèles SQLAlchemy
- [ ] Migration Alembic

### 5.2 API Favoris (Backend)
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/favorites/` | Lister favoris (avec filtres: tags, type, tri) |
| POST | `/api/favorites/` | Ajouter document aux favoris `{ document_id, notes?, tag_ids? }` |
| GET | `/api/favorites/{document_id}` | Détails d'un favori (ou 404 si non favori) |
| PATCH | `/api/favorites/{document_id}` | Modifier notes ou tags |
| DELETE | `/api/favorites/{document_id}` | Retirer des favoris |
| GET | `/api/documents/{id}/favorite-status` | Vérifier si document est favori (pour UI) |

### 5.3 API Tags (Backend)
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/tags/` | Lister toutes les étiquettes avec compteur de favoris |
| POST | `/api/tags/` | Créer étiquette `{ name, color }` |
| PATCH | `/api/tags/{id}` | Modifier étiquette |
| DELETE | `/api/tags/{id}` | Supprimer étiquette (détache des favoris) |

### 5.4 Interface Favoris (Frontend)
- [ ] **Bouton favori sur ResultCard** :
  - Étoile vide ☆ si non favori, pleine ★ si favori
  - Animation au clic (pulse/scale)
  - Toggle immédiat (optimistic update)
- [ ] **Bouton favori dans DocumentViewer** :
  - Plus grand, plus visible
  - Affiche les tags actuels si déjà favori
- [ ] **Modal d'ajout aux favoris** :
  - Sélection de tags existants (multi-select avec chips)
  - Création de tag inline (+ Nouveau tag)
  - Champ notes optionnel
  - Aperçu du document
- [ ] **Composant TagBadge** :
  - Pill colorée avec nom du tag
  - Couleur de fond = couleur du tag
- [ ] **Composant TagSelector** :
  - Liste des tags avec checkboxes
  - Recherche/filtre dans les tags
  - Bouton création nouveau tag
  - Sélection couleur (palette prédéfinie)

### 5.5 Page Favoris (Nouvelle page `/favorites`)
- [ ] **Header** :
  - Titre "Mes Favoris"
  - Compteur total
  - Bouton "Gérer les étiquettes"
- [ ] **Sidebar/Panel filtres** :
  - Filtrer par tags (checkboxes avec couleurs)
  - Filtrer par type de fichier
  - Recherche dans les favoris
- [ ] **Options de tri** :
  - Date d'ajout (récent → ancien)
  - Date d'ajout (ancien → récent)
  - Nom du fichier
  - Date du fichier original
- [ ] **Vue grille/liste** toggle
- [ ] **Liste des favoris** :
  - Miniature
  - Nom fichier
  - Tags (badges colorés)
  - Notes (tronquées)
  - Date d'ajout
  - Actions : voir, modifier, supprimer
- [ ] **Actions en masse** :
  - Sélection multiple (checkboxes)
  - Ajouter tag aux sélectionnés
  - Retirer tag
  - Supprimer des favoris

### 5.6 Gestion des Tags (Modal/Page)
- [ ] Liste de tous les tags avec :
  - Nom et couleur
  - Nombre de favoris associés
  - Actions : modifier, supprimer
- [ ] Création de tag :
  - Nom
  - Sélecteur de couleur (palette de 12-16 couleurs)
- [ ] Suppression avec confirmation si tags utilisés

---

## 🗂️ Priorité 6 : Navigation et Structure Multi-Pages

### 6.1 Routing (React Router)
- [ ] Installer `react-router-dom`
- [ ] Routes :
  - `/` → Page Recherche/Explorer (existante)
  - `/favorites` → Page Favoris
  - `/scans` → Page Gestion des Scans
  - `/settings` → Page Paramètres (optionnel)

### 6.2 Barre de Navigation
- [ ] Header persistant avec :
  - Logo War Room
  - Navigation : Recherche | Favoris | Scans
  - Stats rapides (X documents indexés)
  - Indicateur de connexion services
- [ ] Indicateur de page active
- [ ] Responsive (menu hamburger sur mobile)

### 6.3 Page Scans `/scans`
- [ ] Liste de tous les scans effectués :
  - ID
  - Chemin scanné
  - Statut (terminé, en cours, échoué)
  - Nombre de fichiers traités
  - Nombre d'erreurs
  - Date
  - Durée
- [ ] Détails d'un scan (expand ou modal) :
  - Liste des fichiers traités
  - Liste des erreurs avec détails
  - Statistiques par type de fichier
- [ ] Actions :
  - Re-scanner (mise à jour)
  - Supprimer (avec confirmation - supprime aussi les documents)
- [ ] Bouton "Nouveau scan" prominent
- [ ] Statistiques globales en haut :
  - Total documents
  - Répartition par type (pie chart ou barres)
  - Espace disque utilisé

---

## 🛠️ Priorité 7 : Améliorations Techniques

### 7.1 Backend
- [ ] Endpoint `GET /api/stats` complet
- [ ] Endpoint `GET /api/documents/` pour mode browse
- [ ] Optimiser les requêtes avec jointures pour favoris
- [ ] Cache Redis pour stats et résultats fréquents
- [ ] Pagination cohérente sur tous les endpoints
- [ ] Logs structurés (JSON) pour debugging
- [ ] Gestion d'erreurs uniforme avec codes et messages clairs

### 7.2 Frontend
- [ ] React Router setup
- [ ] State management global (Zustand recommandé) :
  - Stats globales
  - Favoris de l'utilisateur (cache local)
  - Filtres actifs
  - Résultats de recherche
- [ ] Optimistic updates pour favoris
- [ ] Error boundaries avec fallback UI
- [ ] Loading skeletons cohérents
- [ ] Toast notifications (succès, erreurs)
- [ ] Responsive design complet
- [ ] Raccourcis clavier :
  - `/` ou `Ctrl+K` : focus recherche
  - `Esc` : fermer modals
  - `←` `→` : naviguer résultats

### 7.3 Tests
- [ ] Backend : Tests pytest pour nouveaux endpoints
- [ ] Backend : Tests d'intégration API
- [ ] Frontend : Tests Vitest pour composants
- [ ] E2E : Tests Playwright pour flux critiques

---

## 📋 Résumé des Routes Frontend

| Route | Description |
|-------|-------------|
| `/` | Recherche et exploration des documents |
| `/favorites` | Gestion des favoris avec étiquettes |
| `/scans` | Historique et gestion des scans |
| `/settings` | Paramètres (optionnel, phase 2) |

---

## 📋 Résumé des Nouveaux Endpoints Backend

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/stats` | Statistiques globales |
| GET | `/api/documents/` | Lister/filtrer documents (mode browse) |
| GET | `/api/favorites/` | Lister favoris |
| POST | `/api/favorites/` | Ajouter favori |
| GET | `/api/favorites/{document_id}` | Détails favori |
| PATCH | `/api/favorites/{document_id}` | Modifier favori |
| DELETE | `/api/favorites/{document_id}` | Supprimer favori |
| GET | `/api/documents/{id}/favorite-status` | Check si favori |
| GET | `/api/tags/` | Lister tags |
| POST | `/api/tags/` | Créer tag |
| PATCH | `/api/tags/{id}` | Modifier tag |
| DELETE | `/api/tags/{id}` | Supprimer tag |

---

## 🎨 Améliorations UI/UX

- [ ] Thème sombre (actuel) / clair toggle
- [ ] Animations de transition fluides
- [ ] Tooltips sur tous les boutons d'action
- [ ] Raccourcis clavier documentés (modal aide `?`)
- [ ] Toast notifications
- [ ] Empty states illustrés et engageants
- [ ] Skeleton loading partout
- [ ] Confirmation avant actions destructives

---

## ⏳ Estimation de Complexité

| Catégorie | Effort estimé |
|-----------|---------------|
| UX État vide + Onboarding | 🟢 3-4h |
| Mode Browse (sans recherche) | 🟢 4-5h |
| Filtres + Tri combinés | 🟡 5-6h |
| Affichage fichiers originaux amélioré | 🟡 4-5h |
| Système Favoris Backend | 🟡 6-8h |
| Système Favoris Frontend | 🟡 8-10h |
| Page Favoris complète | 🟡 6-8h |
| Système Tags complet | 🟡 4-6h |
| Navigation multi-pages | 🟢 3-4h |
| Page Scans | 🟢 3-4h |
| Améliorations techniques | 🟡 6-8h |
| Tests | 🟢 4-6h |

**Total estimé : ~55-75 heures de développement**

---

## 🚀 Ordre de Développement Suggéré

### Phase 1 : Fondations (8-10h)
1. UX état vide + stats endpoint
2. Mode browse backend
3. Filtres basiques frontend

### Phase 2 : Affichage (8-10h)
4. Améliorer ResultCard
5. Améliorer DocumentViewer
6. Téléchargement fichiers originaux

### Phase 3 : Favoris (18-24h)
7. Backend favoris + tags
8. Frontend boutons favoris
9. Page Favoris complète
10. Gestion des tags

### Phase 4 : Navigation (6-8h)
11. React Router
12. Navigation header
13. Page Scans

### Phase 5 : Polish (8-12h)
14. Améliorations techniques
15. Tests
16. Responsive
17. Raccourcis clavier

---

## 📝 Notes Techniques

### Types de fichiers supportés actuellement
- **PDF** : Parsing PyPDF2 + OCR Tesseract si nécessaire
- **Images** : JPG, PNG, TIFF → OCR Tesseract obligatoire
- **Texte** : TXT, MD, JSON → Lecture directe

### Stack actuelle
- **Backend** : FastAPI + SQLAlchemy + Celery
- **Frontend** : React + Vite + Shadcn/UI + TailwindCSS
- **Search** : Meilisearch (full-text) + Qdrant (sémantique)
- **Queue** : Redis + Celery
- **OCR** : Tesseract
- **Embeddings** : Google Gemini text-embedding-004

---

## 🆕 Fonctionnalités Issues de l'Audit Concurrentiel

> Ces fonctionnalités sont identifiées comme des lacunes majeures par rapport aux outils industriels (Nuix, Autopsy, Datashare).

---

## 📅 Priorité 8 : Timeline / Visualisation Temporelle

> **Inspiration** : Autopsy, Magnet AXIOM

### Concept
L'enquêteur doit pouvoir visualiser l'activité documentaire dans le temps et isoler des périodes clés.

### 8.1 Backend - Extraction des dates
- [ ] Extraire toutes les dates des documents :
  - Date de création fichier
  - Date de modification fichier
  - Date de dernier accès
  - Dates internes (métadonnées EXIF pour images, date envoi pour emails)
  - Dates mentionnées dans le texte (parsing OCR)
- [ ] Endpoint `GET /api/timeline` avec agrégation par jour/semaine/mois
- [ ] Paramètres de filtre : type_fichier, plage_dates, scan_id

### 8.2 Frontend - Heatmap Interactive
- [ ] Composant `TimelineHeatmap` (inspiré des histogrammes Kibana)
- [ ] Barre horizontale avec activité par période
- [ ] Zoom/dézoom (mois → semaine → jour → heure)
- [ ] Sélection de plage par glissement (brush selection)
- [ ] Clic sur une période = filtre les résultats
- [ ] Affichage des pics d'activité anormaux

---

## 🏷️ Priorité 9 : NER - Extraction d'Entités Nommées

> **Inspiration** : ICIJ Datashare, OCCRP Aleph

### Concept
Extraire automatiquement les **Personnes**, **Organisations** et **Lieux** des documents pour permettre un filtrage sémantique.

### 9.1 Backend - Pipeline NLP
- [ ] Intégrer SpaCy avec modèle français (`fr_core_news_lg`)
- [ ] Extraire lors de l'indexation :
  - Personnes (PER)
  - Organisations (ORG)
  - Lieux (LOC)
  - Dates (DATE)
  - Montants (MONEY)
- [ ] Stocker les entités en base (table `DocumentEntity`)
- [ ] Endpoint `GET /api/entities` avec compteurs
- [ ] Endpoint `GET /api/documents?entity=NomPersonne`

### 9.2 Frontend - Filtres par Entités
- [ ] Panel "Entités détectées" dans le détail document
- [ ] Filtres par entité dans le mode Browse
- [ ] Nuage de tags des entités les plus fréquentes
- [ ] Clic sur entité = recherche tous les documents la mentionnant

### 9.3 Watchlist (Liste de Surveillance)
- [ ] Import CSV de noms suspects
- [ ] Alerte automatique si document matche une entrée
- [ ] Badge visuel sur les documents matchant la watchlist

---

## 📦 Priorité 10 : Extraction Récursive d'Archives

> **Inspiration** : Sist2, Nuix

### Concept
Plonger récursivement dans les archives imbriquées : ZIP > ISO > PST > RAR > PDF

### 10.1 Backend - Deep Extraction
- [ ] Intégrer `libarchive` ou `py7zr` pour extraction récursive
- [ ] Supporter : ZIP, RAR, 7Z, TAR, GZ, ISO
- [ ] Supporter : PST/OST (Outlook via `libpff`)
- [ ] Limite de profondeur configurable (défaut: 5 niveaux)
- [ ] Conserver le chemin d'origine (ex: `archive.zip/dossier/fichier.pdf`)
- [ ] Gestion des archives protégées par mot de passe (log erreur, continuer)

### 10.2 Frontend - Affichage Hiérarchique
- [ ] Afficher le chemin d'imbrication dans ResultCard
- [ ] Breadcrumb dans DocumentViewer
- [ ] Icône spéciale pour fichiers extraits d'archives

---

## 🖥️ Priorité 11 : Interface Cockpit Unifiée

> **Inspiration** : Wireframe de l'audit (Autopsy + Sist2 + Obsidian)

### Concept
Une interface "tout-en-un" où chaque action filtre les autres panels.

### 11.1 Layout 4 Zones
- [ ] **Zone 1 (top)** : Timeline interactive + barre de recherche
- [ ] **Zone 2 (left)** : Filtres à facettes (type, date, entités, tags)
- [ ] **Zone 3 (center)** : Grille de résultats
- [ ] **Zone 4 (right)** : Panneau détail/contexte IA

### 11.2 Panneau Document Expandable
- [ ] Panneau détail plus grand par défaut (60% de l'écran)
- [ ] Mode "focus" : panneau s'agrandit au hover ou au clic
- [ ] Bouton "Maximiser" pour vue plein écran du document
- [ ] Animation fluide d'expansion/réduction

### 11.3 Interactions Synchronisées
- [ ] Sélection timeline → filtre résultats + mise à jour entités
- [ ] Sélection entité → filtre résultats + highlight timeline
- [ ] Tout est connecté en temps réel

### 11.4 Chat IA Contextuel (Phase Future)
- [ ] Panel "Assistant" dans Zone 4
- [ ] Questions sur le document sélectionné
- [ ] Résumé automatique
- [ ] Connexions suggérées (via embeddings)

---

## 🔐 Priorité 12 : Intégrité de la Preuve (Chain of Custody)

> **Inspiration** : Outils forensiques professionnels

### Concept
Garantir que les fichiers originaux ne sont jamais altérés et que chaque action est tracée.

### 12.1 Backend - Hachage et Intégrité
- [ ] Calcul MD5 + SHA256 à l'ingestion
- [ ] Stocker les hachages en base
- [ ] Endpoint `GET /api/documents/{id}/verify` pour vérification
- [ ] Mode "Read-Only" : aucune modification des fichiers sources

### 12.2 Backend - Audit Log
- [ ] Table `AuditLog` : toutes les actions horodatées
- [ ] Actions tracées : consultation, téléchargement, ajout favori, export
- [ ] Export du log au format forensique

### 12.3 Frontend - Indicateurs
- [ ] Badge "Intégrité vérifiée" ✓ sur les documents
- [ ] Affichage des hachages dans le panel métadonnées
- [ ] Bouton "Vérifier l'intégrité" (recalcule et compare)

---

## ⏳ Estimation Mise à Jour

| Catégorie | Effort estimé |
|-----------|---------------|
| Timeline / Heatmap | 🔴 12-15h |
| NER (SpaCy) | 🔴 10-12h |
| Extraction Archives Récursives | 🟡 8-10h |
| Interface Cockpit | 🔴 15-20h |
| Panneau Document Expandable | 🟢 3-4h |
| Chaîne de Preuve | 🟡 6-8h |

**Total nouvelles fonctionnalités : ~55-70 heures**
**Total global : ~110-145 heures**

---

## 🚀 Roadmap Mise à Jour

### Phase 1 : Fondations UX ✅ (Terminée)
- Stats endpoint + Empty state

### Phase 2 : Mode Browse + Filtres
- API browse, filtres frontend

### Phase 3 : Favoris + Tags
- Backend + Frontend complet

### Phase 4 : Navigation Multi-Pages
- React Router, page Scans

### Phase 5 : Extraction Archives
- Support ZIP/RAR/7Z récursif

### Phase 6 : Timeline Interactive
- Heatmap, filtres temporels

### Phase 7 : NER + Entités
- SpaCy, extraction automatique

### Phase 8 : Interface Cockpit
- Layout 4 zones, panels synchronisés

### Phase 9 : Chaîne de Preuve
- Hachage, audit log, mode read-only

### Phase 10 : Chat IA Contextuel
- RAG local, résumés, suggestions

