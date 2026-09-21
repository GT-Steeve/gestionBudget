/* ==========================================================================
   Gestion budget
   1. Charges mensuelles / annuelles (annuel = mensuel × 12)
   2. Économie potentielle en remplaçant une ligne par une autre option
   3. Gain par rendement (deux taux annuels modifiables, 2 % et 10 % par défaut,
      intérêts composés ; gain affiché pour l'année de votre choix)
   ========================================================================== */
'use strict';

(() => {
  /* ---------- Constantes ---------- */

  const STORAGE_KEY = 'gestion-epargne-v1';
  const THEME_KEY = 'gestion-epargne-theme';
  const CATEGORIES = ['Loyer', 'Factures', 'Courses', 'Transport', 'Abonnements', 'Activité', 'Plaisir', 'Autre'];
  const REV_CATEGORIES = ['Salaire', 'Aide'];
  const HINTS = {
    Loyer: 'Ex. Colocation, logement plus petit, renégociation',
    Factures: 'Ex. Fournisseur moins cher, forfait plus économique',
    Courses: 'Ex. Marque distributeur, drive, discount',
    Transport: 'Ex. Abonnement annuel, covoiturage, vélo',
    Abonnements: 'Ex. Offre étudiante, partage de compte',
    'Activité': 'Ex. Club moins cher, licence annuelle, activité gratuite',
    Plaisir: 'Ex. Sortie moins chère, moins de restaurants, offre découverte',
    Autre: 'Ex. Option moins chère'
  };
  const DEFAULT_RATES = [2, 10]; // rendements annuels proposés par défaut, en % (modifiables)
  const MAX_RATE = 100;          // plafond des rendements saisis, en %
  const MONTHS = 12;

  /* ---------- Utilitaires ---------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const num = (v) => {
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  /** Copie triée par ordre alphabétique (accents pris en compte) pour les listes déroulantes. */
  const sortAlpha = (list) => [...list].sort((a, b) => a.localeCompare(b, 'fr'));

  const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eurCompact = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
  const pct1 = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
  const rateNf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  /** Taux annuel affiché, ex. « 2 % » ou « 7,5 % » (espace insécable). */
  const fmtRate = (r) => `${rateNf.format(r)} %`;
  /** Taux saisi : valeur absente → défaut ; sinon entre 0 et MAX_RATE. */
  const readRate = (v, fallback) => (v === undefined || v === null || v === '' ? fallback : clamp(num(v), 0, MAX_RATE));

  /** Création d'éléments DOM sans innerHTML (les libellés viennent de l'utilisateur). */
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    el.append(...kids.flat().filter((x) => x != null && x !== false));
    return el;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs = {}, ...kids) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.append(...kids.filter((x) => x != null));
    return el;
  }

  /* ---------- Stockage local (avec repli en mémoire) ---------- */

  const store = {
    get(key) {
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
    }
  };

  /* ---------- État ---------- */

  function exampleState() {
    const loyer = { id: uid(), categorie: 'Loyer', nom: 'Loyer', mensuel: 750 };
    const elec = { id: uid(), categorie: 'Factures', nom: 'Électricité', mensuel: 65 };
    const inter = { id: uid(), categorie: 'Factures', nom: 'Internet + mobile', mensuel: 45 };
    const courses = { id: uid(), categorie: 'Courses', nom: 'Courses alimentaires', mensuel: 320 };
    const transport = { id: uid(), categorie: 'Transport', nom: 'Pass transport', mensuel: 75 };
    return {
      revenus: [
        { id: uid(), categorie: 'Salaire', nom: 'Salaire net', mensuel: 1600 },
        { id: uid(), categorie: 'Aide', nom: 'Aide au logement', mensuel: 150 }
      ],
      charges: [loyer, elec, inter, courses, transport],
      scenarios: [
        { id: uid(), chargeId: elec.id, option: 'Fournisseur moins cher', nouveau: 52 },
        { id: uid(), chargeId: courses.id, option: 'Marque distributeur + drive', nouveau: 260 }
      ],
      yield: { capital: 1000, versement: 100, annees: 10, taux1: DEFAULT_RATES[0], taux2: DEFAULT_RATES[1], anneeGain: 1 },
      view: 'mois'
    };
  }

  function loadState() {
    const saved = store.get(STORAGE_KEY);
    if (!saved || !Array.isArray(saved.charges) || !Array.isArray(saved.scenarios) || !saved.yield) {
      return exampleState();
    }
    return {
      charges: saved.charges.map((c) => ({
        id: String(c.id || uid()),
        categorie: CATEGORIES.includes(c.categorie) ? c.categorie : 'Autre',
        nom: String(c.nom || 'Sans nom').slice(0, 60),
        mensuel: num(c.mensuel)
      })),
      revenus: (Array.isArray(saved.revenus) ? saved.revenus : []).map((r) => ({
        id: String(r.id || uid()),
        categorie: REV_CATEGORIES.includes(r.categorie) ? r.categorie : 'Salaire',
        nom: String(r.nom || 'Sans nom').slice(0, 60),
        mensuel: num(r.mensuel)
      })),
      scenarios: saved.scenarios.map((x) => ({
        id: String(x.id || uid()),
        chargeId: String(x.chargeId),
        option: String(x.option || '').slice(0, 60),
        nouveau: num(x.nouveau)
      })),
      view: saved.view === 'an' ? 'an' : 'mois',
      yield: (() => {
        const annees = clamp(Math.round(num(saved.yield.annees)) || 10, 1, 50);
        return {
          capital: num(saved.yield.capital),
          versement: num(saved.yield.versement),
          annees,
          taux1: readRate(saved.yield.taux1, DEFAULT_RATES[0]),
          taux2: readRate(saved.yield.taux2, DEFAULT_RATES[1]),
          anneeGain: clamp(Math.round(num(saved.yield.anneeGain)) || 1, 1, annees)
        };
      })()
    };
  }

  const state = loadState();
  state.scenarios = state.scenarios.filter((x) => state.charges.some((c) => c.id === x.chargeId));

  const save = () => store.set(STORAGE_KEY, state);

  /* ---------- Calculs ---------- */

  const annual = (monthly) => monthly * MONTHS;
  const totalMonthly = () => state.charges.reduce((sum, c) => sum + c.mensuel, 0);
  const totalRevenus = () => state.revenus.reduce((sum, r) => sum + r.mensuel, 0);

  /** Économies : pour chaque ligne, seule l'option la plus économique est retenue. */
  function computeSavings() {
    const rows = state.scenarios
      .map((sc) => {
        const charge = state.charges.find((c) => c.id === sc.chargeId);
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

  /* ==========================================================================
     1. Charges
     ========================================================================== */

  /** Tableaux de lignes : revenus et charges fonctionnent pareil, seules les catégories changent. */
  const LINE_TYPES = {
    revenus: {
      body: '#revenusBody', cats: sortAlpha(REV_CATEGORIES),
      empty: 'Aucun revenu pour le moment. Ajoutez votre première ligne ci-dessus.'
    },
    charges: {
      body: '#chargesBody', cats: sortAlpha(CATEGORIES),
      empty: 'Aucune charge pour le moment. Ajoutez votre première ligne ci-dessus.'
    }
  };

  function renderLineForms() {
    $('#rCat').replaceChildren(...sortAlpha(REV_CATEGORIES).map((c) => h('option', { value: c }, c)));
    $('#cCat').replaceChildren(...sortAlpha(CATEGORIES).map((c) => h('option', { value: c }, c)));
  }

  const CLOSE_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';

  function renderLines(type) {
    const cfg = LINE_TYPES[type];
    const body = $(cfg.body);
    body.replaceChildren();

    if (!state[type].length) {
      body.append(h('tr', {}, h('td', { colspan: 5, class: 'empty' }, cfg.empty)));
      return;
    }

    for (const c of state[type]) {
      const annualCell = h('td', { class: 'num' }, eur2.format(annual(c.mensuel)));

      const nameInput = h('input', {
        class: 'cell', type: 'text', maxlength: 60, value: c.nom, 'aria-label': 'Libellé',
        onchange: (e) => {
          c.nom = e.target.value.trim() || c.nom;
          e.target.value = c.nom;
          refresh();
        }
      });

      const catSelect = h('select', {
        class: 'cell', 'aria-label': 'Catégorie',
        onchange: (e) => { c.categorie = e.target.value; refresh(); }
      }, cfg.cats.map((cat) => h('option', { value: cat }, cat)));
      catSelect.value = c.categorie;

      const amountInput = h('input', {
        class: 'cell num', type: 'number', min: 0, step: '0.01', inputmode: 'decimal',
        value: c.mensuel, 'aria-label': `Montant mensuel de ${c.nom}`,
        oninput: (e) => {
          c.mensuel = num(e.target.value);
          annualCell.textContent = eur2.format(annual(c.mensuel));
          refresh();
        }
      });

      const del = h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': `Supprimer ${c.nom}`, title: 'Supprimer',
        onclick: () => {
          state[type] = state[type].filter((x) => x.id !== c.id);
          if (type === 'charges') state.scenarios = state.scenarios.filter((x) => x.chargeId !== c.id);
          renderLines(type);
          refresh();
        }
      });
      del.innerHTML = CLOSE_ICON;

      body.append(h('tr', {},
        h('td', {}, nameInput),
        h('td', {}, catSelect),
        h('td', { class: 'num' }, amountInput),
        annualCell,
        h('td', { class: 'num' }, del)
      ));
    }
  }

  /** Affiche un montant signé : vert si positif, rouge si négatif. */
  function setSigned(el, value) {
    el.textContent = eur2.format(value);
    el.classList.toggle('good', value > 0.004);
    el.classList.toggle('bad', value < -0.004);
  }

  function renderRevenusTotals() {
    const rev = totalRevenus();
    const ch = totalMonthly();
    const solde = rev - ch;
    $('#totRevMensuel').textContent = eur2.format(rev);
    $('#totRevAnnuel').textContent = eur2.format(annual(rev));
    $('#soldeRev').textContent = eur2.format(rev);
    $('#soldeCharges').textContent = eur2.format(ch);
    setSigned($('#soldeMois'), solde);
    setSigned($('#soldeAn'), annual(solde));

    const msg = $('#soldeMsg');
    msg.replaceChildren();
    if (!state.revenus.length && !state.charges.length) msg.append(' ');
    else if (solde > 0.004) msg.append('Il vous reste ', h('span', { class: 'good' }, `${eur2.format(solde)} par mois`), ' après vos charges : de quoi épargner.');
    else if (solde < -0.004) msg.append('Vos charges dépassent vos revenus de ', h('span', { class: 'bad' }, `${eur2.format(-solde)} par mois`), '.');
    else msg.append('Vos revenus couvrent exactement vos charges.');
  }

  function renderChargeTotals() {
    const m = totalMonthly();
    $('#totMensuel').textContent = eur2.format(m);
    $('#totAnnuel').textContent = eur2.format(annual(m));

    // Répartition par catégorie
    const box = $('#breakdown');
    box.replaceChildren();
    const byCat = CATEGORIES
      .map((cat) => ({ cat, total: state.charges.filter((c) => c.categorie === cat).reduce((a, c) => a + c.mensuel, 0) }))
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total);

    if (!byCat.length) {
      box.append(h('p', { class: 'note' }, 'Ajoutez des charges pour voir leur répartition.'));
      return;
    }
    const max = byCat[0].total;
    for (const { cat, total } of byCat) {
      box.append(h('div', { class: 'bd' },
        h('span', { class: 'bd__name' }, cat),
        h('div', { class: 'bd__track', role: 'presentation' },
          h('div', { class: 'bd__bar', style: `width:${(total / max) * 100}%` })),
        h('span', { class: 'bd__val' }, eur2.format(total), ' ', h('span', {}, `· ${pct1.format(total / m)}`))
      ));
    }
  }

  function bindLines() {
    const bindForm = (type, ids) => {
      $(ids.form).addEventListener('submit', (e) => {
        e.preventDefault();
        const nom = $(ids.nom).value.trim();
        if (!nom) return;
        state[type].push({ id: uid(), categorie: $(ids.cat).value, nom, mensuel: num($(ids.montant).value) });
        $(ids.nom).value = '';
        $(ids.montant).value = '';
        $(ids.nom).focus();
        renderLines(type);
        refresh();
      });
    };
    bindForm('revenus', { form: '#revenuForm', cat: '#rCat', nom: '#rNom', montant: '#rMontant' });
    bindForm('charges', { form: '#chargeForm', cat: '#cCat', nom: '#cNom', montant: '#cMontant' });

    $('#btnExample').addEventListener('click', () => {
      const ex = exampleState();
      state.revenus = ex.revenus;
      state.charges = ex.charges;
      state.scenarios = ex.scenarios;
      state.yield = ex.yield;
      syncYieldInputs();
      renderLines('revenus');
      renderLines('charges');
      refresh();
    });

    $('#btnClear').addEventListener('click', () => {
      if (!window.confirm('Supprimer tous les revenus, charges et comparaisons ?')) return;
      state.revenus = [];
      state.charges = [];
      state.scenarios = [];
      renderLines('revenus');
      renderLines('charges');
      refresh();
    });
  }

  /* ==========================================================================
     2. Économies potentielles
     ========================================================================== */

  let lineSignature = '';

  function renderScenarioForm() {
    const sel = $('#sLigne');
    const sig = state.charges.map((c) => `${c.id}|${c.nom}|${c.mensuel}`).join(';');
    if (sig !== lineSignature) {
      lineSignature = sig;
      const previous = sel.value;
      const sorted = [...state.charges].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
      sel.replaceChildren(...sorted.map((c) =>
        h('option', { value: c.id }, `${c.nom} (${eur2.format(c.mensuel)}/mois)`)));
      if (state.charges.some((c) => c.id === previous)) sel.value = previous;
    }
    const disabled = !state.charges.length;
    $('#scForm').querySelectorAll('input, select, button').forEach((el) => { el.disabled = disabled; });

    const charge = state.charges.find((c) => c.id === sel.value);
    $('#sOption').placeholder = charge ? HINTS[charge.categorie] : 'Ajoutez d\'abord une charge';
    renderPreview();
  }

  function renderPreview() {
    const box = $('#sPreview');
    const charge = state.charges.find((c) => c.id === $('#sLigne').value);
    const raw = $('#sMontant').value;
    if (!charge || raw === '') { box.textContent = ' '; return; }
    const eco = charge.mensuel - num(raw);
    box.replaceChildren();
    if (eco > 0) {
      box.append('Aperçu : ', h('span', { class: 'good' }, `économie de ${eur2.format(eco)} par mois`), ` soit ${eur2.format(annual(eco))} par an (× 12).`);
    } else if (eco < 0) {
      box.append('Aperçu : ', h('span', { class: 'bad' }, `surcoût de ${eur2.format(-eco)} par mois`), ` soit ${eur2.format(annual(-eco))} par an (× 12).`);
    } else {
      box.append('Aperçu : même coût que la ligne actuelle.');
    }
  }

  function renderScenarios() {
    const { rows, best, monthly, annual: yearly } = computeSavings();
    const m = totalMonthly();

    $('#ecoMois').textContent = eur2.format(monthly);
    $('#ecoAn').textContent = eur2.format(yearly);
    $('#ecoPart').textContent = m > 0 ? pct1.format(monthly / m) : '–';
    $('#ecoNouveau').textContent = eur2.format(Math.max(0, m - monthly));

    const body = $('#scBody');
    body.replaceChildren();
    if (!rows.length) {
      body.append(h('tr', {}, h('td', { colspan: 7, class: 'empty' }, 'Aucune comparaison. Choisissez une ligne, une option alternative et son nouveau montant.')));
      return;
    }

    for (const { sc, charge, eco } of rows) {
      const isBest = best.get(charge.id)?.sc.id === sc.id;
      const kind = eco > 0 ? 'good' : eco < 0 ? 'bad' : '';
      const sign = eco > 0 ? '+' : eco < 0 ? '−' : '';
      const label = eco > 0 ? 'économie' : eco < 0 ? 'surcoût' : 'identique';

      const optionCell = h('td', {}, sc.option || '–');
      if (isBest) optionCell.append(h('span', { class: 'pill pill--good' }, 'Retenue'));
      else if (eco > 0) optionCell.append(h('span', { class: 'pill', title: 'Une option plus économique est déjà retenue pour cette ligne' }, 'Non cumulée'));

      const apply = h('button', {
        class: 'btn btn--ghost btn--sm', type: 'button',
        title: 'Remplacer la ligne par cette option dans vos charges',
        onclick: () => {
          charge.mensuel = sc.nouveau;
          if (sc.option) charge.nom = sc.option;
          state.scenarios = state.scenarios.filter((x) => x.chargeId !== charge.id);
          renderLines('charges');
          refresh();
        }
      }, 'Appliquer');

      const del = h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': `Supprimer la comparaison ${sc.option}`, title: 'Supprimer',
        onclick: () => { state.scenarios = state.scenarios.filter((x) => x.id !== sc.id); refresh(); }
      });
      del.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';

      body.append(h('tr', {},
        h('td', {}, charge.nom, h('span', { class: 'sub' }, charge.categorie)),
        optionCell,
        h('td', { class: 'num' }, eur2.format(charge.mensuel)),
        h('td', { class: 'num' }, eur2.format(sc.nouveau)),
        h('td', { class: `num delta delta--${kind}` }, `${sign}${eur2.format(Math.abs(eco))}`, h('small', {}, label)),
        h('td', { class: `num delta delta--${kind}` }, `${sign}${eur2.format(Math.abs(annual(eco)))}`, h('small', {}, label)),
        h('td', { class: 'num' }, eco > 0 ? apply : null, del)
      ));
    }
  }

  function bindScenarios() {
    $('#scForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const chargeId = $('#sLigne').value;
      const option = $('#sOption').value.trim();
      if (!chargeId || !option || $('#sMontant').value === '') return;
      state.scenarios.push({ id: uid(), chargeId, option, nouveau: num($('#sMontant').value) });
      $('#sOption').value = '';
      $('#sMontant').value = '';
      $('#sOption').focus();
      refresh();
    });
    $('#sLigne').addEventListener('change', renderScenarioForm);
    $('#sMontant').addEventListener('input', renderPreview);
  }

  /* ==========================================================================
     3. Rendement
     ========================================================================== */

  function syncYieldInputs() {
    $('#yCapital').value = state.yield.capital;
    $('#yVersement').value = state.yield.versement;
    $('#yAnnees').value = state.yield.annees;
    $('#yTaux1').value = state.yield.taux1;
    $('#yTaux2').value = state.yield.taux2;
    $('#yAnneeGain').value = state.yield.anneeGain;
    $('#yAnneeGain').max = state.yield.annees;
  }

  let chartData = null; // { series, years }

  /**
   * Deux scénarios de rendement : le taux le plus bas est toujours « low », le plus haut « high »,
   * quel que soit l'ordre de saisie. `gainYear` = année dont on affiche le gain (entre 1 et la durée).
   */
  function computeYield() {
    const { capital, versement, annees, taux1, taux2, anneeGain } = state.yield;
    const years = clamp(Math.round(annees) || 1, 1, 50);
    const rates = [taux1, taux2].sort((a, b) => a - b);
    const results = rates.map((r) => ({ rate: r, pts: project(r, capital, versement, years) }));
    const gainYear = clamp(Math.round(anneeGain) || 1, 1, years);
    return { years, results, gainYear };
  }

  /** Intérêts gagnés pendant l'année n uniquement (pas cumulés). */
  const gainOfYear = (pts, n) => (pts[n].balance - pts[n].deposited) - (pts[n - 1].balance - pts[n - 1].deposited);
  const gainYearLabel = (n) => (n === 1 ? 'Gain la 1ʳᵉ année' : `Gain de l'année ${n}`);

  function renderYield() {
    const { years, results, gainYear } = computeYield();
    const [low, high] = results;
    const deposited = low.pts[years].deposited;
    const rLow = fmtRate(low.rate);
    const rHigh = fmtRate(high.rate);

    // Titre et en-têtes qui suivent les taux choisis
    $('#h-rend').textContent = `Gain par rendement : ${rLow} ou ${rHigh}`;
    $('#thCapLow').textContent = `Capital à ${rLow}`;
    $('#thGainLow').textContent = `Gain à ${rLow}`;
    $('#thCapHigh').textContent = `Capital à ${rHigh}`;
    $('#thGainHigh').textContent = `Gain à ${rHigh}`;

    // Cartes de résultat
    const cards = $('#yieldCards');
    cards.replaceChildren(...[[low, 'r2'], [high, 'r10']].map(([{ rate, pts }, cls]) => {
      const last = pts[years];
      const gain = last.balance - last.deposited;
      return h('article', { class: `res res--${cls}` },
        h('p', { class: 'res__title' }, `Rendement de ${fmtRate(rate)} par an`),
        h('p', { class: 'res__big' }, eur0.format(last.balance)),
        h('dl', {},
          h('dt', {}, 'Total versé'), h('dd', {}, eur0.format(last.deposited)),
          h('dt', {}, 'Gain (intérêts)'), h('dd', { class: 'good' }, `+${eur0.format(gain)}`),
          h('dt', {}, gainYearLabel(gainYear)), h('dd', { class: 'good' }, `+${eur0.format(gainOfYear(pts, gainYear))}`)
        )
      );
    }));

    // Légende
    $('#legend').replaceChildren(
      h('li', {}, h('span', { class: 'key key--r10' }), `Rendement ${rHigh}`),
      h('li', {}, h('span', { class: 'key key--r2' }), `Rendement ${rLow}`),
      h('li', {}, h('span', { class: 'key key--dep' }), 'Total versé')
    );

    // Tableau année par année (l'année choisie pour le gain est surlignée)
    $('#yearBody').replaceChildren(...low.pts.map((p, i) => h('tr', { class: i === gainYear ? 'is-sel' : null },
      h('th', { scope: 'row' }, String(p.year)),
      h('td', { class: 'num' }, eur0.format(p.deposited)),
      h('td', { class: 'num' }, eur0.format(p.balance)),
      h('td', { class: 'num' }, eur0.format(p.balance - p.deposited)),
      h('td', { class: 'num' }, eur0.format(high.pts[i].balance)),
      h('td', { class: 'num' }, eur0.format(high.pts[i].balance - high.pts[i].deposited))
    )));

    // Graphique
    chartData = {
      years,
      series: [
        { key: 'r10', label: rHigh, name: `Rendement ${rHigh}`, pts: high.pts.map((p) => p.balance) },
        { key: 'r2', label: rLow, name: `Rendement ${rLow}`, pts: low.pts.map((p) => p.balance) },
        { key: 'dep', label: 'Versé', name: 'Total versé', pts: low.pts.map((p) => p.deposited) }
      ],
      rLow,
      rHigh
    };
    renderChart();

    // Bouton « utiliser mon économie »
    const eco = computeSavings().monthly;
    $('#btnUseEco').disabled = eco <= 0;
    $('#btnUseEco').title = eco > 0 ? `Mettre ${eur2.format(eco)} par mois en épargne` : 'Ajoutez d\'abord une économie dans la partie 3';

    return { years, deposited, high, low };
  }

  /* ---------- Graphique SVG ---------- */

  function niceScale(max, ticks) {
    if (max <= 0) return { max: 100, step: 25 };
    const raw = max / ticks;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / pow;
    const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    const step = nice * pow;
    return { max: Math.ceil(max / step - 1e-9) * step, step };
  }

  function renderChart() {
    if (!chartData) return;
    const box = $('#chart');
    const tip = $('#chartTip');
    const { series, years, rLow, rHigh } = chartData;

    const W = Math.max(280, Math.floor(box.clientWidth || 640));
    const small = W < 520;
    const H = small ? 260 : 320;
    const m = { t: 14, r: small ? 54 : 78, b: 32, l: small ? 56 : 66 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;

    const maxV = Math.max(...series.flatMap((sr) => sr.pts));
    const { max: yMax, step } = niceScale(maxV, 4);
    const X = (i) => m.l + (i / years) * iw;
    const Y = (v) => m.t + ih - (v / yMax) * ih;

    const svg = s('svg', {
      viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group', tabindex: '0',
      'aria-label': `Évolution du capital sur ${years} ans : ${eur0.format(series[1].pts[years])} à ${rLow}, ${eur0.format(series[0].pts[years])} à ${rHigh}, pour ${eur0.format(series[2].pts[years])} versés. Utilisez les flèches gauche et droite pour parcourir les années.`
    });

    // Grille + axe Y
    for (let v = 0; v <= yMax + 1e-9; v += step) {
      svg.append(
        s('line', { class: v === 0 ? 'g-axis' : 'g-line', x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v) }),
        s('text', { class: 'g-text', x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, eurCompact.format(v))
      );
    }

    // Axe X
    const xStep = years <= 12 ? 1 : years <= 24 ? 2 : 5;
    for (let i = 0; i <= years; i += xStep) {
      svg.append(s('text', { class: 'g-text', x: X(i), y: H - 10, 'text-anchor': 'middle' }, String(i)));
    }
    svg.append(s('text', { class: 'g-text', x: m.l + iw + 10, y: H - 10 }, 'ans'));

    // Courbes
    const drawOrder = [...series].reverse(); // versé en dessous, taux le plus haut au-dessus
    for (const sr of drawOrder) {
      const d = sr.pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
      svg.append(s('path', { class: `s-line s-${sr.key}`, d }));
    }

    // Étiquettes directes en fin de courbe (anticollision)
    const labels = series
      .map((sr) => ({ sr, y: Y(sr.pts[years]) }))
      .sort((a, b) => a.y - b.y);
    for (let k = 1; k < labels.length; k++) {
      if (labels[k].y - labels[k - 1].y < 15) labels[k].y = labels[k - 1].y + 15;
    }
    for (const { sr, y } of labels) {
      svg.append(
        s('circle', { class: `dot s-${sr.key}`, cx: X(years), cy: Y(sr.pts[years]), r: 4 }),
        s('text', { class: 'g-label', x: X(years) + 10, y: y + 4 }, sr.label)
      );
    }

    // Survol : repère vertical + points
    const cross = s('line', { class: 'cross', y1: m.t, y2: m.t + ih, visibility: 'hidden' });
    const dots = series.map((sr) => s('circle', { class: `dot s-${sr.key}`, r: 4.5, visibility: 'hidden' }));
    svg.append(cross, ...dots);

    const hit = s('rect', { x: m.l - 8, y: m.t, width: iw + 16, height: ih + m.b - 8, fill: 'transparent', style: 'touch-action:pan-y' });
    svg.append(hit);

    const hide = () => {
      cross.setAttribute('visibility', 'hidden');
      dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
      tip.hidden = true;
    };

    const showAt = (i) => {
      i = clamp(i, 0, years);
      const x = X(i);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
      dots.forEach((d, k) => {
        d.setAttribute('cx', x); d.setAttribute('cy', Y(series[k].pts[i])); d.setAttribute('visibility', 'visible');
      });

      tip.replaceChildren(
        h('div', { class: 'tip__head' }, i === 0 ? 'Départ' : `Année ${i}`),
        ...series.map((sr) => h('div', { class: 'tip__row' },
          h('span', { class: `key key--${sr.key}` }),
          h('span', { class: 'lbl' }, sr.name),
          h('strong', {}, eur0.format(sr.pts[i]))
        ))
      );
      tip.hidden = false;
      const right = x < W * 0.55;
      tip.style.left = `${right ? x + 14 : x - 14}px`;
      tip.style.transform = right ? 'none' : 'translateX(-100%)';
    };

    const idxFromEvent = (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      return Math.round(((px - m.l) / iw) * years);
    };

    hit.addEventListener('pointermove', (e) => showAt(idxFromEvent(e)));
    hit.addEventListener('pointerdown', (e) => showAt(idxFromEvent(e)));
    hit.addEventListener('pointerleave', hide);

    let kbIdx = years;
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { kbIdx = clamp(kbIdx - 1, 0, years); showAt(kbIdx); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { kbIdx = clamp(kbIdx + 1, 0, years); showAt(kbIdx); e.preventDefault(); }
      else if (e.key === 'Home') { kbIdx = 0; showAt(kbIdx); e.preventDefault(); }
      else if (e.key === 'End') { kbIdx = years; showAt(kbIdx); e.preventDefault(); }
      else if (e.key === 'Escape') hide();
    });
    svg.addEventListener('focus', () => showAt(kbIdx));
    svg.addEventListener('blur', hide);

    box.replaceChildren(svg);
    tip.hidden = true;
  }

  function bindYield() {
    const read = () => {
      state.yield.capital = num($('#yCapital').value);
      state.yield.versement = num($('#yVersement').value);
      state.yield.annees = clamp(Math.round(num($('#yAnnees').value)) || 1, 1, 50);
      state.yield.taux1 = clamp(num($('#yTaux1').value), 0, MAX_RATE);
      state.yield.taux2 = clamp(num($('#yTaux2').value), 0, MAX_RATE);

      // L'année du gain reste comprise entre 1 et la durée ; le champ suit si on la corrige.
      const wanted = Math.round(num($('#yAnneeGain').value)) || 1;
      state.yield.anneeGain = clamp(wanted, 1, state.yield.annees);
      $('#yAnneeGain').max = state.yield.annees;
      if (wanted !== state.yield.anneeGain && $('#yAnneeGain').value !== '') {
        $('#yAnneeGain').value = state.yield.anneeGain;
      }
      renderYield();
      renderSummary();
      renderSynthese();
      save();
    };
    ['#yCapital', '#yVersement', '#yAnnees', '#yTaux1', '#yTaux2', '#yAnneeGain']
      .forEach((sel) => $(sel).addEventListener('input', read));

    $('#btnUseEco').addEventListener('click', () => {
      const eco = computeSavings().monthly;
      if (eco <= 0) return;
      state.yield.versement = Math.round(eco * 100) / 100;
      syncYieldInputs();
      renderYield();
      renderSummary();
      renderSynthese();
      save();
    });

    if ('ResizeObserver' in window) {
      let lastW = 0;
      new ResizeObserver(() => {
        const w = Math.floor($('#chart').clientWidth);
        if (w && w !== lastW) { lastW = w; renderChart(); }
      }).observe($('.chart-wrap'));
    } else {
      window.addEventListener('resize', renderChart);
    }
  }

  /* ==========================================================================
     5. Synthèse : camembert (revenus → charges + reste) et barres verticales
     ========================================================================== */

  /** Une couleur fixe par catégorie, la même dans le camembert et dans les barres. */
  const CAT_KEY = {
    Salaire: 'salaire', Aide: 'aide',
    Loyer: 'loyer', Factures: 'factures', Courses: 'courses',
    Transport: 'transport', Abonnements: 'abonnements', 'Activité': 'activite', Plaisir: 'plaisir', Autre: 'autre'
  };
  const catColor = (key) => (key === 'reste' ? 'var(--neutral-fill)' : `var(--cat-${key})`);
  const factor = () => (state.view === 'an' ? MONTHS : 1);
  const unitLabel = () => (state.view === 'an' ? 'par an' : 'par mois');
  const signedNode = (v) => h('span', { class: v > 0.004 ? 'good' : v < -0.004 ? 'bad' : '' }, eur2.format(v));

  let synModel = null;

  function buildSynModel() {
    const k = factor();
    const rev = totalRevenus() * k;
    const ch = totalMonthly() * k;
    const solde = rev - ch;

    // Camembert : les revenus sont répartis entre les catégories de charges et le reste à épargner.
    const byCat = CATEGORIES
      .map((cat) => ({
        key: CAT_KEY[cat], label: cat,
        value: state.charges.filter((c) => c.categorie === cat).reduce((a, c) => a + c.mensuel, 0) * k
      }))
      .filter((x) => x.value > 0);
    const slices = [...byCat];
    if (solde > 0.004) slices.push({ key: 'reste', label: 'Reste à épargner', value: solde });
    const total = slices.reduce((a, x) => a + x.value, 0);
    const useRev = rev >= ch && rev > 0;

    // Barres : une barre par ligne, revenus puis charges, de la plus grande à la plus petite.
    const toItem = (type) => (l) => ({
      type, key: CAT_KEY[l.categorie], cat: l.categorie, label: l.nom, monthly: l.mensuel, value: l.mensuel * k
    });
    const bySize = (a, b) => b.value - a.value;
    const items = [
      ...state.revenus.map(toItem('revenus')).sort(bySize),
      ...state.charges.map(toItem('charges')).sort(bySize)
    ];

    return {
      k, rev, ch, solde, unit: unitLabel(), slices, total,
      centerLabel: useRev ? 'Revenus' : 'Charges', centerValue: useRev ? rev : ch, items
    };
  }

  function renderSynthese() {
    synModel = buildSynModel();
    $('#viewMois').setAttribute('aria-pressed', String(state.view === 'mois'));
    $('#viewAn').setAttribute('aria-pressed', String(state.view === 'an'));
    renderSynMessage(synModel);
    renderBilan(synModel);
    renderPie(synModel);
    renderBars(synModel);
  }

  function renderSynMessage(m) {
    const box = $('#synMsg');
    box.replaceChildren();
    if (m.rev <= 0 && m.ch <= 0) { box.append(' '); return; }
    if (m.rev <= 0) {
      box.append(`Vous avez ${eur0.format(m.ch)} de charges ${m.unit}, mais aucun revenu n'est saisi.`);
      return;
    }
    box.append(`Sur ${eur0.format(m.rev)} de revenus ${m.unit}, vous dépensez ${eur0.format(m.ch)}${m.solde >= 0 ? ` (${pct1.format(m.ch / m.rev)})` : ''}. `);
    if (m.solde > 0.004) box.append('Il reste ', h('span', { class: 'good' }, `${eur0.format(m.solde)} (${pct1.format(m.solde / m.rev)})`), ' à épargner.');
    else if (m.solde < -0.004) box.append('Vos charges dépassent vos revenus de ', h('span', { class: 'bad' }, eur0.format(-m.solde)), '.');
    else box.append('Votre budget est à l\'équilibre.');
  }

  function renderBilan(m) {
    const eco = computeSavings().monthly * m.k;
    const { years, results } = computeYield();
    const [low, high] = results;
    const rLow = fmtRate(low.rate);
    const rHigh = fmtRate(high.rate);
    const row = (label, value, sub) => h('div', {}, h('dt', {}, label), h('dd', {}, value, sub ? h('small', {}, sub) : null));

    $('#bilan').replaceChildren(
      row('Revenus', eur2.format(m.rev), m.unit),
      row('Charges', eur2.format(m.ch), m.unit),
      row('Solde (revenus − charges)', signedNode(m.solde), m.unit),
      row('Taux d\'épargne', m.rev > 0 ? h('span', { class: m.solde > 0.004 ? 'good' : m.solde < -0.004 ? 'bad' : '' }, pct1.format(m.solde / m.rev)) : '–', 'solde ÷ revenus'),
      row('Économie possible', eur2.format(eco), eco > 0 ? `solde après économies : ${eur2.format(m.solde + eco)}` : 'aucune comparaison (partie 3)'),
      row(`Capital dans ${years} an${years > 1 ? 's' : ''}`, `${eur0.format(high.pts[years].balance)} à ${rHigh}`,
        `${eur0.format(low.pts[years].balance)} à ${rLow} · ${eur0.format(state.yield.versement)} épargnés par mois`)
    );
  }

  /* ---------- Camembert (donut) ---------- */

  function arcPath(cx, cy, r0, r1, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
    return `M${pt(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${pt(r0, a0)} Z`;
  }

  function ringPath(cx, cy, r0, r1) {
    const circle = (r) => `M${cx - r} ${cy} A${r} ${r} 0 1 1 ${cx + r} ${cy} A${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
    return `${circle(r1)} ${circle(r0)}`;
  }

  function renderPie(m) {
    const box = $('#pie');
    const tip = $('#pieTip');
    const wrap = $('#pieWrap');
    const legend = $('#pieLegend');
    box.replaceChildren();
    legend.replaceChildren();
    tip.hidden = true;

    const SIZE = 220, C = SIZE / 2, R1 = 106, R0 = 68;
    const svg = s('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, width: SIZE, height: SIZE, role: 'group', 'aria-label': `Répartition de vos ${m.centerLabel.toLowerCase()} ${m.unit}` });

    if (m.total <= 0) {
      svg.append(
        s('circle', { cx: C, cy: C, r: (R0 + R1) / 2, fill: 'none', stroke: 'var(--grid)', 'stroke-width': R1 - R0 }),
        s('text', { class: 'pie-c1', x: C, y: C + 4, 'text-anchor': 'middle' }, 'Aucune donnée')
      );
      box.append(svg);
      legend.append(h('li', { class: 'plegend__empty' }, 'Ajoutez des revenus et des charges pour voir la répartition.'));
      $('#pieNote').textContent = '';
      return;
    }

    const showTip = (sl, x, y, right) => {
      const other = state.view === 'an' ? sl.value / MONTHS : sl.value * MONTHS;
      const monthly = state.view === 'an' ? other : sl.value;
      const yearly = state.view === 'an' ? sl.value : other;
      tip.replaceChildren(
        h('div', { class: 'tip__head' }, sl.label),
        h('div', { class: 'tip__row' }, h('span', { class: 'lbl' }, 'Par mois'), h('strong', {}, eur2.format(monthly))),
        h('div', { class: 'tip__row' }, h('span', { class: 'lbl' }, 'Par an (× 12)'), h('strong', {}, eur2.format(yearly))),
        h('div', { class: 'tip__row' }, h('span', { class: 'lbl' }, `Part des ${m.centerLabel.toLowerCase()}`), h('strong', {}, pct1.format(sl.value / m.total)))
      );
      tip.hidden = false;
      tip.style.left = `${right ? x + 14 : x - 14}px`;
      tip.style.top = `${Math.max(0, y - 10)}px`;
      tip.style.transform = right ? 'none' : 'translateX(-100%)';
    };

    let a = -Math.PI / 2;
    for (const sl of m.slices) {
      const frac = sl.value / m.total;
      const a1 = a + frac * 2 * Math.PI;
      const mid = (a + a1) / 2;
      const node = s('path', {
        class: 'pie-slice', d: frac >= 0.9999 ? ringPath(C, C, R0, R1) : arcPath(C, C, R0, R1, a, a1),
        'fill-rule': 'evenodd', style: `fill:${catColor(sl.key)}`,
        tabindex: '0', role: 'img', 'aria-label': `${sl.label} : ${eur2.format(sl.value)} ${m.unit}, ${pct1.format(frac)}`
      });
      const pointer = (e) => {
        const r = wrap.getBoundingClientRect();
        const x = e.clientX - r.left;
        showTip(sl, x, e.clientY - r.top, x < r.width * 0.55);
      };
      node.addEventListener('pointerenter', pointer);
      node.addEventListener('pointermove', pointer);
      node.addEventListener('pointerleave', () => { tip.hidden = true; });
      node.addEventListener('focus', () => {
        const rr = (R0 + R1) / 2;
        const x = C + rr * Math.cos(mid);
        showTip(sl, x, C + rr * Math.sin(mid), x < C);
      });
      node.addEventListener('blur', () => { tip.hidden = true; });
      svg.append(node);
      a = a1;

      legend.append(h('li', {},
        h('span', { class: 'sw', style: `--c:${catColor(sl.key)}` }),
        h('span', { class: 'pl-name' }, sl.label),
        h('span', { class: 'pl-val' }, eur2.format(sl.value)),
        h('span', { class: 'pl-pct' }, pct1.format(frac))
      ));
    }

    svg.append(
      s('text', { class: 'pie-c1', x: C, y: C - 6, 'text-anchor': 'middle' }, `${m.centerLabel} ${m.unit}`),
      s('text', { class: 'pie-c2', x: C, y: C + 18, 'text-anchor': 'middle' }, eur0.format(m.centerValue))
    );
    box.append(svg);

    $('#pieNote').textContent = m.rev <= 0
      ? 'Aucun revenu saisi : le camembert montre la répartition de vos charges.'
      : m.solde < -0.004
        ? `Vos charges dépassent vos revenus de ${eur0.format(-m.solde)} ${m.unit} : le camembert montre la répartition de vos charges.`
        : '';
  }

  /* ---------- Barres verticales (une par ligne, avec son libellé) ---------- */

  function wrapLabel(text, maxChars) {
    const clip = (l) => (l.length > maxChars ? `${l.slice(0, maxChars - 1)}…` : l);
    const lines = [];
    let cur = '';
    for (const w of text.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${w}` : w;
      if (!cur || next.length <= maxChars) cur = next;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    const out = lines.slice(0, 2).map(clip);
    if (lines.length > 2) out[1] = clip(`${out[1].replace(/…$/, '')}…`);
    return out;
  }

  const topRounded = (x, y, w, hgt, r) => {
    r = Math.min(r, hgt, w / 2);
    return `M${x} ${y + hgt} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + hgt} Z`;
  };

  function renderBars(m) {
    const box = $('#barChart');
    const tip = $('#barTip');
    const scroll = $('.chart-scroll');
    const legend = $('#barLegend');
    box.replaceChildren();
    legend.replaceChildren();
    tip.hidden = true;

    const { items } = m;
    if (!items.length) {
      box.append(h('p', { class: 'note' }, 'Ajoutez des revenus et des charges pour afficher le graphique.'));
      return;
    }

    // Légende : uniquement les catégories présentes
    for (const cat of [...REV_CATEGORIES, ...CATEGORIES]) {
      if (items.some((it) => it.cat === cat)) {
        legend.append(h('li', {}, h('span', { class: 'sw', style: `--c:${catColor(CAT_KEY[cat])}` }), cat));
      }
    }

    const hasBoth = items.some((i) => i.type === 'revenus') && items.some((i) => i.type === 'charges');
    const m0 = { t: 32, r: 12, b: 72, l: 64 };
    const avail = Math.max(300, Math.floor(scroll.clientWidth || 640));
    const gapUnits = hasBoth ? 0.6 : 0;
    const bw = clamp((avail - m0.l - m0.r) / (items.length + gapUnits), 80, 120);
    const gap = bw * gapUnits;
    const W = Math.max(avail, Math.ceil(m0.l + m0.r + bw * items.length + gap));
    const H = 340;
    const ih = H - m0.t - m0.b;
    const barW = Math.min(bw * 0.6, 48);

    const maxV = Math.max(...items.map((i) => i.value));
    const { max: yMax, step } = niceScale(maxV, 4);
    const Y = (v) => m0.t + ih - (v / yMax) * ih;
    const maxChars = Math.floor((bw - 8) / 6.4);

    const svg = s('svg', {
      viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group',
      'aria-label': `Graphique en barres : ${items.length} lignes, revenus puis charges, en euros ${m.unit}`
    });

    for (let v = 0; v <= yMax + 1e-9; v += step) {
      svg.append(
        s('line', { class: v === 0 ? 'g-axis' : 'g-line', x1: m0.l, x2: W - m0.r, y1: Y(v), y2: Y(v) }),
        s('text', { class: 'g-text', x: m0.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, eurCompact.format(v))
      );
    }
    svg.append(s('text', { class: 'g-text', x: 0, y: 12 }, `€ ${m.unit}`));

    const groups = {};
    let offset = 0;
    items.forEach((it, i) => {
      if (hasBoth && i > 0 && it.type !== items[i - 1].type) offset += gap;
      const x0 = m0.l + offset;
      const cx = x0 + bw / 2;
      offset += bw;
      const g = (groups[it.type] ||= { start: x0, end: x0 + bw, total: 0 });
      g.end = x0 + bw;
      g.total += it.value;

      const barH = (it.value / yMax) * ih;
      const y = m0.t + ih - barH;
      const bar = s('g', {
        class: 'bar', tabindex: '0', role: 'img',
        'aria-label': `${it.label}, ${it.cat} : ${eur2.format(it.value)} ${m.unit}`
      });
      bar.append(
        s('rect', { class: 'bar-hit', x: x0, y: m0.t, width: bw, height: ih, fill: 'transparent' }),
        s('path', { class: 'bar-mark', d: topRounded(cx - barW / 2, y, barW, Math.max(barH, 0.5), 4), style: `fill:${catColor(it.key)}` }),
        s('text', { class: 'g-val', x: cx, y: y - 6, 'text-anchor': 'middle' }, eur0.format(it.value))
      );

      const show = () => {
        tip.replaceChildren(
          h('div', { class: 'tip__head' }, it.label),
          h('div', { class: 'tip__row' }, h('span', { class: 'sw', style: `--c:${catColor(it.key)}` }), h('span', { class: 'lbl' }, `${it.cat} · ${it.type === 'revenus' ? 'revenu' : 'charge'}`)),
          h('div', { class: 'tip__row' }, h('span', { class: 'lbl' }, 'Par mois'), h('strong', {}, eur2.format(it.monthly))),
          h('div', { class: 'tip__row' }, h('span', { class: 'lbl' }, 'Par an (× 12)'), h('strong', {}, eur2.format(annual(it.monthly))))
        );
        tip.hidden = false;
        const right = cx + bw / 2 + 210 < W;
        tip.style.left = `${right ? cx + bw / 2 + 6 : cx - bw / 2 - 6}px`;
        tip.style.top = `${m0.t + 4}px`;
        tip.style.transform = right ? 'none' : 'translateX(-100%)';
      };
      bar.addEventListener('pointerenter', show);
      bar.addEventListener('focus', show);
      bar.addEventListener('pointerleave', () => { tip.hidden = true; });
      bar.addEventListener('blur', () => { tip.hidden = true; });
      svg.append(bar);

      // Libellé sous la barre
      const lines = wrapLabel(it.label, maxChars);
      const text = s('text', { class: 'g-xl', x: cx, y: m0.t + ih + 18, 'text-anchor': 'middle' });
      lines.forEach((l, li) => text.append(s('tspan', { x: cx, dy: li ? 14 : 0 }, l)));
      text.append(s('title', {}, it.label));
      svg.append(text);
    });

    // Légendes de groupe sous les libellés
    const captions = { revenus: 'REVENUS', charges: 'CHARGES' };
    for (const [type, g] of Object.entries(groups)) {
      const mid = (g.start + g.end) / 2;
      svg.append(
        s('line', { class: 'g-axis', x1: g.start + 6, x2: g.end - 6, y1: H - 26, y2: H - 26 }),
        s('text', { class: 'g-cap', x: mid, y: H - 9, 'text-anchor': 'middle' }, `${captions[type]} · ${eur0.format(g.total)}`)
      );
    }

    box.append(svg);
  }

  function bindSynthese() {
    const setView = (v) => { state.view = v; renderSynthese(); save(); };
    $('#viewMois').addEventListener('click', () => setView('mois'));
    $('#viewAn').addEventListener('click', () => setView('an'));

    if ('ResizeObserver' in window) {
      let lastW = 0;
      new ResizeObserver(() => {
        const w = Math.floor($('.chart-scroll').clientWidth);
        if (w && w !== lastW) { lastW = w; if (synModel) renderBars(synModel); }
      }).observe($('.chart-scroll'));
    }
  }

  /* ==========================================================================
     Résumé (tuiles du haut)
     ========================================================================== */

  function renderSummary() {
    const m = totalMonthly();
    const rev = totalRevenus();
    $('#kpiRevenus').textContent = eur2.format(rev);
    $('#kpiRevenusSub').textContent = `${eur2.format(annual(rev))} par an (× 12)`;
    setSigned($('#kpiSolde'), rev - m);
    $('#kpiSoldeSub').textContent = `${eur2.format(annual(rev - m))} par an`;
    $('#kpiMensuel').textContent = eur2.format(m);
    $('#kpiNbLignes').textContent = `${state.charges.length} ligne${state.charges.length > 1 ? 's' : ''}`;
    $('#kpiAnnuel').textContent = eur2.format(annual(m));

    const eco = computeSavings();
    $('#kpiEco').textContent = eur2.format(eco.annual);
    $('#kpiEcoSub').textContent = m > 0 && eco.monthly > 0
      ? `${eur2.format(eco.monthly)} / mois · ${pct1.format(eco.monthly / m)} de vos charges`
      : 'Ajoutez des comparaisons (partie 3)';

    const { years, results } = computeYield();
    const [low, high] = results;
    $('#kpiCapLabel').textContent = `Capital dans ${years} an${years > 1 ? 's' : ''} (${fmtRate(high.rate)})`;
    $('#kpiCap').textContent = eur0.format(high.pts[years].balance);
    $('#kpiCapSub').textContent = `à ${fmtRate(low.rate)} : ${eur0.format(low.pts[years].balance)}`;
  }

  /* ==========================================================================
     Thème
     ========================================================================== */

  function initTheme() {
    const saved = store.get(THEME_KEY);
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
    $('#themeBtn').addEventListener('click', () => {
      const current = document.documentElement.dataset.theme
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      store.set(THEME_KEY, next);
    });
  }

  /* ==========================================================================
     Démarrage
     ========================================================================== */

  /** Recalcule tout sauf le tableau des charges (pour ne pas perdre le focus pendant la saisie). */
  function refresh() {
    renderRevenusTotals();
    renderChargeTotals();
    renderScenarioForm();
    renderScenarios();
    renderYield();
    renderSummary();
    renderSynthese();
    save();
  }

  function init() {
    initTheme();
    renderLineForms();
    bindLines();
    bindScenarios();
    bindYield();
    bindSynthese();
    syncYieldInputs();
    renderLines('revenus');
    renderLines('charges');
    refresh();
  }

  init();
})();
