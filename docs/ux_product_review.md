# Archon – Revue Produit & UX (Global)

Date: 2026-02-14

## 1) But

Transformer Archon en outil forensique "au quotidien":

- rapide a prendre en main (parcours clair),
- puissant (recherche + exploration multi-vues),
- actionnable (on ouvre, on prouve, on exporte),
- auditable (preuves localisables, trace, reproductibilite).

## 2) Utilisateurs cibles (personas)

- Analyste / enquêteur: doit trouver vite des documents pertinents, relier des elements, construire une chronologie.
- Journaliste / avocat: veut naviguer, annoter, exporter, justifier chaque affirmation avec un document.
- QA / ops: verifie la stabilite, regressions, securite, performance.

## 3) Jobs-To-Be-Done (les vrais besoins)

- Ingestion: ajouter un projet, scanner, voir l'etat, comprendre ce qui manque.
- Trouver: filtrer et reduire l'ensemble a une short-list fiable (precision > recall au debut).
- Explorer: comparer des documents, passer de "liste" a "preuve" sans friction.
- Relier: entites, graphe, timeline pour faire emerger motifs, anomalies, reseaux.
- Produire: favoris, notes, exports, audit trail (chaine d'integrite).

## 4) Parcours utilisateur (ideal)

1. Projets: choisir un dossier / projet.
2. Scan: lancer, suivre, reprendre si echec, comprendre le perimetre.
3. Recherche & Documents (hub): parcourir tous les docs, filtrer, visualiser, zoomer, selectionner, ouvrir.
4. Exploration:
   - Timeline: cliquer une periode -> voir la liste de docs -> ouvrir dans Recherche.
   - Graphe: cliquer une entite -> basculer vers la liste/Recherche filtree.
   - Galerie: parcourir images/videos/PDF visuels -> ouvrir dans Recherche.
5. Sortie: favoris + synthese, exports, audit.

## 5) Problemes observes (symptomes)

- Navigation trop chargee: trop d'items au meme niveau, pas de "chemin" evident.
- Page Recherche trop dense: beaucoup d'options "en ligne" sans hierarchie claire.
- Timeline percue comme inutile quand on ne voit pas immediatement "quoi faire" + "quels docs".
- Features secondaires (ex: Veille) polluent le parcours si non essentielles.

## 6) Direction UX (principes)

- "Search is the hub": la page Recherche/Documents est la source de verite, les autres vues doivent y renvoyer.
- "Drill-down": chaque vue (Timeline, Graphe, Galerie) doit permettre 1 clic -> liste de documents -> ouverture.
- "Progressive disclosure": options avancees derriere des sections / toggles, pas tout a plat.
- "Evidence-first": tout resultat doit ouvrir la preuve (document) avec contexte.

## 7) Changements deja livres (impact direct)

- Recherche/Documents:
  - Vue Grille (aperçus + zoom + taille page) pour voir beaucoup de documents.
  - Clic grille -> bascule vers la vue 3 panneaux (filtres + liste + viewer).
  - Toggle pour masquer/afficher la sidebar filtres.
- Timeline:
  - Panneau "Periode selectionnee" visible et actionnable (ouvrir Recherche + liste docs).
  - Auto-selection si une seule periode visible (evite page "vide").
- Navigation:
  - Veille/Taches deplaces dans un menu "Plus" (overflow), nav principale declutter.
  - Nav compacte sur ecrans plus petits (icones + tooltips).

## 8) Propositions (roadmap UX/UI)

Priorite P0 (2-5 jours):

- Recherche/Documents:
  - Chips "filtres actifs" au-dessus de la liste/grille (click pour retirer).
  - Actions bulk coherentes en grille (favoris/export) si besoin.
- Timeline:
  - Onboarding micro-copy: "Cliquez une barre pour voir les documents".

Priorite P1 (1-2 semaines):

- Re-architecture IA de navigation: 3 espaces:
  - Explorer (Recherche, Galerie),
  - Relier (Timeline, Entites, Graphe),
  - Produire (Favoris, Audit, Exports).
- Mode mobile:
  - controles essentiels accessibles sans ouvrir 3 panneaux en permanence.

Priorite P2 (1 mois):

- Narratif / dossier d'enquete:
  - "case file" avec notes, liens, timeline d'evenements, exports versionnes.

## 9) Reunion (dev + QA + UX/UI) – Agenda

1. Valider les 3 parcours prioritaires (Scan -> Recherche -> Preuve / Relier / Produire).
2. Valider l'IA de navigation (groupes, ce qui est "core" vs "overflow").
3. Lister les quick wins P0 (1 sprint) + KPI:
   - temps pour trouver un doc (TTR),
   - % sessions ou la timeline/graphe/gallerie debouche sur ouverture d'un doc,
   - precision percue des resultats (qualitatif).
4. Plan de QA: checklists + non-regression sur recherche/scan/auth.

