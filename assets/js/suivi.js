/* ==========================================================================
   Gestion budget — page Suivi : calendrier du mois, une case par jour.
   - Revenus et charges : mensuels, ils reviennent chaque mois au jour de leur
     ajout (à partir du mois d'ajout ; le 1er du mois pour une ligne sans date).
   - Dépenses : au jour de leur ajout, mois en cours et mois archivés.
   - Solde : dans chaque case, le solde en fin de journée (celui de la veille
     plus tous les évènements du jour ; chaque mois part de 0 €), affiché
     seulement s'il a changé depuis la veille.
   - Case : une pastille par type présent (plusieurs évènements du même type
     n'en font qu'une, avec leur total) et, sur la ligne du numéro, le cumul
     du jour (revenus − charges − dépenses), masqué s'il est nul ; le solde
     passe alors sur la ligne en dessous.
   Toucher un jour avec activité agrandit sa case en pop-up (effet de zoom
   depuis la case) avec le détail : évènements, total (dès deux évènements)
   et solde du jour.
   Un filtre (cases à cocher) choisit les évènements affichés ; il est
   mémorisé dans ce navigateur. Page en lecture seule : rien n'est enregistré.
   ========================================================================== */
'use strict';

(() => {
  const { $, h, eur2, capitalize, openModal } = UI;
  const STORAGE_KEY = Profiles.dataKey();
  // Types décochés (et non cochés) : un type ajouté plus tard au filtre s'affiche par défaut.
  const FILTER_KEY = 'gestion-budget-suivi-masques';

  /** Types d'évènements : libellé (singulier, pluriel), signe du montant. L'ordre est celui d'affichage. */
  const TYPES = {
    revenu: { label: 'Revenu', plural: 'revenus', sign: 1 },
    charge: { label: 'Charge', plural: 'charges', sign: -1 },
    depense: { label: 'Dépense', plural: 'dépenses', sign: -1 }
  };

  const store = {
    get(key) {
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
    }
  };

  /* ---------- Données ---------- */

  const saved = store.get(STORAGE_KEY);
  const profil = Profiles.active();
  // Même règle que script.js : profil d'exemple ou pré-rempli jamais ouvert → budget fictif.
  const state = !saved && (profil.exemple || profil.preRempli) ? BudgetState.exampleState() : BudgetState.load(saved);

  // Un autre onglet modifie ce profil ou change de profil : on recharge.
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === STORAGE_KEY || STORAGE_KEY !== Profiles.dataKey()) location.reload();
  });

  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
  const parseDate = (iso) => (iso ? new Date(iso) : null);
  /** Premier jour du mois « AAAA-MM ». */
  const fromKey = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1); };

  /** Dépenses datées, mois en cours et historique (sans date : le 1er de leur mois). */
  const depenses = [
    ...state.depenses.map((d) => ({ ...d, mois: state.depensesMoisCourant })),
    ...state.depensesHistorique.flatMap((m) => m.items.map((d) => ({ ...d, mois: m.mois })))
  ].map((d) => ({ item: d, date: parseDate(d.ajout) || fromKey(d.mois) }));

  /** Évènements du mois (y, m) regroupés par jour : { [jour]: [{ type, nom, categorie, montant }] }. */
  function eventsOf(y, m, filter) {
    const byDay = {};
    const push = (day, ev) => { (byDay[day] ||= []).push(ev); };
    const last = daysIn(y, m);
    const monthStart = new Date(y, m, 1);

    const recurring = (list, type) => {
      if (!filter.has(type)) return;
      list.forEach((x) => {
        const added = parseDate(x.ajout);
        // Avant son mois d'ajout, la ligne n'existait pas encore.
        if (added && new Date(added.getFullYear(), added.getMonth(), 1) > monthStart) return;
        push(Math.min(added ? added.getDate() : 1, last), { type, nom: x.nom, categorie: x.categorie, montant: x.mensuel });
      });
    };
    recurring(state.revenus, 'revenu');
    recurring(state.charges, 'charge');

    if (filter.has('depense')) {
      depenses.forEach(({ item, date }) => {
        if (date.getFullYear() !== y || date.getMonth() !== m) return;
        push(date.getDate(), { type: 'depense', nom: item.nom, categorie: item.categorie, montant: item.montant });
      });
    }

    const order = Object.keys(TYPES);
    Object.values(byDay).forEach((list) => list.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)));
    return byDay;
  }

  /* ---------- Filtre ---------- */

  const checks = [...document.querySelectorAll('.cal-filter input[type="checkbox"]')];
  const savedFilter = store.get(FILTER_KEY);
  if (Array.isArray(savedFilter)) checks.forEach((c) => { c.checked = !savedFilter.includes(c.value); });
  const currentFilter = () => new Set(checks.filter((c) => c.checked).map((c) => c.value));

  /* ---------- Affichage ---------- */

  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth();
  let selected = today.getDate();

  const fmtTitle = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
  const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const signed = (ev) => `${TYPES[ev.type].sign > 0 ? '+' : '−'}${eur2.format(ev.montant)}`;
  /** Variation du jour : somme signée des évènements affichés (revenus − charges − dépenses). */
  const daySum = (list) => list.reduce((sum, ev) => sum + TYPES[ev.type].sign * ev.montant, 0);
  /** Solde en hausse depuis la veille : en vert ; sinon couleur du texte. */
  const upClass = (v, prev) => (v - prev > 0.004 ? 'good' : '');
  /** Format court des cases sur mobile, sans € ni centimes : « 635 », « 1,2k ». */
  const shortNf = { format: (v) => new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: v < 1000 ? 0 : 1 }).format(v).replace(/\s/g, '') };
  /** Solde : « 180,00 € », « −8,40 € » (court : « −1,2k »). */
  const fmtBalance = (v, nf = eur2) => `${v < -0.004 ? '−' : ''}${nf.format(Math.abs(v))}`;
  /** Solde à la fin de chaque jour du mois : celui de la veille plus les
      évènements du jour, cochés ou non (le mois part de 0 €). balances[d], d de 1 à last. */
  function balancesOf(byDay, last) {
    const balances = [0];
    for (let d = 1; d <= last; d++) balances[d] = balances[d - 1] + daySum(byDay[d] || []);
    return balances;
  }

  /** Totaux du mois dans la check-list : chaque type garde son total, même
      décoché ; le solde compte tous les types : le filtre ne change que l'affichage. */
  function renderTotals() {
    const sum = { revenu: 0, charge: 0, depense: 0 };
    Object.values(eventsOf(year, month, new Set(Object.keys(TYPES)))).flat()
      .forEach((ev) => { sum[ev.type] += ev.montant; });
    $('#suiviRevenus').textContent = eur2.format(sum.revenu);
    $('#suiviCharges').textContent = eur2.format(sum.charge);
    $('#suiviDepenses').textContent = eur2.format(sum.depense);
    const solde = Object.keys(TYPES).reduce((v, t) => v + TYPES[t].sign * sum[t], 0);
    $('#suiviSolde').textContent = fmtBalance(solde);
  }

  function renderDay(byDay, allByDay, balances, showSolde) {
    const list = byDay[selected] || [];
    const total = balances[selected];
    // Total du jour (revenus − charges − dépenses) : seulement à partir de deux évènements.
    const dayEvents = allByDay[selected] || [];
    const cum = daySum(dayEvents);
    const sign = cum > 0.004 ? '+' : cum < -0.004 ? '−' : '';
    const cumulRow = dayEvents.length > 1
      ? [h('li', { class: 'cal-ev cal-ev--solde' },
        h('span', { class: 'sw', 'aria-hidden': 'true' }),
        h('span', { class: 'cal-ev__name' }, 'Total'),
        h('span', { class: `cal-ev__amount ${cum > 0.004 ? 'good' : ''}` }, `${sign}${eur2.format(Math.abs(cum))}`))]
      : [];
    const trend = upClass(total, balances[selected - 1]);
    const soldeRow = showSolde
      ? [h('li', { class: 'cal-ev cal-ev--solde' },
        h('span', { class: 'sw', 'aria-hidden': 'true' }),
        h('span', { class: 'cal-ev__name' }, 'Solde en fin de journée'),
        h('span', { class: `cal-ev__amount ${trend}` }, fmtBalance(total)))]
      : [];
    $('#calDayTitle').textContent = capitalize(fmtDay.format(new Date(year, month, selected)));
    $('#calDayList').replaceChildren(...(list.length
      ? list.map((ev) => h('li', { class: `cal-ev cal-ev--${ev.type}` },
        h('span', { class: 'sw', 'aria-hidden': 'true' }),
        h('span', { class: 'cal-ev__name' }, ev.nom, h('span', { class: 'cal-ev__cat' }, `${TYPES[ev.type].label} · ${ev.categorie}`)),
        h('span', { class: 'cal-ev__amount' }, signed(ev)))).concat(cumulRow, soldeRow)
      : [h('li', { class: 'cal-day__empty' }, 'Aucun évènement affiché ce jour-là.'), ...cumulRow, ...soldeRow]));
  }

  /** Solde en fin de journée dans la case : complet en bureau, court sur mobile.
      below : sous la ligne du numéro (quand le cumul l'occupe). */
  const daySolde = (v, prev, below = false) => h('span', { class: `cal__solde ${upClass(v, prev)}${below ? ' cal__below' : ''}`, title: `Solde en fin de journée : ${fmtBalance(v)}` },
    h('span', { class: 'cal__solde-full' }, fmtBalance(v)),
    h('span', { class: 'cal__solde-short' }, fmtBalance(v, shortNf)));

  /** Une pastille par type présent dans la case : le nom de l'évènement s'il est
      seul, sinon « 3 dépenses », avec le total du type. */
  const typeChips = (list) => Object.keys(TYPES).map((type) => {
    const evs = list.filter((ev) => ev.type === type);
    if (!evs.length) return null;
    const nom = evs.length === 1 ? evs[0].nom : `${evs.length} ${TYPES[type].plural}`;
    const ev = { type, montant: evs.reduce((s, x) => s + x.montant, 0) };
    return h('span', { class: `cal-chip cal-chip--${type}` },
      h('span', { class: 'cal-chip__name' }, nom), h('span', { class: 'cal-chip__amount' }, signed(ev)));
  }).filter(Boolean);

  /** Cumul du jour sur la ligne du numéro, même style que le solde : « +120,00 € », « −85,50 € » (court sur mobile) ; rien s'il est nul. */
  const dayCumul = (v) => {
    if (Math.abs(v) <= 0.004) return null;
    const fmt = (nf) => `${v > 0 ? '+' : '−'}${nf.format(Math.abs(v))}`;
    return h('span', { class: 'cal__solde cal__cumul', title: `Cumul du jour : ${fmt(eur2)}` },
      h('span', { class: 'cal__solde-full' }, fmt(eur2)),
      h('span', { class: 'cal__solde-short' }, fmt(shortNf)));
  };

  function render({ focus = false } = {}) {
    const filter = currentFilter();
    const showSolde = filter.has('solde');
    // Le filtre ne choisit que les évènements affichés ; solde et cumul comptent tout.
    const byDay = eventsOf(year, month, filter);
    const allByDay = eventsOf(year, month, new Set(Object.keys(TYPES)));
    const last = daysIn(year, month);
    selected = Math.min(selected, last);
    const balances = balancesOf(allByDay, last);
    $('#calTitle').textContent = capitalize(fmtTitle.format(new Date(year, month, 1)));

    const offset = (new Date(year, month, 1).getDay() + 6) % 7; // lundi en premier
    const cells = Array.from({ length: offset }, () => h('li', { class: 'cal__cell cal__cell--pad', 'aria-hidden': 'true' }));
    const isThisMonth = year === today.getFullYear() && month === today.getMonth();

    for (let d = 1; d <= last; d++) {
      const list = byDay[d] || [];
      // Solde affiché seulement quand il change par rapport à la veille (le 1er : par rapport à 0 €).
      const cum = daySum(allByDay[d] || []);
      const soldeShown = showSolde && Math.abs(balances[d] - balances[d - 1]) > 0.004;
      const label = `${fmtDay.format(new Date(year, month, d))}${list.length ? `, ${list.length} évènement${list.length > 1 ? 's' : ''}` : ''}`
        + (soldeShown ? `, solde ${fmtBalance(balances[d])}` : '')
        + (Math.abs(cum) > 0.004 ? `, cumul ${cum > 0 ? '+' : '−'}${eur2.format(Math.abs(cum))}` : '');
      const chips = typeChips(list);
      const cumul = dayCumul(cum);
      const btn = h('button', {
        type: 'button', class: 'cal__day', 'data-day': d, 'aria-label': label,
        'aria-pressed': String(d === selected), tabindex: d === selected ? '0' : '-1',
        'aria-current': isThisMonth && d === today.getDate() ? 'date' : null,
        onclick: () => { select(d, false); if (hasActivity(d)) openZoom(d); }, onkeydown: onKey
      }, h('span', { class: 'cal__top' },
        h('span', { class: 'cal__num' }, String(d)),
        cumul || (soldeShown ? daySolde(balances[d], balances[d - 1]) : null)),
      cumul && soldeShown ? daySolde(balances[d], balances[d - 1], true) : null,
      h('span', { class: 'cal__chips' }, chips));
      cells.push(h('li', { class: `cal__cell${list.length ? ' has-events' : ''}` }, btn));
    }
    $('#calGrid').replaceChildren(...cells);
    renderTotals();
    renderDay(byDay, allByDay, balances, showSolde);
    hasActivity = (d) => !!(allByDay[d] || []).length;
    if (focus) $(`#calGrid [data-day="${selected}"]`)?.focus();
  }

  function select(day, focus) {
    selected = day;
    render({ focus });
  }

  /* ---------- Zoom : détail du jour en pop-up ---------- */

  let hasActivity = () => false;
  const zoomOverlay = $('#calZoomOverlay');
  const zoomBox = $('.cal-zoom', zoomOverlay);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ZOOM_MS = 260;
  let closeZoomNow = null;
  let zoomAnim = null;

  /** Transformation qui ramène la pop-up (à sa place finale) sur la case du jour. */
  function fromCell(day) {
    const cell = $(`#calGrid [data-day="${day}"]`)?.getBoundingClientRect();
    const box = zoomBox.getBoundingClientRect();
    if (!cell || !box.width) return null;
    return `translate(${cell.left - box.left}px, ${cell.top - box.top}px) scale(${cell.width / box.width}, ${cell.height / box.height})`;
  }

  /** Anime la pop-up et le fond, de la case vers le centre (ou l'inverse). */
  function animateZoom(day, reverse) {
    const from = reduceMotion.matches ? null : fromCell(day);
    if (!from || !zoomBox.animate) return Promise.resolve();
    zoomAnim?.cancel();
    const opts = { duration: ZOOM_MS, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', direction: reverse ? 'reverse' : 'normal', fill: 'both' };
    const backdrop = zoomOverlay.animate([{ backgroundColor: 'rgba(0, 0, 0, 0)' }, { backgroundColor: 'rgba(0, 0, 0, 0.45)' }], opts);
    const anim = zoomAnim = zoomBox.animate([
      { transform: from, opacity: 0.4, borderRadius: '10px' },
      { transform: 'none', opacity: 1, borderRadius: '14px' }
    ], opts);
    // Sécurité : si l'animation ne progresse pas (onglet en arrière-plan…), on n'attend pas plus que sa durée.
    const timeout = new Promise((resolve) => { setTimeout(resolve, ZOOM_MS + 60); });
    return Promise.race([anim.finished.catch(() => {}), timeout]).then(() => {
      // Animation bloquée : on saute à son état final (jamais de pop-up figée en miniature).
      [anim, backdrop].forEach((a) => { if (a.playState === 'running') a.finish(); });
    });
  }

  function openZoom(day) {
    if (closeZoomNow) return;
    closeZoomNow = openModal(zoomOverlay, {
      focus: '#calZoomClose',
      onClose: () => {
        closeZoomNow = null;
        zoomOverlay.getAnimations().forEach((a) => a.cancel());
        zoomAnim?.cancel();
        $(`#calGrid [data-day="${selected}"]`)?.focus();
      }
    });
    animateZoom(day, false);
  }

  /** Fermeture animée : la pop-up se rétracte dans sa case, puis disparaît. */
  let closing = false;
  async function closeZoom() {
    if (!closeZoomNow || closing) return;
    closing = true;
    await animateZoom(selected, true);
    closing = false;
    closeZoomNow?.();
  }

  $('#calZoomClose').addEventListener('click', closeZoom);
  // Fond et Échap : on passe avant la gestion commune des pop-ups (ui.js) pour animer la fermeture.
  zoomOverlay.addEventListener('click', (e) => {
    if (e.target !== zoomOverlay) return;
    e.stopImmediatePropagation();
    closeZoom();
  }, true);
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !closeZoomNow) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    closeZoom();
  }, true);

  function shiftMonth(delta, day = 1) {
    const d = new Date(year, month + delta, 1);
    year = d.getFullYear();
    month = d.getMonth();
    selected = day;
  }

  /** Clavier dans le calendrier : flèches (jour / semaine), Début/Fin du mois, Page préc./suiv. (mois). */
  function onKey(e) {
    const last = daysIn(year, month);
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    let target;
    if (step) target = selected + step;
    else if (e.key === 'Home') target = 1;
    else if (e.key === 'End') target = last;
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const keep = selected;
      shiftMonth(e.key === 'PageUp' ? -1 : 1, keep);
      render({ focus: true });
      return;
    } else return;
    e.preventDefault();
    if (target < 1) {
      shiftMonth(-1);
      selected = daysIn(year, month) + target;
      render({ focus: true });
    } else if (target > last) {
      shiftMonth(1, target - last);
      render({ focus: true });
    } else select(target, true);
  }

  $('#calPrev').addEventListener('click', () => { shiftMonth(-1); render(); });
  $('#calNext').addEventListener('click', () => { shiftMonth(1); render(); });
  $('#calToday').addEventListener('click', () => {
    year = today.getFullYear();
    month = today.getMonth();
    selected = today.getDate();
    render();
  });
  checks.forEach((c) => c.addEventListener('change', () => {
    store.set(FILTER_KEY, checks.filter((x) => !x.checked).map((x) => x.value));
    render();
  }));

  render();
})();
