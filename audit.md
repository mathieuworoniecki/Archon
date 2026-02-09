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

**Problème** : `handleDeleteScan` et `handleDeleteProject` appellent directement l'API (delete immédiat). Pas de "Êtes-vous sûr ? Ce scan contient 75 526 fichiers indexés."
**Solution** : Confirm dialog avec contexte chiffré + option "Annuler" pendant 5s (undo).

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

**Problème** : `useScanProgress.ts` ouvre un EventSource mais ne gère pas la perte de connexion. Si le réseau coupe 1 seconde, le stream est mort et l'utilisateur voit un scan figé à jamais.
**Solution** : Reconnect automatique avec backoff exponentiel (1s → 2s → 4s → max 30s), avec un badge "Reconnexion…" dans l'UI.

---

## 🟠 Priorité Haute — Frictions Majeures

### 5. Types Dupliqués (Dette Technique = Bugs)

**Problème** : `ScanRecord` est défini **2 fois** (dans `ProjectDashboard.tsx` ET dans `ScansPage.tsx`), et les deux versions sont différentes ! Le type dans `ScansPage` n'a pas `enable_embeddings`.
**Solution** : Un seul type partagé dans `api.ts`, importé partout.

---

### 6. Timeline Clique sur du Vide

**Problème** : `TimelinePage.handleDateClick` stocke la date sélectionnée dans un state, puis affiche "Sélectionnez dans le cockpit" — c'est un cul-de-sac UX. L'utilisateur clique sur une barre du heatmap et rien ne se passe.
**Solution** : Au clic sur une période, naviguer vers le Cockpit avec le filtre de date pré-rempli, ou afficher la liste des documents de cette période directement en-dessous.

---

### 7. Galerie sans Infinite Scroll

**Problème** : Le bouton "Charger plus" est un pattern de 2010. Avec 75 000+ images, c'est inutilisable.
**Solution** : Intersection Observer pour le scroll infini automatique.

---

### 8. Chat sans Streaming

**Problème** : `ChatPage.sendMessage` fait un `POST` et attend la réponse complète. Pas de streaming, pas d'indicateur de frappe, pas de "l'IA réfléchit…".
**Solution** : Streaming SSE des réponses avec affichage progressif mot par mot + animation "thinking".

---

### 9. Raccourcis Clavier sous-Utilisés

**Problème** : Le hook `useKeyboardShortcuts` est implémenté mais ne gère que 2 raccourcis (`/` pour focus search, `Escape` pour blur). Pas de raccourcis pour les actions fréquentes.
**Solution** : Ajouter les raccourcis essentiels :
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

**Problème** : Chaque page affiche un spinner centré pendant le chargement. Pattern paresseux.
**Solution** : Skeleton loaders qui mimiquent la forme du contenu attendu (cartes de projets, lignes de résultats, etc.).

---

### 11. Pas de Recherches Récentes / Suggestions

**Problème** : La SearchBar ne mémorise rien. À chaque ouverture, champ vide.
**Solution** :

- Historique des 10 dernières recherches (localStorage)
- Autocomplete/suggestions basées sur les entités détectées (NER)
- `Ctrl+K` ouvre un command palette (comme Spotlight/Alfred)

---

### 12. Navigation : Pas de Breadcrumbs

**Problème** : Quand on est dans un projet → cockpit → document, on perd le contexte de navigation.
**Solution** : Breadcrumb minimal : `Projets > Epstein > Cockpit > document.pdf`

---

### 13. Résumé Post-Scan absent

**Problème** : Quand un scan se termine, on voit "✅ Scan terminé" avec un compteur. Pas de résumé actionnable.
**Solution** : Écran de résumé post-scan :

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

Un petit indicateur en bas de la sidebar montrant l'état de MeiliSearch, Qdrant, Redis, Celery (vert/rouge). Actuellement, l'API `health` existe mais n'est appelée nulle part.

### 20. Onboarding Guidé pour Nouveaux Utilisateurs

Premier lancement → tour guidé avec 3-4 étapes : "Voici vos projets", "Lancez un scan", "Explorez vos documents".

---

## 📊 Matrice de Priorisation

| #   | Feature                 | Impact     | Effort      | Ratio |
| --- | ----------------------- | ---------- | ----------- | ----- |
| 1   | Toast / Feedback        | ⭐⭐⭐⭐⭐ | 🔧 Faible   | 🏆    |
| 3   | Scan Estimate Preview   | ⭐⭐⭐⭐⭐ | 🔧 Faible   | 🏆    |
| 2   | Confirm + Undo Delete   | ⭐⭐⭐⭐   | 🔧 Faible   | 🏆    |
| 5   | Types consolidés        | ⭐⭐⭐     | 🔧 Faible   | 🏆    |
| 4   | SSE Auto-Reconnect      | ⭐⭐⭐⭐   | 🔧🔧 Moyen  | ⭐⭐  |
| 13  | Résumé Post-Scan        | ⭐⭐⭐⭐   | 🔧🔧 Moyen  | ⭐⭐  |
| 9   | Raccourcis Clavier      | ⭐⭐⭐     | 🔧 Faible   | ⭐⭐  |
| 10  | Loading Skeletons       | ⭐⭐⭐     | 🔧🔧 Moyen  | ⭐    |
| 7   | Infinite Scroll Gallery | ⭐⭐⭐     | 🔧 Faible   | ⭐⭐  |
| 11  | Command Palette         | ⭐⭐⭐⭐   | 🔧🔧🔧 Haut | ⭐    |
| 6   | Timeline → Cockpit      | ⭐⭐⭐     | 🔧🔧 Moyen  | ⭐    |
| 8   | Chat Streaming          | ⭐⭐⭐⭐   | 🔧🔧🔧 Haut | ⭐    |
| 14  | Cache SWR               | ⭐⭐⭐     | 🔧🔧🔧 Haut | ○     |
| 19  | Health Indicator        | ⭐⭐       | 🔧 Faible   | ⭐    |

---

## 🎯 Plan d'Action Recommandé

### Sprint 1 — Quick Wins (1-2 jours)

1. **Toast system** (sonner ou react-hot-toast)
2. **estimateScan()** dans le dialog de scan
3. **Confirm dialog** avant suppression
4. **Consolider les types** (`ScanRecord` → un seul endroit)
5. **Infinite scroll** galerie

### Sprint 2 — Intelligence (2-3 jours)

6. **SSE auto-reconnect** avec retry UI
7. **Résumé post-scan** avec actions
8. **Raccourcis clavier** étendus
9. **Timeline → navigation vers cockpit**
10. **Health indicator** sidebar

### Sprint 3 — Polish (3-5 jours)

11. **Command palette** (`Ctrl+K`)
12. **Chat streaming** SSE
13. **Loading skeletons**
14. **Breadcrumbs**
15. **Hover preview** documents
