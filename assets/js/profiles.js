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
  const uid = () => Math.random().toString(36).slice(2, 9);

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
      .map((p) => ({ id: p.id, nom: cleanName(p.nom), exemple: p.exemple === true }));
    if (!profils.length) profils.push({ id: MAIN_ID, nom: 'Mon budget', exemple: false });
    const active = profils.some((p) => p.id === saved?.active) ? saved.active : profils[0].id;
    // Profil à retrouver en fermant l'exemple.
    const retour = profils.some((p) => p.id === saved?.retour && !p.exemple) ? saved.retour : null;
    return { active, retour, profils };
  }

  const writeRegistry = (reg) => raw.set(REGISTRY_KEY, JSON.stringify(reg));

  const dataKey = (id = readRegistry().active) => (id === MAIN_ID ? BASE_KEY : `${BASE_KEY}:${id}`);

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
        (aucune donnée enregistrée : script.js charge alors l'exemple). */
    create(nom, { preRempli = false } = {}) {
      const reg = readRegistry();
      const profil = { id: uid(), nom: cleanName(nom), exemple: false };
      reg.profils.push(profil);
      writeRegistry(reg);
      if (!preRempli) raw.set(dataKey(profil.id), JSON.stringify(emptyState()));
      return profil;
    },
    /** Active le profil d'exemple (créé au besoin), en retenant le profil en
        cours pour y revenir à la fermeture. */
    openExample() {
      const reg = readRegistry();
      let exemple = reg.profils.find((p) => p.exemple);
      if (!exemple) {
        exemple = { id: uid(), nom: 'Exemple', exemple: true };
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
