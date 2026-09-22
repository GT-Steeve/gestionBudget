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

HTML, CSS et JavaScript « vanilla », sans framework ni étape de build.

- `index.html` — structure de la page
- `style.css` — thème (clair/sombre), mise en page, responsive
- `script.js` — logique de l'application (calculs, rendu, stockage local)

## Licence

Distribué sous licence [MIT](LICENSE).
