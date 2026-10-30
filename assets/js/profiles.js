/* ==========================================================================
   Gestion budget — profils (plusieurs budgets indépendants sur le même appareil)
   Chaque profil garde ses données sous sa propre clé localStorage : changer de
   profil ne mélange ni n'efface rien. Le profil « principal » réutilise la clé
   historique, pour que les données saisies avant les profils restent en place.
   Inclus par toutes les pages, avant nav.js et script.js.
   ========================================================================== */
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  if (root && root.document) {
    let storage = null;
    try { storage = root.localStorage; } catch { /* stockage indisponible */ }
    root.Profiles = factory(storage);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (storage) {
  const BASE_KEY = 'gestion-epargne-v1';
  const REGISTRY_KEY = 'gestion-epargne-profils';
  const MAIN_ID = 'principal';
  const MAX_NAME = 40;
  // Marque des données exportées (fichier .docx de la page Exporter) : seul un
  // fichier qui la porte peut être importé. Ce n'est pas une signature (tout
  // le code est public) ; les valeurs importées sont de toute façon nettoyées
  // une à une par script.js (loadState) avant d'être affichées.
  const EXPORT_APP = 'gestion-budget';
  const EXPORT_FORMAT = 1;
  const STATE_KEYS = ['revenus', 'charges', 'depenses', 'depensesHistorique', 'depensesMoisCourant',
    'scenarios', 'cashbackRate', 'roundUpTo', 'view', 'yield'];
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
  /** Identifiant de profil inédit dans le registre (et jamais vide). */
  const newId = (reg) => {
    let id;
    do id = Math.random().toString(36).slice(2, 9).padEnd(7, '0');
    while (id === MAIN_ID || reg.profils.some((p) => p.id === id));
    return id;
  };

  /** Données d'un profil vide, au format lu par script.js (loadState) : sans
      elles, un profil sans données s'ouvrirait sur l'exemple pré-rempli. */
  const emptyState = () => ({
    revenus: [], charges: [], depenses: [], depensesHistorique: [], scenarios: [],
    cashbackRate: 1, roundUpTo: 1, view: 'mois',
    yield: { capital: 0, versement: 0, annees: 10, taux1: 2, taux2: 10, anneeGain: 1 }
  });

  function readRegistry() {
    const saved = readJson(REGISTRY_KEY);
    const profils = (saved && Array.isArray(saved.profils) ? saved.profils : [])
      .filter((p) => p && typeof p.id === 'string' && /^[\w-]{1,20}$/.test(p.id))
      .map((p) => ({
        id: p.id, nom: cleanName(p.nom), exemple: p.exemple === true,
        ...(p.masque === true ? { masque: true } : {}),
        ...(p.preRempli === true ? { preRempli: true } : {}),
        ...(GUIDE_STEPS.includes(p.guide) ? { guide: p.guide } : {})
      }));
    if (!profils.length) profils.push({ id: MAIN_ID, nom: 'Mon budget', exemple: false });
    const active = profils.some((p) => p.id === saved?.active) ? saved.active : profils[0].id;
    // Profil à retrouver en fermant l'exemple.
    const retour = profils.some((p) => p.id === saved?.retour && !p.exemple) ? saved.retour : null;
    return { active, retour, profils };
  }

  const writeRegistry = (reg) => raw.set(REGISTRY_KEY, JSON.stringify(reg));

  const dataKey = (id = readRegistry().active) => (id === MAIN_ID ? BASE_KEY : `${BASE_KEY}:${id}`);

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  /** Données d'un fichier importé, réduites aux champs connus, ou null si le
      fichier ne vient pas de l'application (marque, format, structure). */
  function readExport(payload) {
    if (!isObject(payload) || payload.app !== EXPORT_APP || payload.format !== EXPORT_FORMAT) return null;
    const data = payload.data;
    // Mêmes conditions que script.js (loadState) pour ne pas retomber sur l'exemple.
    if (!isObject(data) || !Array.isArray(data.charges) || !Array.isArray(data.scenarios) || !isObject(data.yield)) return null;
    const lists = ['revenus', 'charges', 'depenses', 'depensesHistorique', 'scenarios'];
    if (lists.some((k) => data[k] !== undefined && (!Array.isArray(data[k]) || data[k].length > MAX_ITEMS))) return null;
    return Object.fromEntries(STATE_KEYS.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));
  }

  return {
    MAIN_ID,
    MAX_NAME,
    dataKey,
    list: () => readRegistry().profils,
    activeId: () => readRegistry().active,
    active() {
      const reg = readRegistry();
      return reg.profils.find((p) => p.id === reg.active);
    },
    setActive(id) {
      const reg = readRegistry();
      if (!reg.profils.some((p) => p.id === id)) return false;
      reg.active = id;
      writeRegistry(reg);
      return true;
    },
    /** Crée un profil vide, ou pré-rempli avec l'exemple si preRempli = true
        (marqué, sans données : script.js charge l'exemple à sa première ouverture). */
    create(nom, { preRempli = false } = {}) {
      const reg = readRegistry();
      const profil = { id: newId(reg), nom: cleanName(nom), exemple: false, ...(preRempli ? { preRempli: true } : {}) };
      reg.profils.push(profil);
      writeRegistry(reg);
      if (!preRempli) raw.set(dataKey(profil.id), JSON.stringify(emptyState()));
      return profil;
    },
    /** Données du profil actif, marquées pour l'export (embarquées dans le .docx). */
    exportData(data) {
      const reg = readRegistry();
      const nom = reg.profils.find((p) => p.id === reg.active).nom;
      return { app: EXPORT_APP, format: EXPORT_FORMAT, nom, exporte: new Date().toISOString(), data };
    },
    /** Totaux mensuels d'un profil (page Profil), ou null s'il n'a pas encore de
        données (profil pré-rempli jamais ouvert). Mêmes calculs que la Synthèse :
        solde = revenus − charges ; dépenses du mois en cours seulement (celles
        d'un mois passé seront archivées à la prochaine ouverture du profil). */
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
    /** Un profil porte-t-il déjà ce nom (espaces et majuscules ignorés) ? */
    nameExists(nom) {
      const wanted = cleanName(nom).toLocaleLowerCase('fr');
      return readRegistry().profils.some((p) => p.nom.toLocaleLowerCase('fr') === wanted);
    },
    /** Nom du profil d'un fichier exporté, ou null s'il n'est pas importable. */
    exportName: (payload) => (readExport(payload) ? cleanName(payload.nom) : null),
    /** Crée un profil à partir d'un fichier exporté ; null s'il est refusé. */
    importProfile(payload, nom) {
      const data = readExport(payload);
      if (!data) return null;
      const reg = readRegistry();
      const profil = { id: newId(reg), nom: cleanName(nom || payload.nom), exemple: false };
      reg.profils.push(profil);
      writeRegistry(reg);
      raw.set(dataKey(profil.id), JSON.stringify(data));
      return profil;
    },
    /** Active le profil d'exemple (créé au besoin), en retenant le profil en
        cours pour y revenir à la fermeture. */
    openExample() {
      const reg = readRegistry();
      let exemple = reg.profils.find((p) => p.exemple);
      if (!exemple) {
        exemple = { id: newId(reg), nom: 'Exemple', exemple: true };
        reg.profils.push(exemple);
      }
      if (reg.active !== exemple.id) reg.retour = reg.active;
      reg.active = exemple.id;
      writeRegistry(reg);
      return exemple;
    },
    /** Quitte l'exemple : le profil d'exemple est supprimé avec ses données
        (il sera recréé à l'identique à la prochaine ouverture) et le profil
        d'avant redevient actif. */
    closeExample() {
      const reg = readRegistry();
      const exemple = reg.profils.find((p) => p.exemple);
      if (!exemple) return false;
      reg.profils = reg.profils.filter((p) => !p.exemple);
      // L'exemple ne doit jamais être le seul profil restant.
      if (!reg.profils.length) reg.profils.push({ id: MAIN_ID, nom: 'Mon budget', exemple: false });
      if (reg.active === exemple.id) reg.active = reg.retour || reg.profils[0].id;
      reg.retour = null;
      writeRegistry(reg);
      raw.remove(dataKey(exemple.id));
      return true;
    },
    /** Le profil a-t-il au moins une ligne (revenu, charge, dépense, mois archivé, comparaison) ? */
    hasData(id) {
      const data = readJson(dataKey(id));
      return isObject(data) && ['revenus', 'charges', 'depenses', 'depensesHistorique', 'scenarios']
        .some((k) => Array.isArray(data[k]) && data[k].length > 0);
    },
    /** Avancement du guide d'un profil : une étape de GUIDE_STEPS, ou null pour l'effacer. */
    setGuide(id, step) {
      const reg = readRegistry();
      const profil = reg.profils.find((p) => p.id === id);
      if (!profil || (step !== null && !GUIDE_STEPS.includes(step))) return false;
      if (step) profil.guide = step; else delete profil.guide;
      writeRegistry(reg);
      return true;
    },
    /** Masque ou affiche les montants d'un profil dans la liste (page Profil). */
    setMasked(id, masque) {
      const reg = readRegistry();
      const profil = reg.profils.find((p) => p.id === id);
      if (!profil) return false;
      if (masque) profil.masque = true; else delete profil.masque;
      writeRegistry(reg);
      return true;
    },
    rename(id, nom) {
      const reg = readRegistry();
      const profil = reg.profils.find((p) => p.id === id);
      if (!profil) return false;
      profil.nom = cleanName(nom);
      writeRegistry(reg);
      return true;
    },
    /** Supprime un profil et ses données. Le dernier profil ne peut pas l'être. */
    remove(id) {
      const reg = readRegistry();
      if (reg.profils.length < 2 || !reg.profils.some((p) => p.id === id)) return false;
      reg.profils = reg.profils.filter((p) => p.id !== id);
      if (reg.active === id) reg.active = reg.profils[0].id;
      writeRegistry(reg);
      raw.remove(dataKey(id));
      return true;
    }
  };
});
