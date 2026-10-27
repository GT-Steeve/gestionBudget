import { describe, it, expect, beforeEach } from 'vitest';
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

  it('renames with a trimmed, non-empty name', () => {
    Profiles.rename('principal', '   ');
    expect(Profiles.active().nom).toBe('Sans nom');
    Profiles.rename('principal', '  Moi  ');
    expect(Profiles.active().nom).toBe('Moi');
  });
});
