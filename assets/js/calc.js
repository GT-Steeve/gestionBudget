/* ==========================================================================
   Gestion budget — calculs financiers purs (partagés navigateur + Node/tests)
   ========================================================================== */
'use strict';

(function (root, factory) {
  const calc = factory();
  if (typeof module === 'object' && module.exports) module.exports = calc;
  if (root) root.Calc = calc;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const MONTHS = 12;

  const annual = (monthly) => monthly * MONTHS;

  /**
   * Projection d'épargne. Le taux annuel r est converti en taux mensuel équivalent
   * i = (1 + r)^(1/12) - 1, de sorte qu'un capital seul gagne exactement r sur 12 mois.
   * Les versements sont faits en fin de mois.
   */
  function project(ratePercent, capital, monthly, years) {
    const i = Math.pow(1 + ratePercent / 100, 1 / MONTHS) - 1;
    let balance = capital;
    const pts = [{ year: 0, balance, deposited: capital }];
    for (let y = 1; y <= years; y++) {
      for (let m = 0; m < MONTHS; m++) balance = balance * (1 + i) + monthly;
      pts.push({ year: y, balance, deposited: capital + monthly * MONTHS * y });
    }
    return pts;
  }

  /** Économies : pour chaque charge, seule l'option de remplacement la plus économique est retenue. */
  function computeSavings(charges, scenarios) {
    const rows = scenarios
      .map((sc) => {
        const charge = charges.find((c) => c.id === sc.chargeId);
        return charge ? { sc, charge, eco: charge.mensuel - sc.nouveau } : null;
      })
      .filter(Boolean);

    const best = new Map();
    for (const r of rows) {
      if (r.eco <= 0) continue;
      const cur = best.get(r.charge.id);
      if (!cur || r.eco > cur.eco) best.set(r.charge.id, r);
    }
    const monthly = [...best.values()].reduce((sum, r) => sum + r.eco, 0);
    return { rows, best, monthly, annual: annual(monthly) };
  }

  return { MONTHS, annual, project, computeSavings };
});
