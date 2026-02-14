# Transformation Produit UX/UI — Parcours Utilisateur Archon

Date: 14/02/2026
Auteur: Product Lead (revue transverse)
Participants visés: Dev, QA, UX Designer, UI Designer, Product

## 1) Réponse immédiate: pourquoi il y a un bouton à gauche du logo dans un projet

Le bouton visible à gauche du logo est volontairement injecté dans le `RootLayout` pour permettre un retour rapide vers la liste des projets.

Référence code:
- `frontend/src/router.tsx` (bloc header), bouton `nav.changeProject` qui exécute `clearProject(); navigate('/projects')`.

Constat UX:
- Fonctionnellement utile, mais visuellement ambigu.
- Sa position le fait ressembler à un élément de branding au lieu d’une action de navigation.
- Il concurrence la hiérarchie visuelle logo + nom du projet.

Décision recommandée:
- Conserver la fonction, changer son placement.
- Déplacer l’action dans le breadcrumb (ou menu projet), pas dans la zone logo.

---

## 2) Problème produit actuel (synthèse)

Archon est puissant techniquement, mais le parcours utilisateur est fragmenté.

Signaux principaux:
- Navigation dense et hétérogène.
- Plusieurs entrées proches pour rechercher/analyser (`/`, `/cockpit`, anciens patterns browse).
- Page Recherche trop chargée en contrôles visibles simultanément.
- Hiérarchie d’actions faible: beaucoup de boutons, peu de guidage.

Effet utilisateur:
- Impression de “bloc de fonctionnalités” plutôt qu’un outil d’enquête guidé.
- Courbe d’apprentissage plus élevée que nécessaire.
- Moins de confiance sur “quoi faire ensuite”.

---

## 3) Besoins utilisateurs (par profil)

### A. Analyste enquête (usage quotidien)
Besoins:
- Trouver vite les documents pertinents.
- Comprendre rapidement le contexte d’un document.
- Passer de la recherche à la preuve sans rupture.

Douleurs actuelles:
- Trop d’options visibles dès l’entrée.
- Trop de chemins alternatifs qui semblent faire la même chose.

### B. Responsable dossier / Lead investigation
Besoins:
- Vision claire de l’état du projet (scanné/non scanné, volume réel, progression).
- Pouvoir piloter les priorités de revue.

Douleurs actuelles:
- Incohérences de repères de navigation.
- Parcours “pilotage -> action” pas assez direct.

### C. Opérateur ingestion / scan
Besoins:
- Estimation fiable des volumes avant scan.
- Contrôle et suivi d’exécution sans ambiguïté.

Douleurs actuelles:
- Jusqu’ici sous-estimations fortes sur gros projets non scannés (corrigé côté algo, à surveiller).

### D. QA / conformité
Besoins:
- Parcours prédictible, états explicites, erreurs testables.
- Critères d’acceptation observables.

Douleurs actuelles:
- Trop de variations d’UI selon écrans similaires.

---

## 4) Parcours utilisateur cible (North Star)

### Flux cible
1. Sélectionner un projet.
2. Comprendre immédiatement l’état du projet.
3. Lancer une recherche guidée (simple par défaut).
4. Affiner avec filtres progressifs.
5. Ouvrir/valuer un document dans le volet de preuve.
6. Enchaîner vers actions d’enquête (favori, annotation, export, task).

### Principe directeur
- Une action principale par étape.
- Les options avancées doivent être accessibles, pas imposées.

---

## 5) Diagnostic UX priorisé

### Critique
1. Hiérarchie d’actions insuffisante sur Recherche.
- Trop de boutons alignés.
- Pas de “colonne vertébrale” de décision.

2. Positionnement du bouton “changer de projet”.
- Mauvais emplacement (zone marque).

### Élevé
3. Redondance conceptuelle entre écrans d’investigation.
- L’utilisateur hésite entre plusieurs routes pour des tâches proches.

4. Navigation globale surchargée.
- Trop d’entrées de même niveau visuel.

### Moyen
5. Densité visuelle irrégulière selon les pages.
- Impression de produit assemblé par modules.

---

## 6) Refonte cible de la page Recherche (anti “AI slop”)

## Objectif
Faire de Recherche l’écran maître du travail analyste: clair au premier regard, puissant en profondeur.

## Structure cible (3 volets conservés, mais repensés)

### Volet gauche: “Contexte & Filtres”
- Bloc 1: Portée (Projet, Dossier, Période).
- Bloc 2: Filtres rapides (Type, Date, Source).
- Bloc 3: “Avancé” replié (poids sémantique, presets experts).

Règle UX:
- Par défaut, seulement 4-6 contrôles visibles.
- Les réglages experts restent à 1 clic (drawer/accordion).

### Volet centre: “Résultats”
- Header sticky: volume, tri, densité d’affichage.
- Liste document centrée décision: nom, contexte, indice de pertinence visuel.
- Actions bulk regroupées dans une barre dédiée uniquement quand sélection active.

Règle UX:
- Un seul CTA principal visible en continu: `Rechercher`.

### Volet droit (50%): “Preuve”
- Aperçu document.
- Contexte d’enquête (chemin, entités, statut, historique utile).
- Actions de preuve clairement hiérarchisées: favoris, export, analyse approfondie.

Règle UX:
- Si aucun document sélectionné: afficher une vue “insights projet”, pas un vide.

## Interactions à normaliser
- Recherche simple en premier, avancée ensuite.
- États explicites: loading, no result, error, partial result.
- Raccourcis clavier documentés et cohérents.

---

## 7) Refonte de la navigation globale

## Décisions de design produit
1. Retirer le bouton “Changer de projet” de la zone logo.
2. Déplacer cette action dans breadcrumb/menu projet.
3. Réduire la navigation primaire à un noyau.

Noyau primaire recommandé:
- Recherche
- Analyse
- Scans
- Entités
- Galerie

Entrées secondaires:
- Audit, Veille, Tâches, Favoris via groupe “Plus” + palette de commande.

Effet attendu:
- Moins de bruit, plus de repères.

---

## 8) Plan de transformation par équipe

## UX Designer
- Cartographier les parcours cibles par persona.
- Produire wireflows basse fidélité des 3 volets Recherche.
- Définir règles de progressive disclosure.

## UI Designer
- Définir système visuel de hiérarchie d’actions.
- Clarifier styles CTA primaire/secondaire/tertiaire.
- Harmoniser densité, spacing, états, composants de navigation.

## Dev
- Implémenter nouvelle IA de navigation.
- Refactor Recherche en architecture “Simple + Avancé”.
- Stabiliser contrats d’état UI (store/hook) et tracking d’usage.

## QA
- Définir tests e2e sur parcours critiques.
- Valider accessibilité (focus, clavier, annonces erreurs).
- Contrôler non-régression perfs et comportement multi-projet.

---

## 9) Roadmap recommandée (6 semaines)

Semaine 1:
- Discovery utilisateurs + validation des flows cibles.
- Baseline KPI.

Semaines 2-3:
- Refonte navigation + header/breadcrumb.
- Prototypes Recherche V2 testables.

Semaines 4-5:
- Implémentation Recherche V2 (Simple + Avancé).
- QA e2e + ajustements de densité.

Semaine 6:
- Déploiement progressif + instrumentation + tuning.

---

## 10) KPI de succès

Adoption et efficacité:
- Temps médian jusqu’au 1er document ouvert.
- Nombre moyen d’actions avant document pertinent.
- Taux d’usage des filtres avancés (doit baisser en accès primaire, monter en usage expert ciblé).

Qualité perçue:
- SUS / score satisfaction analystes.
- Taux d’abandon de session sur Recherche.

Qualité produit:
- Bugs UX bloquants par release.
- Taux de réussite parcours e2e critique.

---

## 11) Agenda de réunion équipe (90 min)

1. 0-15 min: diagnostic partagé (faits, pas opinions).
2. 15-35 min: besoins utilisateurs par persona.
3. 35-60 min: validation du design cible Recherche.
4. 60-75 min: découpage Dev/QA/UX/UI et risques.
5. 75-90 min: décisions finales + plan Sprint 1.

Décisions à prendre en réunion:
1. Navigation primaire finale (5 items max).
2. Position définitive de “Changer de projet”.
3. Scope Recherche V2 (must-have vs later).
4. KPI officiels de pilotage.

---

## 12) Message de partage équipe (copier/coller)

Sujet: Réunion transformation UX parcours Archon (Dev + QA + UX + UI)

Bonjour équipe,

Le document de cadrage est prêt: `docs/REUNION_TRANSFORMATION_PARCOURS_UX.md`.

Objectif réunion: valider une refonte concrète du parcours utilisateur, avec priorité sur la page Recherche et la simplification de la navigation.

Merci de venir avec:
- Dev: contraintes techniques et estimation de découpage.
- QA: stratégie de validation e2e + accessibilité.
- UX/UI: proposition de hiérarchie d’actions et wireflow final.

On sort de la réunion avec un plan Sprint 1 exécutable.
