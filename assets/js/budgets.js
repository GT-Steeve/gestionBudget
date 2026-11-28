/* ==========================================================================
   Gestion budget — budgets (plusieurs budgets indépendants sur le même appareil)
   Chaque budget garde ses données sous sa propre clé localStorage : changer de
   budget ne mélange ni n'efface rien. Le budget « principal » réutilise la clé
   historique, pour que les données saisies avant les budgets restent en place.
   Inclus par toutes les pages, avant nav.js et script.js.
   ========================================================================== */
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  if (root && root.document) {
    let storage = null;
    try { storage = root.localStorage; } catch { /* stockage indisponible */ }
    root.Budgets = factory(storage);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (storage) {
  const BASE_KEY = 'gestion-epargne-v1';
  const REGISTRY_KEY = 'gestion-epargne-profils';
  const MAIN_ID = 'principal';
  const MAX_NAME = 40;
  // Marque des données exportées (fichier .gbudget de la page Sauvegarder, ou
  // .docx / PDF « Rapport + données » des anciennes versions) : seul un
  // fichier qui la porte peut être importé. Ce n'est pas une signature (tout
  // le code est public) ; les valeurs importées sont de toute façon nettoyées
  // une à une par script.js (loadState) avant d'être affichées.
  const EXPORT_APP = 'gestion-budget';
  const EXPORT_FORMAT = 1;
  const BUDGET_EXT = 'gbudget';
  // Type JSON plutôt qu'un type inventé : mieux pris en charge au téléchargement
  // et dans les sélecteurs de fichiers mobiles (l'extension .gbudget reste).
  const BUDGET_MIME = 'application/json';
  const STATE_KEYS = ['revenus', 'charges', 'depenses', 'depensesHistorique', 'produits', 'habitudes',
    'suggestionsMasquees', 'depensesMoisCourant', 'scenarios', 'appliquees', 'cashbackRate', 'roundUpTo', 'view', 'yield'];
  const MAX_ITEMS = 5000;
  // Avancement du guide (page Guide) : étape en cours, ou « fini » une fois le
  // guide suivi, quitté ou remplacé par un budget simulé.
  const GUIDE_STEPS = ['revenus', 'charges', 'depenses', 'economie', 'placement', 'fini'];

  /** Repli en mémoire si localStorage est indisponible (navigation privée stricte…). */
  const memory = new Map();
  const raw = {
    get(key) {
      try { return storage ? storage.getItem(key) : (memory.has(key) ? memory.get(key) : null); } catch { return null; }
    },
    set(key, value) {
      try { if (storage) storage.setItem(key, value); else memory.set(key, value); } catch { /* stockage indisponible */ }
    },
    remove(key) {
      try { if (storage) storage.removeItem(key); else memory.delete(key); } catch { /* stockage indisponible */ }
    }
  };
  const readJson = (key) => { try { return JSON.parse(raw.get(key)); } catch { return null; } };

  const cleanName = (nom) => String(nom || '').trim().slice(0, MAX_NAME) || 'Sans nom';
  /** Identifiant de budget inédit dans le registre (et jamais vide). */
  const newId = (reg) => {
    let id;
    do id = Math.random().toString(36).slice(2, 9).padEnd(7, '0');
    while (id === MAIN_ID || reg.budgets.some((p) => p.id === id));
    return id;
  };

  /** Données d'un budget vide, au format lu par script.js (loadState) : sans
      elles, un budget sans données s'ouvrirait sur l'exemple pré-rempli. */
  const emptyState = () => ({
    revenus: [], charges: [], depenses: [], depensesHistorique: [], scenarios: [], appliquees: [],
    cashbackRate: 1, roundUpTo: 1, view: 'mois',
    yield: { capital: 0, versement: 0, annees: 10, taux1: 2, taux2: 10, anneeGain: 1 }
  });

  // Le registre enregistré garde ses noms d'avant le passage « profil » →
  // « budget » (clé REGISTRY_KEY, champ « profils ») : les budgets déjà
  // créés sur l'appareil sont retrouvés tels quels.
  function readRegistry() {
    const saved = readJson(REGISTRY_KEY);
    const budgets = (saved && Array.isArray(saved.profils) ? saved.profils : [])
      .filter((p) => p && typeof p.id === 'string' && /^[\w-]{1,20}$/.test(p.id))
      .map((p) => ({
        id: p.id, nom: cleanName(p.nom), exemple: p.exemple === true,
        ...(p.masque === true ? { masque: true } : {}),
        ...(p.preRempli === true ? { preRempli: true } : {}),
        ...(GUIDE_STEPS.includes(p.guide) ? { guide: p.guide } : {})
      }));
    if (!budgets.length) budgets.push({ id: MAIN_ID, nom: 'Mon budget', exemple: false });
    const active = budgets.some((p) => p.id === saved?.active) ? saved.active : budgets[0].id;
    // Budget à retrouver en fermant l'exemple.
    const retour = budgets.some((p) => p.id === saved?.retour && !p.exemple) ? saved.retour : null;
    return { active, retour, budgets };
  }

  const writeRegistry = ({ active, retour, budgets }) =>
    raw.set(REGISTRY_KEY, JSON.stringify({ active, retour, profils: budgets }));

  const dataKey = (id = readRegistry().active) => (id === MAIN_ID ? BASE_KEY : `${BASE_KEY}:${id}`);

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  /** Données d'un fichier importé, réduites aux champs connus, ou null si le
      fichier ne vient pas de l'application (marque, format, structure). */
  function readExport(payload) {
    if (!isObject(payload) || payload.app !== EXPORT_APP || payload.format !== EXPORT_FORMAT) return null;
    const data = payload.data;
    // Mêmes conditions que script.js (loadState) pour ne pas retomber sur l'exemple.
    if (!isObject(data) || !Array.isArray(data.charges) || !Array.isArray(data.scenarios) || !isObject(data.yield)) return null;
    const lists = ['revenus', 'charges', 'depenses', 'depensesHistorique', 'produits', 'habitudes', 'scenarios',
      'appliquees'];
    if (lists.some((k) => data[k] !== undefined && (!Array.isArray(data[k]) || data[k].length > MAX_ITEMS))) return null;
    return Object.fromEntries(STATE_KEYS.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));
  }

  return {
    MAIN_ID,
    MAX_NAME,
    dataKey,
    list: () => readRegistry().budgets,
    activeId: () => readRegistry().active,
    active() {
      const reg = readRegistry();
      return reg.budgets.find((p) => p.id === reg.active);
    },
    setActive(id) {
      const reg = readRegistry();
      if (!reg.budgets.some((p) => p.id === id)) return false;
      reg.active = id;
      writeRegistry(reg);
      return true;
    },
    /** Crée un budget vide, ou pré-rempli avec l'exemple si preRempli = true
        (marqué, sans données : script.js charge l'exemple à sa première ouverture). */
    create(nom, { preRempli = false } = {}) {
      const reg = readRegistry();
      const budget = { id: newId(reg), nom: cleanName(nom), exemple: false, ...(preRempli ? { preRempli: true } : {}) };
      reg.budgets.push(budget);
      writeRegistry(reg);
      if (!preRempli) raw.set(dataKey(budget.id), JSON.stringify(emptyState()));
      return budget;
    },
    /** Données du budget actif, marquées pour l'export. */
    exportData(data) {
      const reg = readRegistry();
      const nom = reg.budgets.find((p) => p.id === reg.active).nom;
      return { app: EXPORT_APP, format: EXPORT_FORMAT, nom, exporte: new Date().toISOString(), data };
    },
    /** Extension du fichier de sauvegarde d'un budget (page Sauvegarder → page
        Budget d'un autre appareil) : un fichier propre à l'application, qui ne
        sert qu'à la recharger, contrairement aux rapports PDF / Word. */
    BUDGET_EXT,
    /** Fichier de sauvegarde du budget actif : { name, text, mime }. */
    budgetFile(data, now = new Date()) {
      const payload = this.exportData(data);
      const slug = payload.nom.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'budget';
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      return { name: `gestion-budget-${slug}-${day}.${BUDGET_EXT}`, text: JSON.stringify(payload), mime: BUDGET_MIME };
    },
    /** Contenu d'un fichier de sauvegarde (texte), ou null s'il n'est pas lisible. */
    readBudgetFile(text) {
      try { return JSON.parse(text); } catch { return null; }
    },
    /** Totaux mensuels d'un budget (page Paramètres), ou null s'il n'a pas encore de
        données (budget pré-rempli jamais ouvert). Mêmes calculs que la Synthèse :
        solde = revenus − charges ; dépenses du mois en cours seulement (celles
        d'un mois passé seront archivées à la prochaine ouverture du budget). */
    summary(id, now = new Date()) {
      const data = readJson(dataKey(id));
      if (!isObject(data)) return null;
      const sum = (list, key) => (Array.isArray(list) ? list : [])
        .reduce((total, x) => total + (Number.isFinite(Number(x?.[key])) ? Number(x[key]) : 0), 0);
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const revenus = sum(data.revenus, 'mensuel');
      const charges = sum(data.charges, 'mensuel');
      const depenses = data.depensesMoisCourant === month ? sum(data.depenses, 'montant') : 0;
      return { revenus, charges, depenses, solde: revenus - charges };
    },
    /** Un budget porte-t-il déjà ce nom (espaces et majuscules ignorés) ? */
    nameExists(nom) {
      const wanted = cleanName(nom).toLocaleLowerCase('fr');
      return readRegistry().budgets.some((p) => p.nom.toLocaleLowerCase('fr') === wanted);
    },
    /** Nom du budget d'un fichier exporté, ou null s'il n'est pas importable. */
    exportName: (payload) => (readExport(payload) ? cleanName(payload.nom) : null),
    /** Crée un budget à partir d'un fichier exporté ; null s'il est refusé. */
    importBudget(payload, nom) {
      const data = readExport(payload);
      if (!data) return null;
      const reg = readRegistry();
      const budget = { id: newId(reg), nom: cleanName(nom || payload.nom), exemple: false };
      reg.budgets.push(budget);
      writeRegistry(reg);
      raw.set(dataKey(budget.id), JSON.stringify(data));
      return budget;
    },
    /** Active le budget d'exemple (créé au besoin), en retenant le budget en
        cours pour y revenir à la fermeture. */
    openExample() {
      const reg = readRegistry();
      let exemple = reg.budgets.find((p) => p.exemple);
      if (!exemple) {
        exemple = { id: newId(reg), nom: 'Exemple', exemple: true };
        reg.budgets.push(exemple);
      }
      if (reg.active !== exemple.id) reg.retour = reg.active;
      reg.active = exemple.id;
      writeRegistry(reg);
      return exemple;
    },
    /** Quitte l'exemple : le budget d'exemple est supprimé avec ses données
        (il sera recréé à l'identique à la prochaine ouverture) et le budget
        d'avant redevient actif. */
    closeExample() {
      const reg = readRegistry();
      const exemple = reg.budgets.find((p) => p.exemple);
      if (!exemple) return false;
      reg.budgets = reg.budgets.filter((p) => !p.exemple);
      // L'exemple ne doit jamais être le seul budget restant.
      if (!reg.budgets.length) reg.budgets.push({ id: MAIN_ID, nom: 'Mon budget', exemple: false });
      if (reg.active === exemple.id) reg.active = reg.retour || reg.budgets[0].id;
      reg.retour = null;
      writeRegistry(reg);
      raw.remove(dataKey(exemple.id));
      return true;
    },
    /** Le budget a-t-il au moins une ligne (revenu, charge, dépense, mois archivé, comparaison) ? */
    hasData(id) {
      const data = readJson(dataKey(id));
      return isObject(data) && ['revenus', 'charges', 'depenses', 'depensesHistorique', 'scenarios']
        .some((k) => Array.isArray(data[k]) && data[k].length > 0);
    },
    /** Avancement du guide d'un budget : une étape de GUIDE_STEPS, ou null pour l'effacer. */
    setGuide(id, step) {
      const reg = readRegistry();
      const budget = reg.budgets.find((p) => p.id === id);
      if (!budget || (step !== null && !GUIDE_STEPS.includes(step))) return false;
      if (step) budget.guide = step; else delete budget.guide;
      writeRegistry(reg);
      return true;
    },
    /** Masque ou affiche les montants d'un budget dans la liste (page Paramètres). */
    setMasked(id, masque) {
      const reg = readRegistry();
      const budget = reg.budgets.find((p) => p.id === id);
      if (!budget) return false;
      if (masque) budget.masque = true; else delete budget.masque;
      writeRegistry(reg);
      return true;
    },
    rename(id, nom) {
      const reg = readRegistry();
      const budget = reg.budgets.find((p) => p.id === id);
      if (!budget) return false;
      budget.nom = cleanName(nom);
      writeRegistry(reg);
      return true;
    },
    /** Supprime un budget et ses données. Le dernier budget ne peut pas l'être. */
    remove(id) {
      const reg = readRegistry();
      if (reg.budgets.length < 2 || !reg.budgets.some((p) => p.id === id)) return false;
      reg.budgets = reg.budgets.filter((p) => p.id !== id);
      if (reg.active === id) reg.active = reg.budgets[0].id;
      writeRegistry(reg);
      raw.remove(dataKey(id));
      return true;
    }
  };
});
