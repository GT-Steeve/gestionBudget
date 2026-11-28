/* ==========================================================================
   Gestion budget — simulateur de placement (page Placement)
   Construire un placement long terme en 3 étapes, puis un Aperçu :
   1. Objectif : épargne de départ, versement mensuel (bouton Exemple et
      « Simuler avec mes économies mensuelles »), durée,
      rendement hypothétique ; courbe du plan.
   2. Produits : catalogue d'ETF et d'actions (placement-data.js), fiches,
      produits créés ou modifiés.
   3. Répartition : montant au départ et par mois sur chaque produit.
   Aperçu : liste d'achats et exposition (sociétés, secteurs, pays).
   Données dans le budget actif : state.yield (capital, versement, annees,
   taux2 = rendement, aussi lus par la Synthèse et le rapport) et
   state.placement (voir state.js). Démarré par script.js (Placement.init).
   ========================================================================== */
'use strict';

(() => {
  const { $, openModal, closeModal, confirmDialog, eur0, eur2 } = UI;
  const { num, clamp, MAX_RATE } = BudgetState;
  const { META, CATALOG } = PlacementData;

  const PAL = ['var(--series-1)', 'var(--series-2)', 'var(--cat-salaire)', 'var(--cat-courses)',
    'var(--cat-abonnements)', 'var(--cat-transport)', 'var(--cat-assurance)', 'var(--cat-plaisir)'];
  const GREY = { Autres: 'var(--muted)', 'Non renseigné': 'var(--axis)', 'Non investi': 'var(--neutral-fill)' };
  const FIXED = ['Autres', 'Non renseigné', 'Non investi'];
  const STEPS = ['plan', 'supports', 'montants', 'panorama'];

  let api = null; // { state, save, computeSavings }
  const ui = { view: 'plan', filter: 'ETF', q: '', all: {}, undo: null };

  /* ---------- Utilitaires ---------- */

  const { esc, pct } = Fiche;
  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
  const ckey = (n) => n.replace(/ [AC]$/, ''); // Alphabet A et C regroupés
  const logo = (s) => `<span class="pf-logo" style="background:${esc(s.color || '#445')}">${esc(s.logo || s.name.slice(0, 2))}</span>`;

  const Y = () => api.state.yield;
  const PL = () => api.state.placement;
  const catalog = () => [...CATALOG, ...PL().custom].map((s) => ({ ...s, ...(PL().edits[s.id] || {}) }));
  const byId = (id) => catalog().find((s) => s.id === id);
  const save = () => api.save();

  /** Plan en cours : champs de state.yield (aussi lus par la Synthèse). */
  const plan = () => {
    const y = Y();
    return { capital: y.capital, monthly: y.versement, years: y.annees, rate: y.taux2 };
  };
  const FIELDS = {
    capital: ['yield', 'capital'], monthly: ['yield', 'versement'], years: ['yield', 'annees'], rate: ['yield', 'taux2']
  };
  function setPlan(key, raw) {
    let v = num(raw);
    if (key === 'years') v = clamp(Math.round(v) || 1, 1, 50);
    else if (key === 'rate') v = clamp(v, 0, MAX_RATE);
    const [obj, field] = FIELDS[key];
    api.state[obj][field] = v;
    Y().anneeGain = clamp(Y().anneeGain, 1, Y().annees);
    save();
  }
  const ecoMonthly = () => Math.round(api.computeSavings().monthly * 100) / 100;

  let toastTimer = 0;
  function toast(message) {
    let el = $('#pfToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pfToast';
      el.className = 'pf-toast';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }

  /* ---------- Navigation entre les étapes ---------- */

  function header() {
    for (const v of STEPS) {
      const btn = $(`#pfStep-${v}`);
      btn.classList.toggle('is-on', ui.view === v);
      if (ui.view === v) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
    }
  }

  function navBar() {
    const n = PL().items.length;
    const back = (to) => `<button type="button" class="btn btn--ghost pf-navbar__back" data-go="${to}" aria-label="Retour">‹<span class="pf-navbar__txt"> Retour</span></button>`;
    const left = { plan: '', supports: back('plan'), montants: back('supports') }[ui.view];
    const right = {
      plan: '<button type="button" class="btn" data-go="supports">Suivant ›</button>',
      supports: `<span class="pf-navbar__count">${plural(n, 'produit')} choisi${n > 1 ? 's' : ''}</span><button type="button" class="btn" data-go="montants">Suivant ›</button>`,
      montants: '<button type="button" class="btn" id="pfValid" data-act="valid" disabled>En attente de placement</button>'
    }[ui.view];
    return `<nav class="pf-navbar" aria-label="Navigation entre les étapes"><div>${left}</div><div class="pf-navbar__r">${right}</div></nav>`;
  }

  function totals() {
    const it = PL().items;
    return { init: it.reduce((a, i) => a + i.init, 0), monthly: it.reduce((a, i) => a + i.monthly, 0) };
  }
  function budgetOk() {
    const t = totals();
    const p = plan();
    if (t.init > p.capital + 1e-9 || t.monthly > p.monthly + 1e-9) {
      toast('Le montant affecté dépasse le budget : corrigez-le dans Répartition.');
      return false;
    }
    return true;
  }

  function validate() {
    PL().validated = new Date().toISOString();
    save();
    go('panorama');
  }

  /** Tout est-il placé (rien à affecter, rien en trop) ? Le bouton du bas de
      l'étape Répartition reste « En attente de placement » tant que non. */
  function allPlaced() {
    const t = totals();
    const p = plan();
    return PL().items.length > 0 && Math.abs(p.capital - t.init) < 0.005 && Math.abs(p.monthly - t.monthly) < 0.005;
  }
  function updateValid() {
    const btn = $('#pfValid');
    if (!btn) return;
    const t = totals();
    const p = plan();
    const over = t.init > p.capital + 0.005 || t.monthly > p.monthly + 0.005;
    const ok = allPlaced();
    btn.disabled = !ok;
    btn.textContent = ok ? 'Valider le placement' : over ? 'Budget dépassé' : 'En attente de placement';
  }

  /** Répartit l'épargne de départ et le versement mensuel à parts égales
      entre les produits choisis (au centime ; le reste sur le dernier). */
  function splitEqually() {
    const it = PL().items;
    if (!it.length) return;
    const p = plan();
    for (const key of ['init', 'monthly']) {
      const total = Math.round((key === 'init' ? p.capital : p.monthly) * 100);
      const part = Math.floor(total / it.length);
      it.forEach((item, k) => { item[key] = (k === it.length - 1 ? total - part * (it.length - 1) : part) / 100; });
    }
    save();
    render();
    toast('Montants répartis à parts égales.');
  }

  let chartObserver = null;
  function render() {
    chartObserver?.disconnect();
    chartObserver = null;
    header();
    ({ plan: vPlan, supports: vSupports, montants: vMontants, panorama: vPanorama })[ui.view]();
    if (ui.view !== 'panorama') $('#pfView').insertAdjacentHTML('beforeend', navBar());
    updateValid();
  }
  function go(v, focus) {
    ui.view = v;
    render();
    $('#placement').scrollIntoView({ block: 'start' });
    const target = focus ? $(focus) : $('#pfTitle');
    target?.focus({ preventScroll: true });
  }

  const head = (kick, title, lead) => `<div class="pf-head"><p class="pf-kick">${kick}</p>
    <h2 id="pfTitle" class="pf-title" tabindex="-1">${title}</h2><p class="lead">${lead}</p></div>`;

  /* ---------- Étape 1 · Objectif ---------- */

  function vPlan() {
    const p = plan();
    const eco = ecoMonthly();
    const field = (k, label, extra = '') => `<label>${label}
      <input id="pf-${k}" data-k="${k}" type="number" min="0" step="any" inputmode="decimal" value="${p[k]}"${extra}></label>`;
    $('#pfView').innerHTML = `${head('Étape 1 · Objectif', '<span id="pfPlanTitle"></span>',
      'Fixez les versements, l\'horizon et un rendement hypothétique. Le calcul se met à jour en direct.')}
    <div class="pf-plan">
      <form class="pf-plan__form" id="pfPlanForm" novalidate>
        ${field('capital', 'Épargne de départ (€)')}
        <label>Versement mensuel (€)
          <span class="input-with-btn">
            <input id="pf-monthly" data-k="monthly" type="number" min="0" step="any" inputmode="decimal" value="${p.monthly}">
            <button type="button" id="btnExemple" class="btn btn--sm input-with-btn__btn" data-act="exemple">
              <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.7.6 1.2v.6h4v-.6c0-.5.2-.9.6-1.2A4.5 4.5 0 0 0 8 1.5Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><line x1="6.2" y1="13.5" x2="9.8" y2="13.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="6.6" y1="15" x2="9.4" y2="15" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
              Exemple
            </button>
          </span>
        </label>
        <button type="button" id="btnUseEco" class="btn btn--ghost pf-plan__eco" data-act="eco"${eco > 0 ? '' : ' disabled'}
          title="${eco > 0 ? `Mettre ${esc(eur2.format(eco))} par mois en épargne` : 'Ajoutez d\'abord une économie dans la page Économie'}">Simuler avec mes économies mensuelles</button>
        <div class="pf-pair">
          ${field('years', 'Durée (années)', ' max="50" step="1" inputmode="numeric"')}
          ${field('rate', 'Rendement annuel (%)', ` max="${MAX_RATE}"`)}
        </div>
      </form>
      <div class="pf-plan__out">
        <div class="pf-res" id="pfRes"></div>
        <div class="pf-fig" id="pfChart"></div>
        <p class="note" id="pfPlanNote"></p>
      </div>
    </div>`;
    $('#pfPlanForm').addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.k) setPlan(t.dataset.k, t.value);
      planOut();
    });
    planOut();
    if ('ResizeObserver' in window) {
      chartObserver = new ResizeObserver(drawChart);
      chartObserver.observe($('#pfChart'));
    }
  }

  function planOut() {
    const p = plan();
    const sim = Calc.simulatePlan(p);
    const end = sim.at(p.years);
    const rate = pct(p.rate).replace(',0 ', ' ');
    $('#pfPlanTitle').innerHTML = `À ${esc(rate)} par an, que devient <em>ce plan</em> ?`;
    const tile = (label, value, accent, sub = '') => `<div class="tile"><div class="tile__body"><p class="tile__label">${label}</p>
      <p class="tile__value${accent ? ' pf-accent' : ''}">${value}</p>${sub ? `<p class="tile__sub">${sub}</p>` : ''}</div></div>`;
    const ratio = end.paid ? (end.v / end.paid).toFixed(1).replace('.', ',') : '0';
    $('#pfRes').innerHTML = tile(`Versés en ${plural(p.years, 'an')}`, eur0.format(end.paid), false)
      + tile('Valeur estimée du compte', `≈ ${eur0.format(Math.round(end.v / 100) * 100)}`, true)
      + tile('Intérêts composés', eur0.format(end.v - end.paid), false, `×${ratio} la mise`);
    $('#pfPlanNote').textContent = `Calcul personnel · ${pct(p.rate)} par an constant, capitalisé chaque mois · hypothèse, pas promesse.`;
    drawChart();
  }

  function drawChart() {
    const box = $('#pfChart');
    if (!box) return;
    const W = Math.floor(box.clientWidth);
    if (!W) return;
    const p = plan();
    const sim = Calc.simulatePlan(p);
    const pts = sim.pts;
    const narrow = W < 520;
    const H = narrow ? 260 : 320;
    const L = narrow ? 48 : 70;
    const R = narrow ? 16 : 150;
    const T = 20;
    const B = 30;
    const max = Math.max(...pts.map((d) => d.v)) * 1.05 || 1;
    const n = pts.length - 1 || 1;
    const x = (m) => L + (W - L - R) * m / n;
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const line = (k) => pts.map((d, i) => `${i ? 'L' : 'M'}${x(d.m).toFixed(1)} ${y(d[k]).toFixed(1)}`).join('');
    const { step } = UI.niceScale(max, 4);
    const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
    let g = `<line class="g-axis" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
    for (let v = step; v < max; v += step) {
      g += `<line class="g-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="g-text" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${narrow ? `${compact.format(v)} €` : eur0.format(v)}</text>`;
    }
    const yrs = sim.total;
    [0, Math.round(yrs / 3), Math.round(2 * yrs / 3), yrs].forEach((t) => {
      g += `<text class="g-text" x="${x(t * 12)}" y="${H - 8}" text-anchor="middle">${t ? `${t} ans` : 'Aujourd\'hui'}</text>`;
    });
    const e = pts[pts.length - 1];
    g += `<path class="s-line s-dep" d="${line('paid')}"/><path class="s-line s-pf" d="${line('v')}"/>
      <circle class="dot s-pf" cx="${x(e.m)}" cy="${y(e.v)}" r="5"/><circle class="dot s-dep" cx="${x(e.m)}" cy="${y(e.paid)}" r="4"/>`;
    if (!narrow) {
      const yv = y(e.v);
      const yp = Math.max(y(e.paid), yv + 48);
      g += `<text class="pf-chart__big" x="${x(e.m) + 14}" y="${yv + 6}">≈ ${esc(compact.format(e.v))} €</text>
        <text class="g-text" x="${x(e.m) + 14}" y="${yv + 22}">valeur du compte</text>
        <text class="pf-chart__mid" x="${x(e.m) + 14}" y="${Math.min(yp + 6, H - B)}">${eur0.format(e.paid)}</text>
        <text class="g-text" x="${x(e.m) + 14}" y="${Math.min(yp + 22, H - B + 14)}">versés</text>`;
    }
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
      aria-label="Valeur du compte et total versé sur ${yrs} ans : environ ${esc(eur0.format(e.v))} pour ${esc(eur0.format(e.paid))} versés">${g}</svg>
      <ul class="legend pf-legend" aria-hidden="true"><li><span class="key pf-key"></span>Valeur du compte</li><li><span class="key key--dep"></span>Versés</li></ul>`;
  }

  /* ---------- Étape 2 · Produits ---------- */

  const norm = (t) => String(t || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '');

  function vSupports() {
    $('#pfView').innerHTML = `${head('Étape 2 · Produits', 'Choisir les <em>produits</em>',
      'Ouvrez une fiche pour voir sa performance et ses 10 premières sociétés, puis ajoutez-la au portefeuille.')}
    <div class="pf-tools">
      <div class="pf-seg" role="group" aria-label="Type de produit">${[['ETF', 'ETF'], ['Action', 'Actions'], ['Obligation', 'Obligations'], ['Tous', 'Tous']]
        .map(([f, l]) => `<button type="button" data-f="${f}" aria-pressed="${ui.filter === f}">${l}</button>`).join('')}</div>
      <label class="pf-search"><span class="sr-only">Rechercher un produit</span>
        <input id="pfQ" type="search" placeholder="Nom, ticker ou ISIN" value="${esc(ui.q)}"></label>
    </div>
    <div class="pf-grid" id="pfGrid"></div>`;
    renderGrid();
    $('#pfQ').addEventListener('input', (e) => { ui.q = e.target.value; renderGrid(); });
    $('#pfView .pf-seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      ui.filter = b.dataset.f;
      $('#pfView .pf-seg').querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderGrid();
    });
  }

  function renderGrid() {
    const sel = new Set(PL().items.map((i) => i.id));
    const q = norm(ui.q.trim());
    const list = catalog()
      .filter((s) => (ui.filter === 'Tous' || s.type === ui.filter) && (!q || norm([s.name, s.ticker, s.isin].join(' ')).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
    $('#pfGrid').innerHTML = list.map((s) => `<div class="pf-card${sel.has(s.id) ? ' is-sel' : ''}" tabindex="0" role="button" data-open="${esc(s.id)}" aria-label="${esc(s.name)}, ${esc(s.type)}${sel.has(s.id) ? ', dans le portefeuille' : ''} : ouvrir la fiche">
      <div class="pf-card__top"><h3>${esc(s.name)}</h3><span class="pf-badge pf-badge--${{ Action: 'act', Obligation: 'obl' }[s.type] || 'etf'}">${esc(s.badge || s.type)}</span></div>
      <p>${esc(s.desc)}</p>
      <div class="pf-card__ft"><span>${esc(s.ticker || s.isin)}</span>${sel.has(s.id) ? '<span class="pf-inpf">Dans le portefeuille</span>' : ''}</div></div>`).join('')
      || '<p class="pf-empty">Aucun produit ne correspond à cette recherche.</p>';
  }

  /* ---------- Fenêtre (fiche, formulaire) ---------- */

  let modalClose = null;
  function modal(html, focusSel) {
    const overlay = $('#pfModal');
    const box = overlay.querySelector('.modal');
    box.innerHTML = html;
    modalClose = openModal(overlay, { onClose: () => { modalClose = null; } });
    (focusSel ? box.querySelector(focusSel) : box.querySelector('button, input'))?.focus();
  }
  const closePf = () => modalClose?.();
  const X_BTN = Fiche.closeBtn;

  function fiche(id) {
    const s = byId(id);
    if (!s) return;
    const inPf = PL().items.some((i) => i.id === id);
    const { html, src } = Fiche.body(s);
    modal(`${X_BTN('data-close', 'Fermer')}<div class="pf-modal__body">${html}
    <div class="pf-mfoot">${src}<div class="pf-sp"></div>
      ${id.startsWith('cu-') ? `<button type="button" class="btn btn--sm btn--ghost btn--ghost-danger" data-rmcustom="${esc(id)}">Supprimer</button>` : ''}
      ${inPf ? `<button type="button" class="btn btn--sm btn--ghost btn--ghost-danger" data-unpick="${esc(id)}">Retirer du portefeuille</button>` : `<button type="button" class="btn btn--sm" data-add="${esc(id)}">+ Ajouter au portefeuille</button>`}
    </div></div>`, '.pf-modal__x');
  }

  /* ---------- Étape 3 · Répartition ---------- */

  function vMontants() {
    const it = PL().items;
    const rows = it.map((i, k) => {
      const s = byId(i.id) || { name: 'Produit supprimé', ticker: '' };
      const amt = (key, label) => `<td class="num" data-label="${label}"><span class="pf-amt"><input aria-label="${label}, ${esc(s.name)}" type="number" min="0" step="any" inputmode="decimal" data-i="${k}" data-k="${key}" value="${i[key]}"><span aria-hidden="true">€</span></span></td>`;
      return `<tr><td><span class="pf-nm">${logo(s)}<span><b>${esc(s.name)}</b><small>${esc(s.ticker || s.isin)}</small></span></span></td>
        ${amt('init', 'Au départ')}${amt('monthly', 'Par mois')}
        <td class="num"><button type="button" class="btn btn--sm btn--ghost btn--ghost-danger" data-rm="${k}" aria-label="Retirer ${esc(s.name)}">Retirer</button></td></tr>`;
    }).join('') || '<tr><td colspan="4" class="empty">Aucun produit choisi. Ajoutez-en depuis l\'étape Produits.</td></tr>';
    const undo = ui.undo ? `<button type="button" class="btn btn--sm btn--ghost" data-act="undo">Annuler le retrait de ${esc(byId(ui.undo.item.id)?.name || 'ce produit')}</button>` : '';
    $('#pfView').innerHTML = `${head('Étape 3 · Répartition', 'Répartir les <em>montants</em>',
      'Indiquez ce que vous placez au départ et chaque mois sur chaque produit.')}
    <div class="pf-cnt"><div class="tile" id="pfCntInit"></div><div class="tile" id="pfCntMon"></div></div>
    ${it.length ? '<div class="pf-split"><button type="button" class="btn btn--sm btn--ghost" data-act="split">Répartir équitablement</button></div>' : ''}
    <div class="table-wrap"><table class="table pf-tbl">
      <caption class="sr-only">Montants affectés à chaque produit</caption>
      <thead><tr><th scope="col">Produits choisis</th><th scope="col" class="num">Au départ</th><th scope="col" class="num">Par mois</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="pf-below"><button type="button" class="btn btn--sm btn--ghost" data-go="supports">+ Ajouter un produit</button>${undo}</div>`;
    counters();
    $('#pfView tbody').addEventListener('input', (e) => {
      const t = e.target;
      if (!t.dataset.k) return;
      it[+t.dataset.i][t.dataset.k] = num(t.value);
      save();
      counters();
    });
  }

  function counters() {
    const t = totals();
    const p = plan();
    const c = (el, label, budget, used) => {
      const left = budget - used;
      const neg = left < -1e-9;
      el.classList.toggle('pf-cnt--neg', neg);
      el.innerHTML = `<div class="tile__body"><p class="tile__label">${label} · ${eur2.format(budget)}</p>
        <p class="tile__value pf-accent">${eur2.format(left)} <span class="tile__unit">à affecter</span></p>
        <div class="pf-prog"><div style="width:${budget ? Math.min(100, used / budget * 100) : 0}%"></div></div>
        ${neg ? `<p class="pf-err">Dépassement de ${eur2.format(-left)} : réduisez un montant.</p>` : ''}</div>`;
      return neg;
    };
    const a = c($('#pfCntInit'), 'Épargne', p.capital, t.init);
    const b = c($('#pfCntMon'), 'Mensuel', p.monthly, t.monthly);
    document.querySelectorAll('.pf-amt input').forEach((i) => i.classList.toggle('is-bad', (i.dataset.k === 'init' && a) || (i.dataset.k === 'monthly' && b)));
    updateValid();
  }

  /* ---------- Aperçu ---------- */

  /** Exposition sur toute la durée du plan : montant d'un produit = départ +
      mensuel × 12 × durée ; budget = épargne de départ + versement × 12 × durée. */
  function exposure() {
    const p = plan();
    const months = Math.round(p.years) * 12;
    const amt = (init, monthly) => init + monthly * months;
    const budget = amt(p.capital, p.monthly);
    if (!budget) return null;
    const acc = { sec: {}, pays: {}, soc: {} };
    const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };
    let used = 0;
    for (const i of PL().items) {
      const s = byId(i.id);
      const a = amt(i.init, i.monthly);
      if (!s || !a) continue;
      used += a;
      const w = a / budget * 100;
      const edited = !!(PL().edits[s.id] || {}).top10;
      const C = s.countries && !edited;
      const SE = s.sectors && !edited;
      let covered = 0;
      for (const [n, wt, c, sec] of s.top10) {
        const part = w * wt / 100;
        const m = META[ckey(n)] || [];
        covered += wt;
        add(acc.soc, ckey(n), part);
        if (!C) add(acc.pays, c || m[0] || s.rest || 'Non renseigné', part);
        if (!SE) add(acc.sec, sec || m[1] || 'Non renseigné', part);
      }
      const rest = w * Math.max(0, 100 - covered) / 100;
      if (rest > 0) {
        add(acc.soc, s.top10.length ? 'Autres' : 'Non renseigné', rest);
        if (!C) add(acc.pays, s.rest || 'Non renseigné', rest);
        if (!SE) add(acc.sec, 'Non renseigné', rest);
      }
      if (C) for (const [k, v] of s.countries) add(acc.pays, k, w * v / 100);
      if (SE) for (const [k, v] of s.sectors) add(acc.sec, k, w * v / 100);
    }
    const left = Math.max(0, (budget - used) / budget * 100);
    if (left > 0.001) for (const o of Object.values(acc)) o['Non investi'] = left;
    return { acc, used, budget, left: budget - used };
  }

  function pieList(obj, key) {
    const named = Object.entries(obj).filter(([k]) => !FIXED.includes(k)).sort((a, b) => b[1] - a[1]);
    const lim = ui.all[key] ? named.length : 6;
    const rows = named.slice(0, lim).map(([k, v], i) => ({ k, v, c: PAL[i % PAL.length] }));
    const autres = (obj.Autres || 0) + named.slice(lim).reduce((a, [, v]) => a + v, 0);
    if (autres > 0.001) rows.push({ k: 'Autres', v: autres, c: GREY.Autres, g: 1 });
    for (const k of FIXED.slice(1)) if (obj[k] > 0.001) rows.push({ k, v: obj[k], c: GREY[k], g: 1 });
    return rows;
  }

  function pieSvg(rows, label) {
    const tot = rows.reduce((a, r) => a + r.v, 0) || 1;
    const R = 0.78;
    const C = 2 * Math.PI * R;
    let off = 0;
    let out = '';
    for (const r of rows) {
      const len = r.v / tot * C;
      out += `<circle r="${R}" fill="none" stroke-width="0.4" style="stroke:${r.c}" stroke-dasharray="${len.toFixed(4)} ${(C - len).toFixed(4)}" stroke-dashoffset="${(-off).toFixed(4)}" transform="rotate(-90)"><title>${esc(r.k)} · ${esc(pct(r.v))}</title></circle>`;
      off += len;
    }
    const top = rows.find((r) => !r.g) || rows[0];
    const name = top.k.length > 16 ? `${top.k.slice(0, 15)}…` : top.k;
    return `<svg class="pf-pie" viewBox="-1 -1 2 2" role="img" aria-label="${esc(label)} : ${esc(top.k)} ${esc(pct(top.v))} en tête">${out}
      <text class="pf-pie__v" y="-0.02" text-anchor="middle" font-size="0.26">${esc(pct(top.v))}</text><text class="pf-pie__k" y="0.2" text-anchor="middle" font-size="0.12">${esc(name)}</text></svg>`;
  }

  /** Aperçu validé avec des sommes non réparties : encadré qui les rappelle,
      avec un lien vers l'étape Répartition. */
  function leftNotice() {
    const t = totals();
    const p = plan();
    const parts = [];
    if (p.capital - t.init > 0.005) parts.push(`${eur2.format(p.capital - t.init)} de l'épargne de départ`);
    if (p.monthly - t.monthly > 0.005) parts.push(`${eur2.format(p.monthly - t.monthly)} par mois`);
    if (!parts.length) return '';
    return `<div class="pf-notice" role="note"><p><strong>Il reste des sommes à répartir :</strong> ${parts.join(' et ')}.
      Elles apparaissent en « Non investi » ci-dessous.</p>
      <button type="button" class="btn btn--sm btn--ghost" data-go="montants">Répartir le reste</button></div>`;
  }

  function recap() {
    const rows = PL().items.map((i) => ({ s: byId(i.id), i })).filter((r) => r.s);
    if (!rows.length) return '';
    const t = totals();
    return `<section class="pf-panel" aria-labelledby="pfRecapTitle"><h3 class="h3" id="pfRecapTitle">Vos placements</h3>
      <p class="pf-small">Liste d'achats à passer chez votre courtier.</p>
      <div class="table-wrap"><table class="table table--compact pf-recap">
      <thead><tr><th scope="col">Produit</th><th scope="col">Ticker</th><th scope="col" class="num">Au départ</th><th scope="col" class="num">Par mois</th></tr></thead>
      <tbody>${rows.map(({ s, i }) => `<tr><td>${esc(s.name)}</td><td>${esc(s.ticker || s.isin)}</td><td class="num">${eur2.format(i.init)}</td><td class="num">${eur2.format(i.monthly)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">Total</th><td></td><td class="num">${eur2.format(t.init)}</td><td class="num">${eur2.format(t.monthly)}</td></tr></tfoot></table></div></section>`;
  }

  function vPanorama() {
    const p = plan();
    const yrs = Math.round(p.years);
    const ex = exposure();
    const cards = [['soc', 'Sociétés'], ['sec', 'Secteurs'], ['pays', 'Pays']];
    const sub = ex ? `${eur0.format(ex.used)} investis sur ${plural(yrs, 'an')} (épargne de départ + versements mensuels)` : 'Aucun budget défini à l\'étape Objectif.';
    const pans = ex && ex.used ? `<div class="pf-pans">${cards.map(([k, l]) => {
      const rows = pieList(ex.acc[k], k);
      return `<section class="pf-panel pf-pan" aria-label="${l}"><div class="pf-pan__h"><h4>${l}</h4><button type="button" class="btn btn--sm btn--ghost" data-all="${k}">${ui.all[k] ? 'Réduire' : 'Tout voir'}</button></div>
        ${pieSvg(rows, l)}<ul class="pf-leg">${rows.map((r) => `<li${r.g ? ' class="is-grey"' : ''}><span style="background:${r.c}"></span>${esc(r.k)}<b>${esc(pct(r.v))}</b></li>`).join('')}</ul></section>`;
    }).join('')}</div>` : '<p class="pf-panel pf-empty">Aucun montant n\'est encore affecté. Passez par l\'étape Répartition.</p>';
    $('#pfView').innerHTML = `${head('Aperçu', 'Le portefeuille <em>en un regard</em>', esc(sub))}
      ${leftNotice()}
      ${recap()}
      <div class="pf-exp-h"><h3 class="h3">Exposition du placement</h3><span class="pf-small">Épargne de départ ${eur0.format(p.capital)} + ${eur0.format(p.monthly)} par mois pendant ${plural(yrs, 'an')}</span></div>
      ${pans}
      <p class="note">Pays et secteurs : répartition publiée par justETF pour chaque fonds · Sociétés : top 10 seulement, le reste en « Autres » · Hors levier · Données manquantes en gris.</p>`;
  }

  /* ---------- Événements ---------- */

  function onClick(e) {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'apercu') { if (budgetOk()) go('panorama'); }
      else if (a === 'valid') { if (allPlaced()) validate(); }
      else if (a === 'split') splitEqually();
      else if (a === 'exemple') openModal($('#exampleOverlay'), { focus: '#exampleClose' });
      else if (a === 'eco') {
        const eco = ecoMonthly();
        if (eco > 0) { setPlan('monthly', eco); $('#pf-monthly').value = eco; planOut(); }
      } else if (a === 'undo' && ui.undo) {
        PL().items.splice(ui.undo.k, 0, ui.undo.item);
        ui.undo = null;
        save();
        render();
      }
      return;
    }
    const t = e.target.closest('[data-go],[data-open],[data-close],[data-add],[data-unpick],[data-rmcustom],[data-rm],[data-all]');
    if (!t) return;
    const d = t.dataset;
    if (d.go) { closePf(); go(d.go); }
    else if (d.open) fiche(d.open);
    else if ('close' in d) closePf();
    else if (d.add) {
      if (!PL().items.some((i) => i.id === d.add)) PL().items.push({ id: d.add, init: 0, monthly: 0 });
      save();
      closePf();
      toast('Produit ajouté. Indiquez le montant à lui affecter.');
      render();
    } else if (d.unpick) {
      // Retrait depuis la fiche : comme « Retirer » de l'étape Répartition,
      // annulable depuis cette étape (montants affectés conservés).
      const it = PL().items;
      const k = it.findIndex((i) => i.id === d.unpick);
      if (k >= 0) {
        ui.undo = { item: it[k], k };
        it.splice(k, 1);
        save();
      }
      closePf();
      toast('Produit retiré du portefeuille.');
      render();
    } else if (d.rmcustom) {
      const id = d.rmcustom;
      confirmDialog('Supprimer ce produit ?', [['Produit', byId(id)?.name || '']], () => {
        PL().custom = PL().custom.filter((s) => s.id !== id);
        PL().items = PL().items.filter((i) => i.id !== id);
        delete PL().edits[id];
        save();
        closePf();
        toast('Produit supprimé.');
        render();
      }, { center: true });
    } else if (d.rm) {
      const k = +d.rm;
      const it = PL().items;
      ui.undo = { item: it[k], k };
      it.splice(k, 1);
      save();
      render();
    } else if (d.all) {
      ui.all[d.all] = !ui.all[d.all];
      render();
    }
  }

  /** Exemples (pop-up #exampleOverlay) : épargne, durée et rendements. Le
      rendement le plus haut devient le rendement du plan (taux2). */
  function bindExamples() {
    const overlay = $('#exampleOverlay');
    $('#exampleClose').addEventListener('click', () => closeModal(overlay));
    overlay.querySelectorAll('.example-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const y = Y();
        y.versement = num(btn.dataset.mensuel);
        y.annees = clamp(Math.round(num(btn.dataset.annees)) || 1, 1, 50);
        const rates = [num(btn.dataset.taux1), num(btn.dataset.taux2)].map((r) => clamp(r, 0, MAX_RATE)).sort((a, b) => a - b);
        [y.taux1, y.taux2] = rates;
        y.anneeGain = clamp(y.anneeGain, 1, y.annees);
        save();
        closeModal(overlay);
        go('plan', '#pf-monthly');
      });
    });
  }

  window.Placement = {
    init(deps) {
      if (!$('#placement')) return;
      api = deps;
      $('#placement').addEventListener('click', onClick);
      $('#pfModal').addEventListener('click', onClick);
      document.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.open) { e.preventDefault(); fiche(e.target.dataset.open); }
      });
      bindExamples();
      render();
    }
  };
})();
