import { describe, it, expect } from 'vitest';
const Calc = require('./calc.js');

describe('annual', () => {
  it('multiplies a monthly amount by 12', () => {
    expect(Calc.annual(100)).toBe(1200);
    expect(Calc.annual(0)).toBe(0);
  });
});

describe('project', () => {
  it('keeps the balance unchanged over 0 years', () => {
    const pts = Calc.project(5, 1000, 0, 0);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toEqual({ year: 0, balance: 1000, deposited: 1000 });
  });

  it('grows a lone capital by exactly the annual rate after one year with no deposits', () => {
    const pts = Calc.project(10, 1000, 0, 1);
    expect(pts[1].balance).toBeCloseTo(1100, 6);
    expect(pts[1].deposited).toBe(1000);
  });

  it('accumulates monthly deposits at 0% rate', () => {
    const pts = Calc.project(0, 0, 100, 2);
    expect(pts[1].balance).toBeCloseTo(1200, 6);
    expect(pts[2].balance).toBeCloseTo(2400, 6);
    expect(pts[2].deposited).toBe(2400);
  });
});

describe('project with an annual bonus', () => {
  it('adds the bonus at the end of each year, in the balance and the deposits', () => {
    const pts = Calc.project(0, 1000, 10, 2, 100);
    expect(pts[2].deposited).toBe(1000 + 2 * (120 + 100));
    expect(pts[2].balance).toBeCloseTo(pts[2].deposited, 6);
  });
});

describe('simulatePlan', () => {
  const plan = { capital: 1000, monthly: 35, bonus: 100, years: 18, rate: 10, ext: false, extYears: 65, extMonthly: 100 };

  it('matches the reference plan (1 000 € + 35 €/month + 100 €/year, 18 years at 10 %)', () => {
    const sim = Calc.simulatePlan(plan);
    const end = sim.at(18);
    expect(sim.total).toBe(18);
    expect(end.paid).toBe(10360);
    expect(Math.round(end.v / 100) * 100).toBe(30100);
  });

  it('extends the plan to 65 years with 100 €/month after the first period', () => {
    const sim = Calc.simulatePlan({ ...plan, ext: true });
    const fin = sim.pts[sim.pts.length - 1];
    expect(sim.total).toBe(65);
    expect(fin.paid).toBe(66760);
    expect(fin.v / 1e6).toBeCloseTo(3.75, 1);
  });

  it('agrees with project() at the end of each year', () => {
    const sim = Calc.simulatePlan(plan);
    const pts = Calc.project(10, 1000, 35, 18, 100);
    expect(sim.at(18).v).toBeCloseTo(pts[18].balance, 6);
    expect(sim.at(18).paid).toBeCloseTo(pts[18].deposited, 6);
  });
});

describe('computeSavings', () => {
  const charges = [
    { id: 'c1', mensuel: 100 },
    { id: 'c2', mensuel: 50 },
  ];

  it('returns zero savings when there are no scenarios', () => {
    const result = Calc.computeSavings(charges, []);
    expect(result.monthly).toBe(0);
    expect(result.annual).toBe(0);
  });

  it('ignores scenarios that would cost more than the current charge', () => {
    const scenarios = [{ chargeId: 'c1', nouveau: 120 }];
    const result = Calc.computeSavings(charges, scenarios);
    expect(result.monthly).toBe(0);
  });

  it('keeps only the most economical option per charge', () => {
    const scenarios = [
      { chargeId: 'c1', nouveau: 90 },
      { chargeId: 'c1', nouveau: 70 },
      { chargeId: 'c2', nouveau: 40 },
    ];
    const result = Calc.computeSavings(charges, scenarios);
    // c1: best saving is 100-70=30, c2: 50-40=10 -> total 40/month
    expect(result.monthly).toBe(40);
    expect(result.annual).toBe(480);
  });
});
