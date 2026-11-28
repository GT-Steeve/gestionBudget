import { describe, it, expect, beforeEach, vi } from 'vitest';
const createBudgets = require('./budgets.js');

/** localStorage minimal en mémoire. */
const fakeStorage = () => {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k)
  };
};

describe('Budgets', () => {
  let storage;
  let Budgets;
  beforeEach(() => {
    storage = fakeStorage();
    Budgets = createBudgets(storage);
  });

  it('starts with the main budget on the historical storage key', () => {
    expect(Budgets.list()).toEqual([{ id: 'principal', nom: 'Mon budget', exemple: false }]);
    expect(Budgets.dataKey()).toBe('gestion-epargne-v1');
  });

  it('keeps each budget data under its own key', () => {
    storage.setItem('gestion-epargne-v1', '{"mine":true}');
    const other = Budgets.create('Marie');
    expect(Budgets.setActive(other.id)).toBe(true);
    expect(Budgets.dataKey()).toBe(`gestion-epargne-v1:${other.id}`);
    expect(JSON.parse(storage.getItem(Budgets.dataKey())).charges).toEqual([]);
    expect(storage.getItem('gestion-epargne-v1')).toBe('{"mine":true}');
  });

  it('leaves a pre-filled budget without data so the example is loaded', () => {
    const p = Budgets.create('Marie', { preRempli: true });
    expect(p.exemple).toBe(false);
    expect(storage.getItem(Budgets.dataKey(p.id))).toBeNull();
  });

  it('opens the example, then closes it back to the previous budget', () => {
    const other = Budgets.create('Marie');
    Budgets.setActive(other.id);
    const ex = Budgets.openExample();
    expect(Budgets.active()).toEqual({ id: ex.id, nom: 'Exemple', exemple: true });
    expect(Budgets.openExample().id).toBe(ex.id);
    storage.setItem(Budgets.dataKey(ex.id), '{}');
    expect(Budgets.closeExample()).toBe(true);
    expect(storage.getItem(Budgets.dataKey(ex.id))).toBeNull();
    expect(Budgets.activeId()).toBe(other.id);
    expect(Budgets.list().some((p) => p.exemple)).toBe(false);
  });

  it('removes a budget and its data, but never the last one', () => {
    const other = Budgets.create('Marie');
    Budgets.setActive(other.id);
    expect(Budgets.remove(other.id)).toBe(true);
    expect(storage.getItem(`gestion-epargne-v1:${other.id}`)).toBeNull();
    expect(Budgets.activeId()).toBe('principal');
    expect(Budgets.remove('principal')).toBe(false);
  });

  it('imports an exported budget under a new key, keeping only known fields', () => {
    const data = { charges: [{ nom: 'Loyer', mensuel: 900 }], scenarios: [], yield: { capital: 0 }, intrus: '<script>' };
    const payload = Budgets.exportData(data);
    expect(payload).toMatchObject({ app: 'gestion-budget', format: 1, nom: 'Mon budget' });
    expect(Budgets.exportName(payload)).toBe('Mon budget');
    const p = Budgets.importBudget(payload, '  Copie  ');
    expect(p.nom).toBe('Copie');
    expect(JSON.parse(storage.getItem(Budgets.dataKey(p.id)))).toEqual({
      charges: [{ nom: 'Loyer', mensuel: 900 }], scenarios: [], yield: { capital: 0 }
    });
    expect(Budgets.importBudget(payload).nom).toBe('Mon budget');
  });

  it('saves the active budget to a .gbudget file that imports back', () => {
    const data = { charges: [{ nom: 'Loyer', mensuel: 900 }], scenarios: [], yield: { capital: 0 } };
    Budgets.rename('principal', 'Budget Élodie & Co');
    const file = Budgets.budgetFile(data, new Date(2026, 10, 4));
    expect(file.name).toBe('gestion-budget-budget-elodie-co-2026-11-04.gbudget');
    const payload = Budgets.readBudgetFile(file.text);
    expect(Budgets.exportName(payload)).toBe('Budget Élodie & Co');
    const p = Budgets.importBudget(payload, 'Copie');
    expect(JSON.parse(storage.getItem(Budgets.dataKey(p.id)))).toEqual(data);
    expect(Budgets.readBudgetFile('pas du json')).toBeNull();
  });

  it('refuses files that do not come from the application', () => {
    const data = { charges: [], scenarios: [], yield: {} };
    const refused = [
      null, data, { app: 'autre', format: 1, data }, { app: 'gestion-budget', format: 2, data },
      { app: 'gestion-budget', format: 1, data: { charges: [], scenarios: [] } },
      { app: 'gestion-budget', format: 1, data: { ...data, depenses: 'x' } }
    ];
    for (const payload of refused) {
      expect(Budgets.exportName(payload)).toBeNull();
      expect(Budgets.importBudget(payload, 'X')).toBeNull();
    }
    expect(Budgets.list()).toHaveLength(1);
  });

  it('sums monthly totals, counting only this month expenses', () => {
    const now = new Date(2026, 9, 28);
    storage.setItem('gestion-epargne-v1', JSON.stringify({
      revenus: [{ mensuel: 2000 }, { mensuel: 150 }], charges: [{ mensuel: 900 }, { mensuel: 'x' }],
      depenses: [{ montant: 12.5 }, { montant: 7.5 }], depensesMoisCourant: '2026-10'
    }));
    expect(Budgets.summary('principal', now)).toEqual({ revenus: 2150, charges: 900, depenses: 20, solde: 1250 });
    expect(Budgets.summary('principal', new Date(2026, 10, 2)).depenses).toBe(0);
    expect(Budgets.summary(Budgets.create('Marie', { preRempli: true }).id)).toBeNull();
  });

  it('detects a name already taken, ignoring case and spaces', () => {
    expect(Budgets.nameExists('  mon BUDGET ')).toBe(true);
    expect(Budgets.nameExists('Marie')).toBe(false);
  });

  it('renames with a trimmed, non-empty name', () => {
    Budgets.rename('principal', '   ');
    expect(Budgets.active().nom).toBe('Sans nom');
    Budgets.rename('principal', '  Moi  ');
    expect(Budgets.active().nom).toBe('Moi');
  });

  it('keeps masked amounts in the registry, removed with the budget', () => {
    const marie = Budgets.create('Marie');
    expect(Budgets.setMasked(marie.id, true)).toBe(true);
    expect(Budgets.list().find((p) => p.id === marie.id).masque).toBe(true);
    Budgets.setMasked(marie.id, false);
    expect(Budgets.list().find((p) => p.id === marie.id)).not.toHaveProperty('masque');
    Budgets.setMasked(marie.id, true);
    Budgets.remove(marie.id);
    expect(storage.getItem('gestion-epargne-profils')).not.toContain(marie.id);
    expect(Budgets.setMasked('inconnu', true)).toBe(false);
  });

  it('marks pre-filled budgets and tells whether a budget has data', () => {
    const vide = Budgets.create('Vide');
    const plein = Budgets.create('Plein', { preRempli: true });
    expect(vide).not.toHaveProperty('preRempli');
    expect(Budgets.list().find((p) => p.id === plein.id).preRempli).toBe(true);
    expect(Budgets.hasData(vide.id)).toBe(false);
    expect(Budgets.hasData(plein.id)).toBe(false);
    storage.setItem(Budgets.dataKey(vide.id), JSON.stringify({ revenus: [{ mensuel: 1 }], charges: [], scenarios: [] }));
    expect(Budgets.hasData(vide.id)).toBe(true);
  });

  it('stores the guide progress per budget', () => {
    expect(Budgets.active()).not.toHaveProperty('guide');
    expect(Budgets.setGuide('principal', 'charges')).toBe(true);
    expect(Budgets.active().guide).toBe('charges');
    expect(Budgets.setGuide('principal', 'inconnue')).toBe(false);
    expect(Budgets.active().guide).toBe('charges');
    Budgets.setGuide('principal', null);
    expect(Budgets.active()).not.toHaveProperty('guide');
  });

  it('never reuses an existing id, nor an empty one', () => {
    // Math.random renvoie deux fois la même valeur, puis 0 (identifiant vide sans padEnd).
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.5).mockReturnValueOnce(0);
    const a = Budgets.create('A');
    const b = Budgets.create('B');
    random.mockRestore();
    expect(a.id).not.toBe(b.id);
    expect(b.id).toMatch(/^[\w-]{1,20}$/);
    expect(Budgets.list().map((p) => p.id)).toContain(b.id);
  });
});
