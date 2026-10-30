import { describe, it, expect } from 'vitest';
const BudgetState = require('./state.js');

const NOW = new Date(2026, 9, 15, 12); // 15 octobre 2026
/** Données enregistrées minimales acceptées par load (sinon : exemple). */
const saved = (extra = {}) => ({ charges: [], scenarios: [], yield: {}, ...extra });

describe('BudgetState.load', () => {
  it('starts from an empty budget when nothing usable is saved', () => {
    for (const bad of [null, {}, { charges: [], scenarios: [] }, saved({ yield: null }), saved({ yield: 'x' }), saved({ charges: 'x' })]) {
      expect(BudgetState.load(bad, NOW)).toEqual(BudgetState.emptyState(NOW));
    }
    const empty = BudgetState.emptyState(NOW);
    expect([empty.revenus, empty.charges, empty.depenses, empty.depensesHistorique, empty.scenarios].every((l) => l.length === 0)).toBe(true);
    expect(empty.depensesMoisCourant).toBe('2026-10');
    // Le budget vide relu tel quel reste identique (rien ne change au rechargement).
    expect(BudgetState.load(JSON.parse(JSON.stringify(empty)), NOW)).toEqual(empty);
  });

  it('ignores list items that are not objects', () => {
    const state = BudgetState.load(saved({
      charges: [null, 3, 'x', [], { nom: 'Loyer', categorie: 'Loyer', mensuel: 800 }],
      revenus: [null],
      depenses: [false, { nom: 'Pain', montant: 2 }],
      depensesHistorique: [null, { mois: '2026-09', items: [null, { nom: 'Café', montant: 3 }] }],
      scenarios: [null]
    }), NOW);
    expect(state.charges).toHaveLength(1);
    expect(state.revenus).toHaveLength(0);
    expect(state.depenses).toHaveLength(1);
    expect(state.depensesHistorique).toHaveLength(1);
    expect(state.depensesHistorique[0].items).toHaveLength(1);
  });

  it('cleans every field', () => {
    const state = BudgetState.load(saved({
      charges: [{ id: 'c1', categorie: 'Inconnue', nom: 'x'.repeat(100), mensuel: '12,5', cashbackOn: false, ajout: 'pas une date' }],
      depenses: [{ categorie: 'Santé', montant: -4 }],
      depensesMoisCourant: 'octobre',
      cashbackRate: 250,
      roundUpTo: 7,
      view: 'semaine',
      yield: { annees: 80, anneeGain: 99, taux1: '', taux2: 500, capital: 'abc' }
    }), NOW);
    const [c] = state.charges;
    expect(c).toMatchObject({ id: 'c1', categorie: 'Autre', mensuel: 12.5, cashbackOn: false, roundUpOn: true, ajout: null });
    expect(c.nom).toHaveLength(60);
    expect(state.depenses[0]).toMatchObject({ categorie: 'Santé', nom: 'Sans nom', montant: 0 });
    expect(state.depenses[0].id).toMatch(/^\w+$/);
    expect(state.depensesMoisCourant).toBe('2026-10');
    expect(state.cashbackRate).toBe(BudgetState.MAX_RATE);
    expect(state.roundUpTo).toBe(1);
    expect(state.view).toBe('mois');
    expect(state.yield).toEqual({ capital: 0, versement: 0, annees: 50, taux1: 2, taux2: 100, anneeGain: 50 });
  });

  it('drops comparisons whose charge no longer exists and keeps 12 archived months', () => {
    const state = BudgetState.load(saved({
      charges: [{ id: 'c1', nom: 'Box', mensuel: 40 }],
      scenarios: [{ id: 's1', chargeId: 'c1', nouveau: 20 }, { id: 's2', chargeId: 'disparue', nouveau: 5 }],
      depensesHistorique: Array.from({ length: 15 }, (_, i) => ({ mois: `2025-${String((i % 12) + 1).padStart(2, '0')}` }))
    }), NOW);
    expect(state.scenarios.map((x) => x.id)).toEqual(['s1']);
    expect(state.depensesHistorique).toHaveLength(12);
  });
});

describe('BudgetState.archiveMonth', () => {
  const base = () => BudgetState.load(saved({
    depenses: [{ nom: 'Pain', montant: 2 }, { nom: 'Café', montant: 3.5 }],
    depensesMoisCourant: '2026-09'
  }), NOW);

  it('archives last month expenses when the month changes', () => {
    const state = base();
    expect(BudgetState.archiveMonth(state, NOW)).toBe(true);
    expect(state.depenses).toEqual([]);
    expect(state.depensesMoisCourant).toBe('2026-10');
    expect(state.depensesHistorique[0]).toMatchObject({ mois: '2026-09', total: 5.5 });
    expect(state.depensesHistorique[0].items).toHaveLength(2);
  });

  it('does nothing within the same month, and archives nothing when there was no expense', () => {
    const state = base();
    state.depensesMoisCourant = '2026-10';
    expect(BudgetState.archiveMonth(state, NOW)).toBe(false);
    expect(state.depenses).toHaveLength(2);

    const empty = BudgetState.load(saved({ depensesMoisCourant: '2026-09' }), NOW);
    expect(BudgetState.archiveMonth(empty, NOW)).toBe(true);
    expect(empty.depensesHistorique).toEqual([]);
  });

  it('keeps at most 12 archived months', () => {
    const state = base();
    state.depensesHistorique = Array.from({ length: 12 }, (_, i) => ({ mois: `2025-${String(i + 1).padStart(2, '0')}`, total: 0, items: [] }));
    BudgetState.archiveMonth(state, NOW);
    expect(state.depensesHistorique).toHaveLength(12);
    expect(state.depensesHistorique[0].mois).toBe('2026-09');
  });
});

describe('BudgetState.exampleState', () => {
  it('only dates current-month expenses up to today', () => {
    const early = new Date(2026, 9, 3, 12);
    const state = BudgetState.exampleState(early);
    expect(state.depensesMoisCourant).toBe('2026-10');
    for (const d of state.depenses) expect(new Date(d.ajout).getDate()).toBeLessThanOrEqual(3);
    expect(state.depensesHistorique.map((m) => m.mois)).toEqual(['2026-09', '2026-08']);
  });

  it('links each comparison to an existing charge', () => {
    const state = BudgetState.exampleState(NOW);
    for (const sc of state.scenarios) expect(state.charges.some((c) => c.id === sc.chargeId)).toBe(true);
  });
});
