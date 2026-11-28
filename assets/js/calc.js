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
   * Les versements sont faits en fin de mois ; le bonus (facultatif) est versé
   * à la fin de chaque année.
   */
  function project(ratePercent, capital, monthly, years, bonus = 0) {
    const i = Math.pow(1 + ratePercent / 100, 1 / MONTHS) - 1;
    let balance = capital;
    const pts = [{ year: 0, balance, deposited: capital }];
    for (let y = 1; y <= years; y++) {
      for (let m = 0; m < MONTHS; m++) balance = balance * (1 + i) + monthly;
      balance += bonus;
      pts.push({ year: y, balance, deposited: capital + (monthly * MONTHS + bonus) * y });
    }
    return pts;
  }

  /**
   * Plan d'épargne mois par mois (page Placement, étape Objectif) : même calcul
   * que project(), avec en option une prolongation du plan (versement mensuel
   * différent après la durée, jusqu'à extYears). Le bonus n'est versé que
   * pendant la première période. pts[m] = { m, v (valeur), paid (versé) }.
   */
  function simulatePlan({ capital, monthly, bonus = 0, years, rate, ext = false, extYears = 0, extMonthly = 0 }) {
    const i = Math.pow(1 + rate / 100, 1 / MONTHS) - 1;
    const total = ext ? Math.max(extYears, years) : years;
    let v = capital;
    let paid = capital;
    const pts = [{ m: 0, v, paid }];
    for (let m = 1; m <= total * MONTHS; m++) {
      const first = m <= years * MONTHS;
      const dep = first ? monthly : extMonthly;
      v = v * (1 + i) + dep;
      paid += dep;
      if (first && m % MONTHS === 0) { v += bonus; paid += bonus; }
      pts.push({ m, v, paid });
    }
    return { pts, total, at: (y) => pts[Math.min(y * MONTHS, pts.length - 1)] };
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

  return { MONTHS, annual, project, simulatePlan, computeSavings };
});
