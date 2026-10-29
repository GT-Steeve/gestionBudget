import { describe, it, expect, beforeEach, vi } from 'vitest';
const createProfiles = require('./profiles.js');

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

describe('Profiles', () => {
  let storage;
  let Profiles;
  beforeEach(() => {
    storage = fakeStorage();
    Profiles = createProfiles(storage);
  });

  it('starts with the main profile on the historical storage key', () => {
    expect(Profiles.list()).toEqual([{ id: 'principal', nom: 'Mon budget', exemple: false }]);
    expect(Profiles.dataKey()).toBe('gestion-epargne-v1');
  });

  it('keeps each profile data under its own key', () => {
    storage.setItem('gestion-epargne-v1', '{"mine":true}');
    const other = Profiles.create('Marie');
    expect(Profiles.setActive(other.id)).toBe(true);
    expect(Profiles.dataKey()).toBe(`gestion-epargne-v1:${other.id}`);
    expect(JSON.parse(storage.getItem(Profiles.dataKey())).charges).toEqual([]);
    expect(storage.getItem('gestion-epargne-v1')).toBe('{"mine":true}');
  });

  it('leaves a pre-filled profile without data so the example is loaded', () => {
    const p = Profiles.create('Marie', { preRempli: true });
    expect(p.exemple).toBe(false);
    expect(storage.getItem(Profiles.dataKey(p.id))).toBeNull();
  });

  it('opens the example, then closes it back to the previous profile', () => {
    const other = Profiles.create('Marie');
    Profiles.setActive(other.id);
    const ex = Profiles.openExample();
    expect(Profiles.active()).toEqual({ id: ex.id, nom: 'Exemple', exemple: true });
    expect(Profiles.openExample().id).toBe(ex.id);
    storage.setItem(Profiles.dataKey(ex.id), '{}');
    expect(Profiles.closeExample()).toBe(true);
    expect(storage.getItem(Profiles.dataKey(ex.id))).toBeNull();
    expect(Profiles.activeId()).toBe(other.id);
    expect(Profiles.list().some((p) => p.exemple)).toBe(false);
  });

  it('removes a profile and its data, but never the last one', () => {
    const other = Profiles.create('Marie');
    Profiles.setActive(other.id);
    expect(Profiles.remove(other.id)).toBe(true);
    expect(storage.getItem(`gestion-epargne-v1:${other.id}`)).toBeNull();
    expect(Profiles.activeId()).toBe('principal');
    expect(Profiles.remove('principal')).toBe(false);
  });

  it('imports an exported profile under a new key, keeping only known fields', () => {
    const data = { charges: [{ nom: 'Loyer', mensuel: 900 }], scenarios: [], yield: { capital: 0 }, intrus: '<script>' };
    const payload = Profiles.exportData(data);
    expect(payload).toMatchObject({ app: 'gestion-budget', format: 1, nom: 'Mon budget' });
    expect(Profiles.exportName(payload)).toBe('Mon budget');
    const p = Profiles.importProfile(payload, '  Copie  ');
    expect(p.nom).toBe('Copie');
    expect(JSON.parse(storage.getItem(Profiles.dataKey(p.id)))).toEqual({
      charges: [{ nom: 'Loyer', mensuel: 900 }], scenarios: [], yield: { capital: 0 }
    });
    expect(Profiles.importProfile(payload).nom).toBe('Mon budget');
  });

  it('refuses files that do not come from the application', () => {
    const data = { charges: [], scenarios: [], yield: {} };
    const refused = [
      null, data, { app: 'autre', format: 1, data }, { app: 'gestion-budget', format: 2, data },
      { app: 'gestion-budget', format: 1, data: { charges: [], scenarios: [] } },
      { app: 'gestion-budget', format: 1, data: { ...data, depenses: 'x' } }
    ];
    for (const payload of refused) {
      expect(Profiles.exportName(payload)).toBeNull();
      expect(Profiles.importProfile(payload, 'X')).toBeNull();
    }
    expect(Profiles.list()).toHaveLength(1);
  });

  it('sums monthly totals, counting only this month expenses', () => {
    const now = new Date(2026, 9, 28);
    storage.setItem('gestion-epargne-v1', JSON.stringify({
      revenus: [{ mensuel: 2000 }, { mensuel: 150 }], charges: [{ mensuel: 900 }, { mensuel: 'x' }],
      depenses: [{ montant: 12.5 }, { montant: 7.5 }], depensesMoisCourant: '2026-10'
    }));
    expect(Profiles.summary('principal', now)).toEqual({ revenus: 2150, charges: 900, depenses: 20, solde: 1250 });
    expect(Profiles.summary('principal', new Date(2026, 10, 2)).depenses).toBe(0);
    expect(Profiles.summary(Profiles.create('Marie', { preRempli: true }).id)).toBeNull();
  });

  it('detects a name already taken, ignoring case and spaces', () => {
    expect(Profiles.nameExists('  mon BUDGET ')).toBe(true);
    expect(Profiles.nameExists('Marie')).toBe(false);
  });

  it('renames with a trimmed, non-empty name', () => {
    Profiles.rename('principal', '   ');
    expect(Profiles.active().nom).toBe('Sans nom');
    Profiles.rename('principal', '  Moi  ');
    expect(Profiles.active().nom).toBe('Moi');
  });

  it('keeps masked amounts in the registry, removed with the profile', () => {
    const marie = Profiles.create('Marie');
    expect(Profiles.setMasked(marie.id, true)).toBe(true);
    expect(Profiles.list().find((p) => p.id === marie.id).masque).toBe(true);
    Profiles.setMasked(marie.id, false);
    expect(Profiles.list().find((p) => p.id === marie.id)).not.toHaveProperty('masque');
    Profiles.setMasked(marie.id, true);
    Profiles.remove(marie.id);
    expect(storage.getItem('gestion-epargne-profils')).not.toContain(marie.id);
    expect(Profiles.setMasked('inconnu', true)).toBe(false);
  });

  it('never reuses an existing id, nor an empty one', () => {
    // Math.random renvoie deux fois la même valeur, puis 0 (identifiant vide sans padEnd).
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.5).mockReturnValueOnce(0);
    const a = Profiles.create('A');
    const b = Profiles.create('B');
    random.mockRestore();
    expect(a.id).not.toBe(b.id);
    expect(b.id).toMatch(/^[\w-]{1,20}$/);
    expect(Profiles.list().map((p) => p.id)).toContain(b.id);
  });
});
