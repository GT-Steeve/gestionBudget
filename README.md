# Gestion budget

Petite application web pour suivre son budget : revenus, charges, économies
potentielles, simulation de rendement d'épargne et synthèse visuelle.

**Démo en ligne :** https://gt-steeve.github.io/gestionBudget/

> **Avertissement :** cet outil ne fournit qu'une **estimation**. Il ne tient
> pas compte de nombreux paramètres réels (inflation, fiscalité, frais…) et
> les simulations de rendement supposent un taux annuel constant, ce qui
> n'est jamais le cas d'un placement réel. Il ne remplace pas un conseil
> financier.

## Fonctionnalités

- **Revenus & charges** — saisie par catégorie, totaux mensuels et annuels
  (× 12) calculés automatiquement, édition et suppression en ligne.
- **Répartition par catégorie** — vue synthétique des charges avec barres de
  proportion.
- **Économie potentielle** — comparez une ligne existante à une alternative
  (fournisseur moins cher, autre offre…) et voyez l'économie mensuelle/annuelle.
- **Rendement de l'épargne** — simulation à intérêts composés sur deux taux
  annuels modifiables (2 % et 10 % par défaut), avec gain affiché pour
  l'année de votre choix et détail année par année.
- **Synthèse graphique** — camembert de répartition des dépenses et graphique
  en barres, par mois ou par an.
- **Export PDF & impression** — boutons « Exporter » et « Imprimer » sous la
  synthèse : ils ouvrent la boîte de dialogue d'impression du navigateur
  (feuille de style `@media print` dédiée), qui propose « Enregistrer en PDF »
  comme destination.
- **Thème clair / sombre**, au choix ou automatique selon les préférences du
  système.
- **Interface responsive** (mobile, tablette, desktop) avec menu compact sur
  petit écran.
- Toutes les données restent **dans le navigateur** (`localStorage`) —
  aucun serveur, aucun compte.

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
- `pages/` — pages dédiées (Revenus, Charges, Économies, Rendement, À propos)
- `assets/css/style.css` — thème (clair/sombre), mise en page, responsive, impression
- `assets/js/script.js` — logique de l'application (rendu, stockage local, export/impression)
- `assets/js/calc.js` — calculs financiers purs (intérêts composés, économies), partagés avec les tests
- `assets/js/nav.js` — menu mobile, thème, effacement des données
- `assets/img/` — favicons et image de partage (Open Graph)

## Contribuer

Le dépôt utilise [Conventional Commits](https://www.conventionalcommits.org/fr/)
et une release automatisée :

```bash
npm install       # installe l'outillage (lint, tests, hooks Git)
npm run lint      # ESLint sur assets/js
npm test          # Vitest sur assets/js/calc.js
npm run build     # vérifie que les pages ne référencent pas de fichier manquant
```

Les hooks Git (Husky) vérifient localement le message de commit et le lint
avant chaque commit. Toute PR passe par la CI (lint, tests, build) ; une fois
mergée sur `main`, si tout est vert, **semantic-release** détermine la
prochaine version à partir des commits (`fix` → patch, `feat` → minor,
`BREAKING CHANGE` → major), génère le tag, le `CHANGELOG.md` et la GitHub
Release, puis le site est déployé sur GitHub Pages.

## Licence

Distribué sous licence [MIT](LICENSE).
