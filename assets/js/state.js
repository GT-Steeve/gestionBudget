/* ==========================================================================
   Gestion budget — état de l'application (partagé navigateur + Node/tests) :
   catégories, budget d'exemple, lecture des données enregistrées ou
   importées (nettoyées champ par champ) et archivage mensuel des dépenses.
   Sans DOM ni stockage : script.js lit et écrit localStorage.
   ========================================================================== */
'use strict';

(function (root, factory) {
  const state = factory();
  if (typeof module === 'object' && module.exports) module.exports = state;
  if (root) root.BudgetState = state;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const CATEGORIES = ['Loyer', 'Factures', 'Courses', 'Transport', 'Abonnements', 'Activité', 'Plaisir', 'Assurance', 'Épargne', 'Prêt', 'Famille / Proche', 'Autre'];
  const REV_CATEGORIES = ['Salaire', 'Aide', 'Autre'];
  const DEP_CATEGORIES = ['Course', 'Alimentaire', 'Transport', 'Shopping', 'Divertissement', 'Sortie', 'Équipement', 'Entretien ménager', 'Cadeau', 'Famille / Proche', 'Santé', 'Amende', 'Imprévu', 'Restaurant', 'Autre'];
  const DEFAULT_RATES = [2, 10]; // rendements annuels proposés par défaut, en % (modifiables)
  const MAX_RATE = 100;          // plafond des rendements saisis, en %
  const ROUND_UP_OPTIONS = [1, 2, 3, 5, 10]; // multiples disponibles pour le RoundUp, en €

  const uid = () => Math.random().toString(36).slice(2, 9);
  const num = (v) => {
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  /** Clé « AAAA-MM » du mois d'une date, pour comparer/archiver par mois. */
  const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  /** Taux saisi : valeur absente → défaut ; sinon entre 0 et MAX_RATE. */
  const readRate = (v, fallback) => (v === undefined || v === null || v === '' ? fallback : clamp(num(v), 0, MAX_RATE));

  /** Budget fictif complet (profil d'exemple ou profil pré-rempli), daté par rapport à now. */
  function exampleState(now = new Date()) {
    const loyer = { id: uid(), categorie: 'Loyer', nom: 'Loyer', mensuel: 1200 };
    const elec = { id: uid(), categorie: 'Factures', nom: 'Électricité', mensuel: 120 };
    const inter = { id: uid(), categorie: 'Factures', nom: 'Internet + mobile', mensuel: 90 };
    const courses = { id: uid(), categorie: 'Courses', nom: 'Courses alimentaires', mensuel: 400 };
    const transport = { id: uid(), categorie: 'Transport', nom: 'Pass transport', mensuel: 90 };
    const assurance = { id: uid(), categorie: 'Assurance', nom: 'Assurance habitation', mensuel: 25 };
    const abos = { id: uid(), categorie: 'Abonnements', nom: 'Netflix + Spotify', mensuel: 30 };
    const livret = { id: uid(), categorie: 'Épargne', nom: 'Livret A', mensuel: 150 };

    // Dépenses datées par rapport à aujourd'hui : mois en cours (jours déjà
    // passés uniquement) et deux mois précédents, archivés dans l'historique.
    const depense = (monthsAgo, day, categorie, nom, montant) => {
      const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1, 12);
      d.setDate(monthsAgo ? day : Math.min(day, now.getDate()));
      return { id: uid(), categorie, nom, montant, ajout: d.toISOString() };
    };
    const archive = (monthsAgo, items) => ({
      mois: monthKey(new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)),
      total: items.reduce((sum, d) => sum + d.montant, 0),
      items
    });

    return {
      revenus: [
        { id: uid(), categorie: 'Salaire', nom: 'Salaire net', mensuel: 2300 },
        { id: uid(), categorie: 'Aide', nom: 'Aide enfant', mensuel: 150 }
      ],
      charges: [loyer, elec, inter, courses, transport, assurance, abos, livret],
      depenses: [
        depense(0, 2, 'Alimentaire', 'Boulangerie', 8.4),
        depense(0, 4, 'Transport', 'Essence', 55),
        depense(0, 6, 'Restaurant', 'Pizzeria', 32.5),
        depense(0, 9, 'Shopping', 'Zara', 49.99),
        depense(0, 12, 'Divertissement', 'Jeu Steam', 19.99),
        depense(0, 15, 'Santé', 'Pharmacie', 14.2),
        depense(0, 18, 'Sortie', 'Cinéma', 22),
        depense(0, 21, 'Cadeau', 'Anniversaire de Léa', 35),
        depense(0, 24, 'Entretien ménager', 'Lessive, éponges', 12.8)
      ],
      depensesHistorique: [
        archive(1, [
          depense(1, 3, 'Alimentaire', 'Marché', 23.6),
          depense(1, 5, 'Transport', 'Essence', 60),
          depense(1, 8, 'Restaurant', 'Fast-food', 14.9),
          depense(1, 11, 'Famille / Proche', 'Sortie en famille', 45),
          depense(1, 14, 'Équipement', 'Bouilloire', 29.99),
          depense(1, 19, 'Sortie', 'Bowling', 18),
          depense(1, 22, 'Amende', 'Stationnement', 35),
          depense(1, 27, 'Shopping', 'Amazon', 24.5)
        ]),
        archive(2, [
          depense(2, 2, 'Alimentaire', 'Boulangerie', 6.9),
          depense(2, 6, 'Transport', 'Péage', 12.4),
          depense(2, 9, 'Imprévu', 'Garage, plaquettes de frein', 180),
          depense(2, 13, 'Restaurant', 'Restaurant japonais', 41),
          depense(2, 17, 'Santé', 'Médecin', 30),
          depense(2, 20, 'Divertissement', 'Place de concert', 55),
          depense(2, 25, 'Cadeau', 'Fleurs', 25)
        ])
      ],
      depensesMoisCourant: monthKey(now),
      cashbackRate: 1,
      roundUpTo: 1,
      scenarios: [
        { id: uid(), chargeId: elec.id, option: 'Fournisseur moins cher', nouveau: 52 },
        { id: uid(), chargeId: courses.id, option: 'Marque distributeur + drive', nouveau: 260 },
        { id: uid(), chargeId: abos.id, option: 'Offre duo partagée', nouveau: 18 }
      ],
      yield: { capital: 3000, versement: 150, annees: 15, taux1: DEFAULT_RATES[0], taux2: DEFAULT_RATES[1], anneeGain: 5 },
      view: 'mois'
    };
  }

  /** Date d'ajout enregistrée (ISO) si valide, sinon null (anciennes lignes). */
  const validDate = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);

  /** Éléments d'une liste enregistrée ou importée qui sont bien des objets : une
      valeur null ou un nombre dans la liste ferait sinon planter la page. */
  const records = (list) => (Array.isArray(list) ? list : [])
    .filter((x) => x !== null && typeof x === 'object' && !Array.isArray(x));

  /** État de l'application à partir des données enregistrées ou importées
      (saved), nettoyées champ par champ ; l'exemple si elles sont absentes ou
      illisibles. Les comparaisons dont la charge n'existe plus sont retirées. */
  function load(saved, now = new Date()) {
    if (!saved || !Array.isArray(saved.charges) || !Array.isArray(saved.scenarios)
      || saved.yield === null || typeof saved.yield !== 'object') {
      return exampleState(now);
    }
    const state = {
      charges: records(saved.charges).map((c) => ({
        id: String(c.id || uid()),
        categorie: CATEGORIES.includes(c.categorie) ? c.categorie : 'Autre',
        nom: String(c.nom || 'Sans nom').slice(0, 60),
        mensuel: num(c.mensuel),
        cashbackOn: c.cashbackOn !== false,
        roundUpOn: c.roundUpOn !== false,
        ajout: validDate(c.ajout)
      })),
      revenus: records(saved.revenus).map((r) => ({
        id: String(r.id || uid()),
        categorie: REV_CATEGORIES.includes(r.categorie) ? r.categorie : 'Salaire',
        nom: String(r.nom || 'Sans nom').slice(0, 60),
        mensuel: num(r.mensuel),
        ajout: validDate(r.ajout)
      })),
      depenses: records(saved.depenses).map((d) => ({
        id: String(d.id || uid()),
        categorie: DEP_CATEGORIES.includes(d.categorie) ? d.categorie : 'Autre',
        nom: String(d.nom || 'Sans nom').slice(0, 60),
        montant: num(d.montant),
        cashbackOn: d.cashbackOn !== false,
        roundUpOn: d.roundUpOn !== false,
        ajout: validDate(d.ajout)
      })),
      depensesHistorique: records(saved.depensesHistorique).map((m) => ({
        mois: /^\d{4}-\d{2}$/.test(m.mois) ? m.mois : monthKey(now),
        total: num(m.total),
        items: records(m.items).map((d) => ({
          id: String(d.id || uid()),
          categorie: DEP_CATEGORIES.includes(d.categorie) ? d.categorie : 'Autre',
          nom: String(d.nom || 'Sans nom').slice(0, 60),
          montant: num(d.montant),
          ajout: validDate(d.ajout)
        }))
      })).slice(0, 12),
      depensesMoisCourant: /^\d{4}-\d{2}$/.test(saved.depensesMoisCourant) ? saved.depensesMoisCourant : monthKey(now),
      cashbackRate: Number.isFinite(saved.cashbackRate) ? clamp(saved.cashbackRate, 0, MAX_RATE) : 1,
      roundUpTo: ROUND_UP_OPTIONS.includes(saved.roundUpTo) ? saved.roundUpTo : 1,
      scenarios: records(saved.scenarios).map((x) => ({
        id: String(x.id || uid()),
        chargeId: String(x.chargeId),
        option: String(x.option || '').slice(0, 60),
        nouveau: num(x.nouveau)
      })),
      view: saved.view === 'an' ? 'an' : 'mois',
      yield: (() => {
        const annees = clamp(Math.round(num(saved.yield.annees)) || 10, 1, 50);
        return {
          capital: num(saved.yield.capital),
          versement: num(saved.yield.versement),
          annees,
          taux1: readRate(saved.yield.taux1, DEFAULT_RATES[0]),
          taux2: readRate(saved.yield.taux2, DEFAULT_RATES[1]),
          anneeGain: clamp(Math.round(num(saved.yield.anneeGain)) || 1, 1, annees)
        };
      })()
    };
    state.scenarios = state.scenarios.filter((x) => state.charges.some((c) => c.id === x.chargeId));
    return state;
  }


  /** Archive les dépenses du mois précédent dès qu'on change de mois (ex. premier
      chargement de l'app en un nouveau mois) : la liste en cours repart à zéro,
      l'ancienne reste consultable dans l'historique (12 mois glissants max).
      Renvoie true si l'état a changé (à enregistrer). */
  function archiveMonth(state, now = new Date()) {
    const nowKey = monthKey(now);
    if (state.depensesMoisCourant === nowKey) return false;
    if (state.depenses.length) {
      state.depensesHistorique = [
        { mois: state.depensesMoisCourant, total: state.depenses.reduce((sum, d) => sum + d.montant, 0), items: state.depenses },
        ...state.depensesHistorique
      ].slice(0, 12);
    }
    state.depenses = [];
    state.depensesMoisCourant = nowKey;
    return true;
  }

  return {
    CATEGORIES, REV_CATEGORIES, DEP_CATEGORIES, DEFAULT_RATES, MAX_RATE, ROUND_UP_OPTIONS,
    uid, num, clamp, monthKey, readRate, exampleState, load, archiveMonth
  };
});
