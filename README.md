# Gestion budget

Petite application web pour suivre son budget : revenus, charges, dépenses,
cashback et arrondi automatique, économies potentielles, simulation de
placement, exemples de produits financiers et synthèse visuelle,
**le tout avec AUCUNE FUITE DE DONNÉE !!**

**Version actuelle :** v1.14.2 (historique dans [`patchNote.txt`](patchNote.txt))

**Démo en ligne :** https://gt-steeve.github.io/gestionBudget/

> **Avertissement :** cet outil ne fournit qu'une **estimation**. Il ne tient
> pas compte de nombreux paramètres réels (inflation, fiscalité, frais…) et
> les simulations de rendement supposent un taux annuel constant, ce qui
> n'est jamais le cas d'un placement réel. Il ne remplace pas un conseil
> financier.

## Fonctionnalités

- **Revenus, charges & dépenses** — saisie par catégorie via une pop-up
  guidée (un champ par étape), totaux mensuels et annuels (× 12) calculés
  automatiquement, édition et suppression en ligne. Les dépenses se suivent
  au mois, avec un historique des mois précédents.
- **Pop-up Détail** (bouton œil sur chaque revenu, charge et dépense) —
  libellé, catégorie, montant, annuel, cashback et RoundUp, avec la date et
  l'heure d'ajout. Le bouton **Modifier** rend ces valeurs éditables
  (Valider / Annuler), date et heure comprises.
- **Sélecteurs maison** — catégories, calendrier (avec choix de l'année) et
  heure à molettes chiffre par chiffre, en boutons plutôt que les listes et
  sélecteurs natifs du navigateur, plus lisibles sur mobile.
- **Répartition par catégorie** — vue synthétique des revenus et des charges
  avec barres de proportion.
- **CashBack & RoundUp** — estimation du cashback reversé par la banque et de
  l'arrondi automatique (différence mise de côté, comme sur Trade Republic),
  activables ligne par ligne dès l'ajout d'une charge ou d'une dépense. Un
  montant déjà rond est arrondi au multiple suivant (x1 → 1,00 €, x2 → 2,00 €).
- **Économie potentielle** — comparez une charge à une alternative
  (fournisseur moins cher, autre offre…) et voyez l'économie mensuelle/annuelle.
- **Simulation de placement** — intérêts composés sur deux rendements annuels
  modifiables (2 % et 10 % par défaut), via une pop-up guidée (épargne
  mensuelle, capital, durée, rendements) ou directement dans le formulaire.
  Exemples prêts à l'emploi, bouton « Simuler avec mes économies mensuelles »,
  tableau comparatif (capital, épargné, intérêts, gain d'une année au choix),
  graphique d'évolution et détail année par année.
- **Produits financiers** — exemples concrets d'actions, d'obligations et
  d'ETF (dont des ETN crypto) classés par onglets, avec ISIN et lien vers leur
  fiche [justETF](https://www.justetf.com/fr/). Accessible depuis la page
  Placement et l'Annexe.
- **Annexe** — lexique des termes financiers courants (action, obligation,
  ETF, cashback, arrondi automatique).
- **Synthèse graphique** — camembert de répartition des dépenses et graphique
  en barres, par mois ou par an.
- **Exporter** — page dédiée : format **PDF** (fenêtre d'impression du
  navigateur, « Enregistrer en PDF »), **Word** (fichier `.docx` généré dans
  le navigateur, sans bibliothèque) ou **Google Docs** (le même `.docx`, à
  importer dans Google Drive : aucune connexion n'est faite). Trois modèles :
  **Simple** (synthèse + dépenses du mois), **Standard** (+ revenus, charges,
  placement) et **Complet** (+ historique des dépenses, économie, cashback,
  RoundUp). Le `.docx` et le PDF embarquent aussi toutes les données du profil
  (quel que soit le modèle), pour pouvoir les réimporter : partie JSON dans le
  `.docx`, lien « Gestion budget » de la page de garde dans le PDF.
- **Imprimer** (bureau) — page dédiée avec les mêmes modèles, qui imprime
  directement le rapport. Les boutons « Exporter » et « Imprimer » restent
  aussi disponibles sous la synthèse.
- **Profils** — plusieurs budgets indépendants sur le même appareil (le vôtre,
  celui d'un proche…) : chacun garde ses propres revenus, charges, dépenses et
  placements, sans rien mélanger. Chaque profil de la liste affiche ses
  revenus, charges, dépenses du mois et son solde, avec un bouton œil pour
  masquer ses montants. Création d'un profil vide ou pré-rempli (point de
  départ choisi dans une pop-up), changement, renommage et suppression depuis
  la page Profil. **Import** d'un profil à partir du `.docx` ou du PDF exporté
  par l'application (glisser-déposer sur bureau) ; tout autre fichier est
  refusé (autre application, export modifié ou réenregistré), et un nom déjà
  pris doit être changé. Après une création ou un import, l'application ouvre
  la page où continuer et y confirme l'action dans une pop-up.
- **Profil d'exemple** — un budget fictif complet (dépenses du mois et des
  deux mois précédents, comparaisons, placement) pour découvrir chaque page.
  Il s'ouvre à part et le bouton « Fermer l'exemple » le supprime en ramenant
  au profil d'avant : vos données ne sont jamais touchées.
- **Paramètres** — taille d'affichage petite (100 %), normale (115 %, par
  défaut) ou agrandie (130 %), comme le zoom du navigateur, et thème clair ou sombre (automatique selon le système
  tant qu'aucun choix n'est fait).
- **Interface responsive** — sur bureau, menu latéral replié sur ses icônes
  qui se déplie au survol ; sur tablette, menu latéral déplié ; sur mobile,
  onglets sous le titre, avec Profil et Paramètres en icônes.
- Toutes les données restent **dans le navigateur** (`localStorage`) —
  aucun serveur, aucun compte.
- **Aucune connexion sortante** — chaque page déclare une
  Content-Security-Policy (`connect-src 'none'`, aucun script ni fichier
  externe) : même un script ajouté par erreur ne pourrait rien envoyer.
  `npm run build` échoue si une page n'en a pas.

## Utilisation

Aucune installation ni dépendance : ouvrez simplement `index.html` dans un
navigateur, ou servez le dossier avec n'importe quel serveur statique.

```bash
python3 -m http.server
```

## Stack technique

HTML, CSS et JavaScript « vanilla » côté application : aucun framework, aucun
bundler, aucune étape de build pour faire tourner le site (ouvrir `index.html`
suffit). Un outillage Node existe en parallèle uniquement pour la qualité et
les releases (lint, tests, CI/CD) — voir « Contribuer » ci-dessous.

- `index.html` — tableau de bord (page d'accueil)
- `pages/` — pages dédiées (Revenus, Dépenses, Charges, CashBack/RoundUp,
  Économie, Placement, Produits financiers, Annexe, Exporter, Imprimer,
  Profil, Paramètres, À propos, Vos données)
- `assets/css/style.css` — thème (clair/sombre), taille agrandie, mise en page, responsive, impression
- `assets/js/script.js` — logique de l'application (rendu, stockage local, rapports d'export et d'impression, profil d'exemple)
- `assets/js/docx.js` — génération de fichiers Word (.docx) dans le navigateur (XML Word + archive ZIP), partagée avec les tests
- `assets/js/pdflink.js` — données du profil dans le lien de la page de garde du rapport PDF, et leur relecture à l'import
- `assets/js/calc.js` — calculs financiers purs (intérêts composés, économies), partagés avec les tests
- `assets/js/profiles.js` — profils : liste, profil actif, données de chaque profil sous sa propre clé `localStorage`
- `assets/js/nav.js` — menu, thème et taille d'affichage, bouton « Fermer l'exemple », effacement des données
- `assets/js/profil.js` / `assets/js/parametres.js` — pages Profil et Paramètres
- `assets/js/tabs.js` — onglets accessibles (page Produits financiers)
- `assets/img/` — favicons et image de partage (Open Graph)

## Contribuer

Le dépôt utilise [Conventional Commits](https://www.conventionalcommits.org/fr/)
et une release automatisée :

```bash
npm install       # installe l'outillage (lint, tests, hooks Git)
npm run lint      # ESLint sur assets/js
npm test          # Vitest sur calc.js, profiles.js, docx.js et pdflink.js
npm run build     # vérifie les références des pages et la version de cache des CSS/JS
npm run bump-assets  # augmente le ?v= des CSS/JS après les avoir modifiés
```

Les hooks Git (Husky) vérifient localement le message de commit, le lint,
les tests et le build avant chaque commit.

Les pages chargent les CSS/JS avec un numéro de cache (`style.css?v=1.01.25`).
Après toute modification d'un fichier de `assets/css` ou `assets/js`, lancez
`npm run bump-assets` : sinon le build échoue, car les navigateurs garderaient
l'ancienne version en cache.

Toute PR passe par la CI (lint, tests, build) ; une fois
mergée sur `main`, si tout est vert, **semantic-release** détermine la
prochaine version à partir des commits (`fix` → patch, `feat` → minor,
`BREAKING CHANGE` → major), génère le tag, le `CHANGELOG.md` et la GitHub
Release, puis le site est déployé sur GitHub Pages.

## Licence

Distribué sous licence [MIT](LICENSE).
