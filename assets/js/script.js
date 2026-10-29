/* ==========================================================================
   Gestion budget — pages du tableau de bord (Synthèse, Revenus, Charges,
   Dépenses, Économie, Placement, CashBack, RoundUp, Exporter, Imprimer).
   S'appuie sur state.js (état), ui.js (interface), calc.js (calculs) et,
   pour l'export, report.js.
   1. Charges mensuelles / annuelles (annuel = mensuel × 12)
   2. Économie potentielle en remplaçant une ligne par une autre option
   3. Simuler un placement (deux taux annuels modifiables, 2 % et 10 % par défaut,
      intérêts composés ; gain affiché pour l'année de votre choix)
   ========================================================================== */
'use strict';

(() => {
  /* ---------- Constantes ---------- */

  const STORAGE_KEY = Profiles.dataKey(); // données du profil actif (voir profiles.js)
  /** Exemples de libellés par catégorie : affichés comme placeholder du champ
      "Libellé" selon la catégorie choisie, pour guider la saisie. */
  const NOM_PLACEHOLDERS = {
    revenus: {
      'Salaire': 'Ex. Salaire net',
      'Aide': 'Ex. Aide au logement',
      'Autre': 'Ex. Pension alimentaire'
    },
    charges: {
      'Loyer': 'Ex. Loyer habitation',
      'Factures': 'Ex. Électricité',
      'Courses': 'Ex. Carrefour, Monoprix, Lidl',
      'Transport': 'Ex. Pass Navigo, essence, péage',
      'Abonnements': 'Ex. Netflix, Amazon Prime',
      'Activité': 'Ex. Salle de sport',
      'Plaisir': 'Ex. Restaurant',
      'Assurance': 'Ex. Voiture, habitation',
      'Épargne': 'Ex. Économie, PEA',
      'Prêt': 'Ex. Crédit immobilier, prêt auto',
      'Famille / Proche': 'Ex. Aide aux parents, argent de poche',
      'Autre': 'Ex. Pension alimentaire (enfants)'
    },
    depenses: {
      'Course': 'Ex. Carrefour, Monoprix, Lidl',
      'Alimentaire': 'Ex. Carrefour, Monoprix',
      'Transport': 'Ex. Essence',
      'Shopping': 'Ex. Amazon, Zara',
      'Divertissement': 'Ex. Jeu Steam, PlayStation, film',
      'Sortie': 'Ex. Cinéma',
      'Équipement': 'Ex. Lave-linge, télé',
      'Entretien ménager': 'Ex. Liquide vaisselle, Javel',
      'Cadeau': 'Ex. Anniversaire, fleur',
      'Famille / Proche': 'Ex. Aide ponctuelle, sortie en famille',
      'Santé': 'Ex. Médecin, lunettes',
      'Amende': 'Ex. Stationnement, radar',
      'Imprévu': 'Ex. Panne voiture, garage',
      'Restaurant': 'Ex. Buffet, Uber, fast-food',
      'Autre': 'Ex. Prêt, entretien voiture'
    }
  };
  const HINTS = {
    Loyer: 'Ex. Colocation, logement plus petit, renégociation',
    Factures: 'Ex. Fournisseur moins cher, forfait plus économique',
    Courses: 'Ex. Marque distributeur, drive, discount',
    Transport: 'Ex. Abonnement annuel, covoiturage, vélo',
    Abonnements: 'Ex. Offre étudiante, partage de compte',
    'Activité': 'Ex. Club moins cher, licence annuelle, activité gratuite',
    Plaisir: 'Ex. Sortie moins chère, moins de restaurants, offre découverte',
    Assurance: 'Ex. Comparateur, changement de formule, regroupement de contrats',
    'Épargne': 'Ex. Virement automatique, livret, arrondi à l\'achat',
    'Prêt': 'Ex. Renégociation du taux, rachat de crédit',
    'Famille / Proche': 'Ex. Budget fixe, montant revu ensemble',
    Autre: 'Ex. Option moins chère'
  };
  const MONTHS = Calc.MONTHS;
  const { CATEGORIES, REV_CATEGORIES, DEP_CATEGORIES, MAX_RATE, ROUND_UP_OPTIONS,
    uid, num, clamp, readRate } = BudgetState;
  const { $, h, s, MOBILE_QUERY, eur2, eur0, eurCompact, pct1, rateNf, fmtRate, capitalize, monthLabel,
    currentMonthName, currentMonthWithPreposition, openModal, confirmDialog: confirmDelete, bindInfoModal,
    openPicker, pickerOpt, pickCategory, pickDate, pickTime, bindAddWizard, bindResponsiveTrigger,
    niceScale, arcPath, ringPath } = UI;

  /* ---------- Utilitaires ---------- */

  /** Copie triée par ordre alphabétique (accents pris en compte) pour les listes déroulantes. */
  const sortAlpha = (list) => [...list].sort((a, b) => a.localeCompare(b, 'fr'));

  /** Bouton de cellule affichant la catégorie d'une ligne ; ouvre pickCategory. */
  function categoryCell(item, cats) {
    const btn = h('button', {
      type: 'button', class: 'cell cell--pick', 'aria-label': `Catégorie : ${item.categorie}`,
      onclick: () => pickCategory(cats, item.categorie, (cat) => {
        item.categorie = cat;
        btn.textContent = cat;
        btn.setAttribute('aria-label', `Catégorie : ${cat}`);
        refresh();
      })
    }, item.categorie);
    return btn;
  }

  /** Champ catégorie du wizard d'ajout : bouton (au lieu d'un <select> natif)
      qui ouvre pickCategory et reporte le choix dans l'input caché associé. */
  function bindCategoryButton(btnSel, inputSel, cats) {
    const btn = $(btnSel);
    const input = $(inputSel);
    if (!btn || !input) return;
    const set = (cat) => {
      input.value = cat;
      btn.textContent = cat;
      input.dispatchEvent(new Event('change'));
    };
    set(input.value || cats[0]);
    btn.addEventListener('click', () => pickCategory(cats, input.value, (cat) => { set(cat); btn.focus(); }));
  }

  /* ---------- Stockage local ---------- */

  const store = {
    get(key) {
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
    }
  };

  /* ---------- État ---------- */

  const state = BudgetState.load(store.get(STORAGE_KEY));
  const save = () => store.set(STORAGE_KEY, state);
  // Nouveau mois : les dépenses du mois précédent passent dans l'historique.
  if (BudgetState.archiveMonth(state)) save();

  /* ---------- Calculs (les fonctions pures vivent dans calc.js, testées à part) ---------- */

  const annual = Calc.annual;
  /** Taux de cashback configurable (state.cashbackRate, en %), en fraction (0.01 = 1 %). */
  const cashbackFraction = () => state.cashbackRate / 100;

  /** Différence jusqu'au multiple supérieur de state.roundUpTo ; un montant
      déjà pile sur un multiple est arrondi au multiple suivant (x1 → 1,00 €,
      x2 → 2,00 €…) plutôt qu'à 0,00 €. */
  const roundUpAmount = (montant) => {
    const n = state.roundUpTo;
    if (montant <= 0) return 0;
    const diff = Math.ceil(montant / n) * n - montant;
    // Tolérance au centime : les flottants ne tombent pas toujours pile.
    return diff < 0.005 ? n : diff;
  };
  const project = Calc.project;
  const totalMonthly = () => state.charges.reduce((sum, c) => sum + c.mensuel, 0);
  const totalRevenus = () => state.revenus.reduce((sum, r) => sum + r.mensuel, 0);
  const computeSavings = () => Calc.computeSavings(state.charges, state.scenarios);

  /* ==========================================================================
     1. Charges
     ========================================================================== */

  /** Tableaux de lignes : revenus et charges fonctionnent pareil, seules les catégories changent. */
  const LINE_TYPES = {
    revenus: {
      body: '#revenusBody', cats: sortAlpha(REV_CATEGORIES),
      empty: 'Aucun revenu pour le moment. Ajoutez votre première ligne ci-dessus.',
      wrap: '#revenusTableWrap', left: '#revenusScrollLeft', right: '#revenusScrollRight',
      newestFirst: true
    },
    charges: {
      body: '#chargesBody', cats: sortAlpha(CATEGORIES),
      empty: 'Aucune charge pour le moment. Ajoutez votre première ligne ci-dessus.',
      wrap: '#chargesTableWrap', left: '#chargesScrollLeft', right: '#chargesScrollRight',
      newestFirst: true
    }
  };

  function renderLineForms() {
    bindCategoryButton('#rCatBtn', '#rCat', sortAlpha(REV_CATEGORIES));
    bindCategoryButton('#cCatBtn', '#cCat', sortAlpha(CATEGORIES));
    bindCategoryButton('#dCatBtn', '#dCat', sortAlpha(DEP_CATEGORIES));
  }

  /** Met à jour le placeholder du champ "Libellé" selon la catégorie choisie
      dans le select associé, et le tient à jour à chaque changement. */
  function bindNomPlaceholder(catSel, nomSel, map) {
    const catEl = $(catSel);
    const nomEl = $(nomSel);
    if (!catEl || !nomEl) return;
    const update = () => { nomEl.placeholder = map[catEl.value] || nomEl.placeholder; };
    catEl.addEventListener('change', update);
    update();
  }

  const TRASH_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5l.6 8.4a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 7.5v4M9.5 7.5v4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

  const EYE_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

  /** « Vendredi 13 Octobre 2026 » : jour et mois avec majuscule. */
  const fmtAjoutDate = (d) => {
    const jour = capitalize(d.toLocaleDateString('fr-FR', { weekday: 'long' }));
    const mois = capitalize(d.toLocaleDateString('fr-FR', { month: 'long' }));
    return `${jour} ${d.getDate()} ${mois} ${d.getFullYear()}`;
  };

  /** Pop-up de détails d'une charge ou d'une dépense (bouton œil), avec mode
      Modifier : Libellé, Catégorie et Montant deviennent des champs ; les
      valeurs calculées (annuel, cashback, round up) suivent la saisie. */
  function showItemDetails(item, kind) {
    const overlay = $('#detailOverlay');
    if (!overlay) return;
    const isCharge = kind === 'charges';
    const isRevenu = kind === 'revenus';
    const monthly = isCharge || isRevenu; // montant mensuel (sinon ponctuel)
    const key = monthly ? 'mensuel' : 'montant';
    const cats = sortAlpha(isCharge ? CATEGORIES : isRevenu ? REV_CATEGORIES : DEP_CATEGORIES);
    const editBtn = $('#detailEdit');
    const closeBtn = $('#detailClose');
    const cancelBtn = $('#detailCancel');
    const saveBtn = $('#detailSave');
    let draft = null; // { nom, categorie, montant, ajout } pendant la modification

    $('#detailTitle').textContent = isCharge ? 'Détail de la charge' : isRevenu ? 'Détail du revenu' : 'Détail de la dépense';
    $('#detailStamp').hidden = false;
    const fmtDate = (d) => (d ? fmtAjoutDate(d) : 'Date non connue');
    const fmtTime = (d) => (d ? `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}` : '?? h ??');

    /** Date (à gauche) et heure (à droite) d'ajout ; valeurs de repli pour les
        lignes créées avant leur enregistrement. En modification : boutons
        ouvrant le calendrier / le choix de l'heure. */
    const renderStamp = () => {
      if (!draft) {
        const d = item.ajout ? new Date(item.ajout) : null;
        $('#detailDate').replaceChildren(fmtDate(d));
        $('#detailTime').replaceChildren(fmtTime(d));
        return;
      }
      const dateBtn = h('button', {
        type: 'button', class: 'select-btn detail-field detail-field--stamp', 'aria-label': 'Date d’ajout',
        onclick: () => pickDate(draft.ajout, (y, m, day) => {
          const base = draft.ajout || new Date(y, m, day, 0, 0);
          draft.ajout = new Date(y, m, day, base.getHours(), base.getMinutes());
          renderStamp();
          $('#detailDate button').focus();
        })
      }, fmtDate(draft.ajout));
      const timeBtn = h('button', {
        type: 'button', class: 'select-btn detail-field detail-field--stamp', 'aria-label': 'Heure d’ajout',
        onclick: () => pickTime(draft.ajout, (hr, mn) => {
          const base = draft.ajout || new Date();
          draft.ajout = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hr, mn);
          renderStamp();
          $('#detailTime button').focus();
        })
      }, fmtTime(draft.ajout));
      $('#detailDate').replaceChildren(dateBtn);
      $('#detailTime').replaceChildren(timeBtn);
    };

    /** Valeurs calculées à partir d'un montant (affichées en lecture seule). */
    const computed = (montant) => {
      // Le taux et le multiple accompagnent l'intitulé, pas le montant.
      const off = isCharge ? 'Non inclus' : 'Désactivé';
      const rows = [];
      if (monthly) rows.push(['Annuel', eur2.format(annual(montant))]);
      // Les revenus n'ont ni cashback ni round up.
      if (isRevenu) return rows;
      rows.push(
        [`Cashback (${fmtRate(state.cashbackRate)})`, item.cashbackOn !== false ? eur2.format(montant * cashbackFraction()) : off],
        [`RoundUp (x${state.roundUpTo})`, item.roundUpOn !== false ? eur2.format(roundUpAmount(montant)) : off]
      );
      return rows;
    };
    const row = ([label, value]) => [h('dt', {}, label), h('dd', {}, value)];

    const render = () => {
      const list = $('#detailList');
      const suffix = monthly ? ' / mois' : '';
      renderStamp();
      if (!draft) {
        list.replaceChildren(...[
          ['Libellé', item.nom],
          ['Catégorie', item.categorie],
          [monthly ? 'Mensuel' : 'Montant', `${eur2.format(item[key])}${suffix}`],
          ...computed(item[key])
        ].flatMap(row));
        return;
      }
      const computedDds = [];
      const updateComputed = () => computed(draft.montant).forEach(([, v], i) => { computedDds[i].textContent = v; });
      const nomInput = h('input', {
        type: 'text', class: 'detail-field', maxlength: '60', required: true, 'aria-label': 'Libellé',
        oninput: (e) => { draft.nom = e.target.value; }
      });
      nomInput.value = draft.nom;
      const catBtn = h('button', {
        type: 'button', class: 'select-btn detail-field', 'aria-label': 'Catégorie',
        onclick: () => pickCategory(cats, draft.categorie, (cat) => { draft.categorie = cat; catBtn.textContent = cat; catBtn.focus(); })
      }, draft.categorie);
      const montantInput = h('input', {
        type: 'number', class: 'detail-field detail-field--num', min: '0', step: '0.01', inputmode: 'decimal',
        'aria-label': monthly ? 'Mensuel' : 'Montant',
        oninput: (e) => { draft.montant = num(e.target.value); fitWidth(); updateComputed(); }
      });
      // Largeur ajustée au contenu : nombre de caractères saisis + 2.
      const fitWidth = () => { montantInput.style.width = `calc(${montantInput.value.length + 2}ch + 24px)`; };
      montantInput.value = String(draft.montant);
      fitWidth();
      const computedRows = computed(draft.montant).map(([label, value]) => {
        const dd = h('dd', {}, value);
        computedDds.push(dd);
        return [h('dt', {}, label), dd];
      });
      list.replaceChildren(
        h('dt', {}, 'Libellé'), h('dd', {}, nomInput),
        h('dt', {}, 'Catégorie'), h('dd', {}, catBtn),
        h('dt', {}, monthly ? 'Mensuel' : 'Montant'), h('dd', {}, montantInput),
        ...computedRows.flat()
      );
      nomInput.focus();
    };

    const setEditing = (on) => {
      draft = on ? { nom: item.nom, categorie: item.categorie, montant: item[key], ajout: item.ajout ? new Date(item.ajout) : null } : null;
      editBtn.hidden = on;
      closeBtn.hidden = on;
      cancelBtn.hidden = !on;
      saveBtn.hidden = !on;
      render();
      if (!on) editBtn.focus();
    };
    const onEdit = () => setEditing(true);
    const onCancel = () => setEditing(false);
    const onSave = () => {
      const nom = draft.nom.trim();
      if (!nom) { $('.detail-field', overlay)?.reportValidity(); return; }
      item.nom = nom.slice(0, 60);
      item.categorie = draft.categorie;
      item[key] = draft.montant;
      if (draft.ajout) item.ajout = draft.ajout.toISOString();
      if (monthly) renderLines(kind); else renderDepenses();
      refresh();
      setEditing(false);
    };
    // Entrée dans un champ = Valider.
    const onListKey = (e) => {
      if (e.key === 'Enter' && draft && e.target.tagName === 'INPUT') { e.preventDefault(); onSave(); }
    };

    editBtn.addEventListener('click', onEdit);
    cancelBtn.addEventListener('click', onCancel);
    saveBtn.addEventListener('click', onSave);
    $('#detailList').addEventListener('keydown', onListKey);
    setEditing(false);
    const close = openModal(overlay, {
      focus: closeBtn,
      onClose: () => {
        editBtn.removeEventListener('click', onEdit);
        cancelBtn.removeEventListener('click', onCancel);
        saveBtn.removeEventListener('click', onSave);
        closeBtn.removeEventListener('click', close);
        $('#detailList').removeEventListener('keydown', onListKey);
      }
    });
    closeBtn.addEventListener('click', close);
  }

  /** Bouton œil d'une charge ou d'une dépense : toutes ses informations, cashback
      et round up compris (lus au clic, donc toujours à jour des modifications). */
  function detailButton(item, kind) {
    const btn = h('button', {
      class: 'icon-btn icon-btn--view', type: 'button', 'aria-label': `Voir le détail de ${item.nom}`, title: 'Voir le détail',
      onclick: () => showItemDetails(item, kind)
    });
    btn.innerHTML = EYE_ICON;
    return btn;
  }

  function renderLines(type) {
    const cfg = LINE_TYPES[type];
    const body = $(cfg.body);
    if (!body) return;
    body.replaceChildren();

    if (!state[type].length) {
      body.append(h('tr', {}, h('td', { colspan: 5, class: 'empty' }, cfg.empty)));
      updateScrollArrows($(cfg.wrap), $(cfg.left), $(cfg.right));
      return;
    }

    // Pour les charges, la plus récemment ajoutée s'affiche en haut (ordre
    // d'ajout inversé) ; les revenus gardent l'ordre d'ajout tel quel.
    const items = cfg.newestFirst ? [...state[type]].reverse() : state[type];

    for (const c of items) {
      const annualCell = h('td', { class: 'num' }, eur2.format(annual(c.mensuel)));

      const nameInput = h('input', {
        class: 'cell', type: 'text', maxlength: 60, value: c.nom, 'aria-label': 'Libellé',
        onchange: (e) => {
          c.nom = e.target.value.trim() || c.nom;
          e.target.value = c.nom;
          refresh();
        }
      });

      const catCell = categoryCell(c, cfg.cats);

      const amountInput = h('input', {
        class: 'cell num', type: 'number', min: 0, step: '0.01', inputmode: 'decimal',
        value: c.mensuel.toFixed(2), 'aria-label': `Montant mensuel de ${c.nom}`,
        oninput: (e) => {
          c.mensuel = num(e.target.value);
          annualCell.textContent = eur2.format(annual(c.mensuel));
          refresh();
        },
        onblur: (e) => { e.target.value = c.mensuel.toFixed(2); }
      });

      const del = h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': `Effacer ${c.nom}`, title: 'Effacer',
        onclick: () => {
          confirmDelete(`Supprimer ${type === 'revenus' ? 'ce revenu' : 'cette charge'} ?`, [
            ['Catégorie', c.categorie],
            ['Libellé', c.nom],
            ['Valeur', `${eur2.format(c.mensuel)} / mois`]
          ], () => {
            state[type] = state[type].filter((x) => x.id !== c.id);
            if (type === 'charges') state.scenarios = state.scenarios.filter((x) => x.chargeId !== c.id);
            renderLines(type);
            refresh();
          });
        }
      });
      del.innerHTML = TRASH_ICON;
      const actions = h('td', { class: 'num row-actions' }, detailButton(c, type), del);

      body.append(MOBILE_QUERY.matches
        ? h('tr', {},
          h('td', {}, nameInput),
          h('td', { class: 'num' }, amountInput),
          h('td', {}, catCell),
          annualCell,
          actions
        )
        : h('tr', {},
          h('td', {}, catCell),
          h('td', {}, nameInput),
          h('td', { class: 'num' }, amountInput),
          annualCell,
          actions
        ));
    }
    updateScrollArrows($(cfg.wrap), $(cfg.left), $(cfg.right));
  }

  /** Affiche un montant signé : vert si positif, rouge si négatif. */
  function setSigned(el, value) {
    el.textContent = eur2.format(value);
    el.classList.toggle('good', value > 0.004);
    el.classList.toggle('bad', value < -0.004);
  }

  /** Affecte le même texte à tous les éléments correspondants (ex. un total
      répété dans la ligne de pied desktop et sa variante mobile). */
  function setAllText(selector, text) {
    document.querySelectorAll(selector).forEach((el) => { el.textContent = text; });
  }

  /** Répartition par catégorie (barres proportionnelles + montant + part du total). */
  function renderBreakdown(box, cats, items, amountOf, total, emptyMsg) {
    box.replaceChildren();
    const byCat = cats
      .map((cat) => ({ cat, total: items.filter((x) => x.categorie === cat).reduce((a, x) => a + amountOf(x), 0) }))
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total);

    if (!byCat.length) {
      box.append(h('p', { class: 'note' }, emptyMsg));
      return;
    }
    const max = byCat[0].total;
    for (const { cat, total: catTotal } of byCat) {
      box.append(h('div', { class: 'bd' },
        h('span', { class: 'bd__name' }, cat),
        h('div', { class: 'bd__track', role: 'presentation' },
          h('div', { class: 'bd__bar', style: `width:${(catTotal / max) * 100}%` })),
        h('span', { class: 'bd__amt' }, eur2.format(catTotal)),
        h('span', { class: 'bd__pct' }, pct1.format(catTotal / total))
      ));
    }
  }

  function renderRevenusTotals() {
    if (!$('.rev-tot-mensuel')) return;
    const rev = totalRevenus();
    const ch = totalMonthly();
    const solde = rev - ch;
    setAllText('.rev-tot-mensuel', eur2.format(rev));
    setAllText('.rev-tot-annuel', eur2.format(annual(rev)));
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

    renderBreakdown($('#revBreakdown'), REV_CATEGORIES, state.revenus, (r) => r.mensuel, rev,
      'Ajoutez des revenus pour voir leur répartition.');
  }

  function renderChargeTotals() {
    if (!$('.chg-tot-mensuel')) return;
    const m = totalMonthly();
    setAllText('.chg-tot-mensuel', eur2.format(m));
    setAllText('.chg-tot-annuel', eur2.format(annual(m)));

    renderBreakdown($('#breakdown'), CATEGORIES, state.charges, (c) => c.mensuel, m,
      'Ajoutez des charges pour voir leur répartition.');
  }

  function bindLines() {
    const bindForm = (type, ids) => {
      const form = $(ids.form);
      if (!form) return;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nom = $(ids.nom).value.trim();
        if (!nom) return;
        const entry = { id: uid(), categorie: $(ids.cat).value, nom, mensuel: num($(ids.montant).value), ajout: new Date().toISOString() };
        // CashBack/RoundUp : étape 4 du wizard, absente du formulaire Revenus.
        if (ids.cashbackOn) entry.cashbackOn = $(ids.cashbackOn).checked;
        if (ids.roundUpOn) entry.roundUpOn = $(ids.roundUpOn).checked;
        state[type].push(entry);
        $(ids.nom).value = '';
        $(ids.montant).value = '';
        if (ids.cashbackOn) $(ids.cashbackOn).checked = true;
        if (ids.roundUpOn) $(ids.roundUpOn).checked = true;
        $(ids.nom).focus();
        renderLines(type);
        refresh();
      });
    };
    bindForm('revenus', { form: '#revenuForm', cat: '#rCat', nom: '#rNom', montant: '#rMontant' });
    bindForm('charges', { form: '#chargeForm', cat: '#cCat', nom: '#cNom', montant: '#cMontant', cashbackOn: '#cCashbackOn', roundUpOn: '#cRoundUpOn' });
    bindNomPlaceholder('#rCat', '#rNom', NOM_PLACEHOLDERS.revenus);
    bindNomPlaceholder('#cCat', '#cNom', NOM_PLACEHOLDERS.charges);
    bindAddWizard({
      openBtn: '#btnOpenRevenuWizard', overlay: '#revenuWizardOverlay', form: '#revenuForm',
      closeBtn: '#revenuWizardClose', backBtn: '#revenuWizardBack',
      nextBtn: '#revenuWizardNext', finishBtn: '#revenuWizardFinish', stepLabel: '#revenuWizardStepLabel',
      steps: ['[data-step="1"]', '[data-step="2"]', '[data-step="3"]'],
      fields: ['#rCatBtn', '#rMontant', '#rNom']
    });
    bindResponsiveTrigger('#btnOpenRevenuWizard', '#addRevenuMobileSlot', '#revenus .card__head');
    bindAddWizard({
      openBtn: '#btnOpenChargeWizard', overlay: '#chargeWizardOverlay', form: '#chargeForm',
      closeBtn: '#chargeWizardClose', backBtn: '#chargeWizardBack',
      nextBtn: '#chargeWizardNext', finishBtn: '#chargeWizardFinish', stepLabel: '#chargeWizardStepLabel',
      steps: ['[data-step="1"]', '[data-step="2"]', '[data-step="3"]', '[data-step="4"]'],
      fields: ['#cCatBtn', '#cMontant', '#cNom', null]
    });
    bindResponsiveTrigger('#btnOpenChargeWizard', '#addChargeMobileSlot', '#charges .card__head');

    for (const [type, cfg] of Object.entries(LINE_TYPES)) {
      const wrap = $(cfg.wrap);
      if (wrap) bindScrollArrows(wrap, $(cfg.left), $(cfg.right));
      if ($(cfg.body)) MOBILE_QUERY.addEventListener('change', () => renderLines(type));
    }

    const clearCharges = () => {
      confirmDelete('Effacer TOUTES les charges ?', [], () => {
        const ids = new Set(state.charges.map((c) => c.id));
        state.charges = [];
        state.scenarios = state.scenarios.filter((x) => !ids.has(x.chargeId));
        renderLines('charges');
        refresh();
      }, { center: true });
    };
    const clearAll = () => {
      confirmDelete('Êtes-vous sûr de tout effacer ?', [
        ['Revenus', `${state.revenus.length}`],
        ['Charges', `${state.charges.length}`],
        ['Comparaisons', `${state.scenarios.length}`],
        ['Dépenses', `${state.depenses.length}`],
        ['Mois archivés', `${state.depensesHistorique.length}`]
      ], () => {
        state.revenus = [];
        state.charges = [];
        state.scenarios = [];
        state.depenses = [];
        state.depensesHistorique = [];
        renderLines('revenus');
        renderLines('charges');
        renderDepenses();
        refresh();
      });
    };
    const clearRevenus = () => {
      confirmDelete('Effacer TOUS les revenus ?', [], () => {
        state.revenus = [];
        renderLines('revenus');
        refresh();
      }, { center: true });
    };
    const btnClear = $('#btnClear');
    if (btnClear) btnClear.addEventListener('click', clearCharges);
    const btnClearRevenus = $('#btnClearRevenus');
    if (btnClearRevenus) btnClearRevenus.addEventListener('click', clearRevenus);
    const btnClearFooter = $('#btnClearFooter');
    if (btnClearFooter) btnClearFooter.addEventListener('click', clearAll);
  }

  /* ==========================================================================
     1bis. Dépenses (achats du quotidien, indépendant des charges/revenus :
     seule la tuile « Solde restant » lit leurs totaux, en lecture seule,
     pour donner un repère — rien n'est réécrit dans le calcul du Solde
     affiché sur Charges/Revenus/Synthèse.)
     ========================================================================== */

  function renderDepenses() {
    const body = $('#depensesBody');
    if (!body) return;
    body.replaceChildren();

    if (!state.depenses.length) {
      body.append(h('tr', {}, h('td', { colspan: 4, class: 'empty' }, 'Aucune dépense pour le moment. Ajoutez votre premier achat ci-dessus.')));
      updateScrollArrows($('#depensesTableWrap'), $('#depensesScrollLeft'), $('#depensesScrollRight'));
      return;
    }

    // La dépense la plus récemment ajoutée s'affiche en haut (ordre d'ajout
    // inversé), plutôt que regroupée par catégorie.
    const ordered = [...state.depenses].reverse();

    for (const d of ordered) {
      const nameInput = h('input', {
        class: 'cell', type: 'text', maxlength: 60, value: d.nom, 'aria-label': 'Libellé',
        onchange: (e) => {
          d.nom = e.target.value.trim() || d.nom;
          e.target.value = d.nom;
          refresh();
        }
      });

      const catCell = categoryCell(d, sortAlpha(DEP_CATEGORIES));

      const amountInput = h('input', {
        class: 'cell num', type: 'number', min: 0, step: '0.01', inputmode: 'decimal',
        value: d.montant.toFixed(2), 'aria-label': `Montant de ${d.nom}`,
        oninput: (e) => { d.montant = num(e.target.value); refresh(); },
        onblur: (e) => { e.target.value = d.montant.toFixed(2); }
      });

      const del = h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': `Effacer ${d.nom}`, title: 'Effacer',
        onclick: () => {
          confirmDelete('Supprimer cette dépense ?', [
            ['Catégorie', d.categorie],
            ['Libellé', d.nom],
            ['Montant', eur2.format(d.montant)]
          ], () => {
            state.depenses = state.depenses.filter((x) => x.id !== d.id);
            renderDepenses();
            refresh();
          });
        }
      });
      del.innerHTML = TRASH_ICON;
      const actions = h('td', { class: 'num row-actions' }, detailButton(d, 'depenses'), del);

      body.append(MOBILE_QUERY.matches
        ? h('tr', {},
          h('td', {}, nameInput),
          h('td', { class: 'num' }, amountInput),
          h('td', {}, catCell),
          actions
        )
        : h('tr', {},
          h('td', {}, catCell),
          h('td', {}, nameInput),
          h('td', { class: 'num' }, amountInput),
          actions
        ));
    }
    updateScrollArrows($('#depensesTableWrap'), $('#depensesScrollLeft'), $('#depensesScrollRight'));
  }

  function renderDepenseTotals() {
    if (!$('.dep-total-cell')) return;
    const total = state.depenses.reduce((sum, d) => sum + d.montant, 0);
    setAllText('.dep-total-cell', eur2.format(total));
    $('#kpiDepensesMois').textContent = eur2.format(total);
    setSigned($('#kpiSoldeDispo'), totalRevenus() - totalMonthly() - total);

    const moisNom = currentMonthName();
    if ($('#depMoisTitre')) $('#depMoisTitre').textContent = moisNom;
    if ($('#depAchatsMoisSub')) $('#depAchatsMoisSub').textContent = `Dépenses ${currentMonthWithPreposition()}`;

    renderBreakdown($('#depBreakdown'), DEP_CATEGORIES, state.depenses, (d) => d.montant, total,
      'Ajoutez des dépenses pour voir leur répartition.');
  }

  function bindDepenses() {
    bindNomPlaceholder('#dCat', '#dNom', NOM_PLACEHOLDERS.depenses);
    bindAddWizard({
      openBtn: '#btnOpenDepenseWizard', overlay: '#depenseWizardOverlay', form: '#depenseForm',
      closeBtn: '#depenseWizardClose', backBtn: '#depenseWizardBack',
      nextBtn: '#depenseWizardNext', finishBtn: '#depenseWizardFinish', stepLabel: '#depenseWizardStepLabel',
      steps: ['[data-step="1"]', '[data-step="2"]', '[data-step="3"]', '[data-step="4"]'],
      fields: ['#dCatBtn', '#dMontant', '#dNom', null]
    });
    bindResponsiveTrigger('#btnOpenDepenseWizard', '#addDepenseMobileSlot', '#depenses .card__head');
    const form = $('#depenseForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nom = $('#dNom').value.trim();
        if (!nom) return;
        state.depenses.push({
          id: uid(), categorie: $('#dCat').value, nom, montant: num($('#dMontant').value),
          cashbackOn: $('#dCashbackOn').checked, roundUpOn: $('#dRoundUpOn').checked,
          ajout: new Date().toISOString()
        });
        $('#dNom').value = '';
        $('#dMontant').value = '';
        $('#dCashbackOn').checked = true;
        $('#dRoundUpOn').checked = true;
        $('#dNom').focus();
        renderDepenses();
        refresh();
      });
    }
    const wrap = $('#depensesTableWrap');
    if (wrap) bindScrollArrows(wrap, $('#depensesScrollLeft'), $('#depensesScrollRight'));
    if ($('#depensesTable')) MOBILE_QUERY.addEventListener('change', renderDepenses);

    const btnClearDepenses = $('#btnClearDepenses');
    if (btnClearDepenses) {
      btnClearDepenses.addEventListener('click', () => {
        confirmDelete('Effacer TOUTES les dépenses ?', [], () => {
          state.depenses = [];
          renderDepenses();
          refresh();
        }, { center: true });
      });
    }
  }

  /** Contenu du pop-up Historique : un bloc par mois archivé, le plus récent en premier. */
  function renderHistorique() {
    const box = $('#historiqueList');
    if (!box) return;
    box.replaceChildren();

    if (!state.depensesHistorique.length) {
      box.append(h('p', { class: 'note' }, 'Aucun mois précédent enregistré pour le moment.'));
      return;
    }

    for (const m of state.depensesHistorique) {
      const section = h('div', { class: 'historique-month' },
        h('h3', { class: 'h3' }, `${monthLabel(m.mois)} — ${eur2.format(m.total)}`)
      );
      if (m.items.length) {
        section.append(h('table', { class: 'table' },
          h('thead', {}, h('tr', {},
            h('th', { scope: 'col' }, 'Catégorie'),
            h('th', { scope: 'col' }, 'Libellé'),
            h('th', { scope: 'col', class: 'num' }, 'Montant (€)')
          )),
          h('tbody', {}, ...m.items.map((d) => h('tr', {},
            h('td', {}, d.categorie),
            h('td', {}, d.nom),
            h('td', { class: 'num' }, eur2.format(d.montant))
          )))
        ));
      }
      box.append(section);
    }
  }

  function bindHistorique() {
    const btn = $('#btnHistorique');
    if (!btn) return;
    bindInfoModal('#btnHistorique', '#historiqueOverlay', '#historiqueClose');
    btn.addEventListener('click', renderHistorique);
    $('#historiqueExportPdf')?.addEventListener('click', () => window.print());
    // Mobile : reprend sa position d'origine, à côté du titre. Tablette/bureau :
    // reste dans la tuile « Dépenses de ce mois », en haut à droite.
    bindResponsiveTrigger('#btnHistorique', '#depenses .card__head', '#depMoisTile');
  }

  /* ==========================================================================
     1ter. CashBack (estimation à 1 % des charges et dépenses ; dépend de la
     banque — ex. Trade Republic, Revolut — d'où le réglage ligne par ligne.)
     ========================================================================== */

  function renderCashback() {
    /** N'affiche que les lignes soumises au cashback (voir Paramétrer) : une
        ligne désactivée n'a rien à montrer dans ce tableau. */
    const buildRows = (body, items, amountKey, wrap, leftBtn, rightBtn) => {
      const visible = items.filter((item) => item.cashbackOn !== false);
      body.replaceChildren();
      if (!visible.length) {
        body.append(h('tr', {}, h('td', { colspan: 3, class: 'empty' }, 'Aucune ligne soumise au cashback pour le moment.')));
        updateScrollArrows(wrap, leftBtn, rightBtn);
        return;
      }
      for (const item of visible) {
        const montant = item[amountKey];
        const cashback = montant * cashbackFraction();
        const nameCell = h('td', {}, item.nom);
        const montantCell = h('td', { class: 'num' }, eur2.format(montant));
        const cashbackCell = h('td', { class: 'num' }, eur2.format(cashback));
        body.append(MOBILE_QUERY.matches
          ? h('tr', {}, nameCell, cashbackCell, montantCell)
          : h('tr', {}, nameCell, montantCell, cashbackCell));
      }
      updateScrollArrows(wrap, leftBtn, rightBtn);
    };

    // Les tableaux (Dépenses/CashBack) n'existent que sur cashback.html ; les
    // tuiles de résumé ci-dessous existent aussi sur backOrRound.html, qui
    // n'a pas de tableaux — d'où ces deux gardes distinctes plutôt qu'une
    // seule sortie anticipée.
    if ($('#cashbackChargesBody')) {
      buildRows($('#cashbackChargesBody'), state.charges, 'mensuel',
        $('#cashbackChargesTableWrap'), $('#cashbackChargesScrollLeft'), $('#cashbackChargesScrollRight'));
      buildRows($('#cashbackDepensesBody'), state.depenses, 'montant',
        $('#cashbackDepensesTableWrap'), $('#cashbackDepensesScrollLeft'), $('#cashbackDepensesScrollRight'));
    }
    if (!$('#kpiCashbackChargesSub')) return;

    const chargesCashback = state.charges.reduce((sum, c) => sum + (c.cashbackOn !== false ? c.mensuel * cashbackFraction() : 0), 0);
    const depensesCashback = state.depenses.reduce((sum, d) => sum + (d.cashbackOn !== false ? d.montant * cashbackFraction() : 0), 0);
    // #kpiCashbackCharges (montant mensuel brut) n'existe que sur cashback.html ;
    // backOrRound.html n'affiche que le total annuel (#kpiCashbackChargesSub).
    if ($('#kpiCashbackCharges')) $('#kpiCashbackCharges').textContent = eur2.format(chargesCashback);
    $('#kpiCashbackChargesSub').textContent = `${eur2.format(annual(chargesCashback))} par an`;
    $('#kpiCashbackDepenses').textContent = eur2.format(depensesCashback);
    if ($('#cashbackAchatsMoisSub')) $('#cashbackAchatsMoisSub').textContent = `Dépenses ${currentMonthWithPreposition()}`;
    syncCashbackRateUI();
  }

  /** Synchronise l'affichage du taux (titre de page, titre du pop-up, champ)
      sur state.cashbackRate. */
  function syncCashbackRateUI() {
    if ($('#cashbackPageRate')) $('#cashbackPageRate').textContent = fmtRate(state.cashbackRate);
    if ($('#cashbackSettingsRate')) $('#cashbackSettingsRate').textContent = fmtRate(state.cashbackRate);
    const input = $('#cashbackRateInput');
    if (input) input.value = rateNf.format(state.cashbackRate);
  }

  /** Liste du pop-up de paramétrage : une section Charges puis Dépenses, chaque
      ligne avec son interrupteur pour inclure ou non le cashback. */
  function renderCashbackSettings() {
    const box = $('#cashbackSettingsList');
    if (!box) return;
    syncCashbackRateUI();
    box.replaceChildren();

    const buildGroup = (title, items, amountKey, first) => {
      box.append(h('h3', { class: first ? 'h3' : 'h3 h3--gap' }, title));
      if (!items.length) {
        box.append(h('p', { class: 'note' }, 'Aucune ligne pour le moment.'));
        return;
      }
      for (const item of items) {
        // Ne pas rappeler renderCashbackSettings() ici : ça recrée l'interrupteur
        // avant que la transition CSS du curseur ait pu jouer. refresh() suffit,
        // la case à cocher reflète déjà son propre état via :checked.
        const input = h('input', {
          type: 'checkbox', checked: item.cashbackOn !== false,
          onchange: (e) => { item.cashbackOn = e.target.checked; refresh(); }
        });
        const toggle = h('label', { class: 'switch' },
          input, h('span', { class: 'switch__track' }, h('span', { class: 'switch__thumb' })));
        box.append(h('div', { class: 'cb-row' },
          h('div', { class: 'cb-row__text' },
            h('span', { class: 'cb-row__name' }, item.nom),
            h('span', { class: 'cb-row__amount' }, eur2.format(item[amountKey]))
          ),
          toggle
        ));
      }
    };

    buildGroup('Charges', state.charges, 'mensuel', true);
    buildGroup('Dépenses', state.depenses, 'montant', false);
  }

  function bindCashback() {
    const btn = $('#btnCashbackSettings');
    if (!btn) return;
    bindInfoModal('#btnCashbackSettings', '#cashbackSettingsOverlay', '#cashbackSettingsClose');
    btn.addEventListener('click', renderCashbackSettings);
    $('#cashbackRateInput').addEventListener('change', (e) => {
      state.cashbackRate = readRate(e.target.value, 1);
      syncCashbackRateUI();
      refresh();
    });
    bindScrollArrows($('#cashbackChargesTableWrap'), $('#cashbackChargesScrollLeft'), $('#cashbackChargesScrollRight'));
    bindScrollArrows($('#cashbackDepensesTableWrap'), $('#cashbackDepensesScrollLeft'), $('#cashbackDepensesScrollRight'));
    MOBILE_QUERY.addEventListener('change', renderCashback);
  }

  /* ==========================================================================
     1quater. RoundUp (arrondit chaque charge/dépense au multiple supérieur
     choisi — 1/2/3/5/10 € — et met la différence de côté, comme sur Trade
     Republic ; même logique de paramétrage ligne par ligne que CashBack.)
     ========================================================================== */

  function renderRoundUp() {
    const buildRows = (body, items, amountKey, wrap, leftBtn, rightBtn) => {
      const visible = items.filter((item) => item.roundUpOn !== false);
      body.replaceChildren();
      if (!visible.length) {
        body.append(h('tr', {}, h('td', { colspan: 3, class: 'empty' }, 'Aucune ligne soumise au round up pour le moment.')));
        updateScrollArrows(wrap, leftBtn, rightBtn);
        return;
      }
      for (const item of visible) {
        const montant = item[amountKey];
        const roundUp = roundUpAmount(montant);
        const nameCell = h('td', {}, item.nom);
        const montantCell = h('td', { class: 'num' }, eur2.format(montant));
        const roundUpCell = h('td', { class: 'num' }, eur2.format(roundUp));
        body.append(MOBILE_QUERY.matches
          ? h('tr', {}, nameCell, roundUpCell, montantCell)
          : h('tr', {}, nameCell, montantCell, roundUpCell));
      }
      updateScrollArrows(wrap, leftBtn, rightBtn);
    };

    if ($('#roundUpChargesBody')) {
      buildRows($('#roundUpChargesBody'), state.charges, 'mensuel',
        $('#roundUpChargesTableWrap'), $('#roundUpChargesScrollLeft'), $('#roundUpChargesScrollRight'));
      buildRows($('#roundUpDepensesBody'), state.depenses, 'montant',
        $('#roundUpDepensesTableWrap'), $('#roundUpDepensesScrollLeft'), $('#roundUpDepensesScrollRight'));
    }
    if (!$('#kpiRoundUpChargesSub')) return;

    const chargesRoundUp = state.charges.reduce((sum, c) => sum + (c.roundUpOn !== false ? roundUpAmount(c.mensuel) : 0), 0);
    const depensesRoundUp = state.depenses.reduce((sum, d) => sum + (d.roundUpOn !== false ? roundUpAmount(d.montant) : 0), 0);
    // #kpiRoundUpCharges (montant mensuel brut) n'existe que sur roundUp.html ;
    // backOrRound.html n'affiche que le total annuel (#kpiRoundUpChargesSub).
    if ($('#kpiRoundUpCharges')) $('#kpiRoundUpCharges').textContent = eur2.format(chargesRoundUp);
    $('#kpiRoundUpChargesSub').textContent = `${eur2.format(annual(chargesRoundUp))} par an`;
    $('#kpiRoundUpDepenses').textContent = eur2.format(depensesRoundUp);
    if ($('#roundUpAchatsMoisSub')) $('#roundUpAchatsMoisSub').textContent = `Dépenses ${currentMonthWithPreposition()}`;
    syncRoundUpValueUI();
  }

  /** Synchronise l'affichage du multiple choisi (titre de page, titre du pop-up, select). */
  function syncRoundUpValueUI() {
    const label = `x${state.roundUpTo}`;
    if ($('#roundUpPageValue')) $('#roundUpPageValue').textContent = label;
    if ($('#roundUpSettingsValue')) $('#roundUpSettingsValue').textContent = label;
    const select = $('#roundUpSelect');
    if (select) select.value = String(state.roundUpTo);
  }

  /** Liste du pop-up de paramétrage : une section Charges puis Dépenses, chaque
      ligne avec son interrupteur pour inclure ou non le round up. */
  function renderRoundUpSettings() {
    const box = $('#roundUpSettingsList');
    if (!box) return;
    syncRoundUpValueUI();
    box.replaceChildren();

    const buildGroup = (title, items, amountKey, first) => {
      box.append(h('h3', { class: first ? 'h3' : 'h3 h3--gap' }, title));
      if (!items.length) {
        box.append(h('p', { class: 'note' }, 'Aucune ligne pour le moment.'));
        return;
      }
      for (const item of items) {
        // Ne pas rappeler renderRoundUpSettings() ici : voir la même remarque
        // sur l'interrupteur CashBack (refresh() suffit, :checked s'en charge).
        const input = h('input', {
          type: 'checkbox', checked: item.roundUpOn !== false,
          onchange: (e) => { item.roundUpOn = e.target.checked; refresh(); }
        });
        const toggle = h('label', { class: 'switch' },
          input, h('span', { class: 'switch__track' }, h('span', { class: 'switch__thumb' })));
        box.append(h('div', { class: 'cb-row' },
          h('div', { class: 'cb-row__text' },
            h('span', { class: 'cb-row__name' }, item.nom),
            h('span', { class: 'cb-row__amount' }, eur2.format(item[amountKey]))
          ),
          toggle
        ));
      }
    };

    buildGroup('Charges', state.charges, 'mensuel', true);
    buildGroup('Dépenses', state.depenses, 'montant', false);
  }

  function bindRoundUp() {
    const btn = $('#btnRoundUpSettings');
    if (!btn) return;
    bindInfoModal('#btnRoundUpSettings', '#roundUpSettingsOverlay', '#roundUpSettingsClose');
    btn.addEventListener('click', renderRoundUpSettings);
    $('#roundUpSelect').addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      state.roundUpTo = ROUND_UP_OPTIONS.includes(v) ? v : 1;
      syncRoundUpValueUI();
      refresh();
    });
    bindScrollArrows($('#roundUpChargesTableWrap'), $('#roundUpChargesScrollLeft'), $('#roundUpChargesScrollRight'));
    bindScrollArrows($('#roundUpDepensesTableWrap'), $('#roundUpDepensesScrollLeft'), $('#roundUpDepensesScrollRight'));
    MOBILE_QUERY.addEventListener('change', renderRoundUp);
  }

  /* ==========================================================================
     2. Économies potentielles
     ========================================================================== */

  const chargeLabel = (c) => `${c.nom} (${eur2.format(c.mensuel)}/mois)`;
  /** Charges par ordre alphabétique, puis par montant décroissant à nom identique. */
  const sortedCharges = () => [...state.charges].sort((a, b) =>
    a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || b.mensuel - a.mensuel);

  const CHARGES_PER_PAGE = 7;

  /** Choix du poste de charge à remplacer : même pop-up en boutons que les
      catégories (une charge par ligne, libellés plus longs), 7 par page avec
      pagination ‹ n / total › au-delà. onPick(id). */
  function pickCharge(currentId, onPick) {
    const charges = sortedCharges();
    const pages = Math.max(1, Math.ceil(charges.length / CHARGES_PER_PAGE));
    // Ouvre sur la page qui contient la charge sélectionnée.
    let pageIdx = Math.max(0, Math.floor(charges.findIndex((c) => c.id === currentId) / CHARGES_PER_PAGE));
    openPicker('Choisir le poste de charge', (list, close) => {
      const draw = (focusSel) => {
        const buttons = charges.slice(pageIdx * CHARGES_PER_PAGE, (pageIdx + 1) * CHARGES_PER_PAGE)
          .map((c) => pickerOpt(chargeLabel(c), c.id === currentId, () => {
            close();
            if (c.id !== currentId) onPick(c.id);
          }));
        const go = (delta) => {
          pageIdx = (pageIdx + delta + pages) % pages;
          draw(delta < 0 ? '[data-nav="prev"]' : '[data-nav="next"]');
        };
        const nav = pages > 1 ? h('div', { class: 'cal__nav picker__pages' },
          h('button', { type: 'button', class: 'icon-btn', 'data-nav': 'prev', 'aria-label': 'Page précédente', onclick: () => go(-1) }, '‹'),
          h('span', { class: 'picker__page', 'aria-live': 'polite' }, `${pageIdx + 1} / ${pages}`),
          h('button', { type: 'button', class: 'icon-btn', 'data-nav': 'next', 'aria-label': 'Page suivante', onclick: () => go(1) }, '›')) : null;
        list.style.gridTemplateColumns = '1fr';
        list.replaceChildren(...buttons, ...(nav ? [nav] : []));
        const el = focusSel ? $(focusSel, list) : buttons.find((b) => b.getAttribute('aria-pressed') === 'true') || buttons[0];
        el?.focus();
        return el;
      };
      return draw();
    });
  }

  function renderScenarioForm() {
    if (!$('#scForm')) return;
    // #sLigne (caché) garde l'id de la charge choisie ; #sLigneBtn l'affiche.
    const sel = $('#sLigne');
    if (!state.charges.some((c) => c.id === sel.value)) sel.value = sortedCharges()[0]?.id || '';
    const current = state.charges.find((c) => c.id === sel.value);
    $('#sLigneBtn').textContent = current ? chargeLabel(current) : 'Aucune charge';
    const disabled = !state.charges.length;
    $('#scForm').querySelectorAll('input, select, button').forEach((el) => { el.disabled = disabled; });
    const openBtn = $('#btnOpenScenarioWizard');
    if (openBtn) {
      openBtn.disabled = disabled;
      openBtn.title = disabled ? 'Ajoutez d\'abord une charge' : '';
    }

    const charge = state.charges.find((c) => c.id === sel.value);
    $('#sOption').placeholder = charge ? HINTS[charge.categorie] : 'Ajoutez d\'abord une charge';
    renderPreview();
  }

  function renderPreview() {
    const box = $('#sPreview');
    if (!box) return;
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
    if (!$('#ecoMois')) return;
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
      updateScrollArrows($('#scTableWrap'), $('#scScrollLeft'), $('#scScrollRight'));
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
        class: 'icon-btn', type: 'button', 'aria-label': `Effacer la comparaison ${sc.option}`, title: 'Effacer',
        onclick: () => {
          confirmDelete('Supprimer cette comparaison ?', [
            ['Ligne', charge.nom],
            ['Option alternative', sc.option || '–'],
            ['Actuel / mois', eur2.format(charge.mensuel)],
            ['Nouveau / mois', eur2.format(sc.nouveau)],
            ['Écart / mois', `${sign}${eur2.format(Math.abs(eco))}`]
          ], () => {
            state.scenarios = state.scenarios.filter((x) => x.id !== sc.id);
            refresh();
          });
        }
      });
      del.innerHTML = TRASH_ICON;

      const ligneCell = h('td', {}, charge.nom, h('span', { class: 'sub' }, charge.categorie));
      const actuelCell = h('td', { class: 'num' }, eur2.format(charge.mensuel));
      const nouveauCell = h('td', { class: 'num' }, eur2.format(sc.nouveau));
      const ecartMoisCell = h('td', { class: `num delta delta--${kind}` }, `${sign}${eur2.format(Math.abs(eco))}`, h('small', {}, label));
      const ecartAnCell = h('td', { class: `num delta delta--${kind}` }, `${sign}${eur2.format(Math.abs(annual(eco)))}`, h('small', {}, label));
      const actionsCell = h('td', { class: 'num' }, eco > 0 ? apply : null, del);

      body.append(MOBILE_QUERY.matches
        ? h('tr', {}, ligneCell, optionCell, ecartMoisCell, actuelCell, nouveauCell, ecartAnCell, actionsCell)
        : h('tr', {}, ligneCell, optionCell, actuelCell, nouveauCell, ecartMoisCell, ecartAnCell, actionsCell));
    }
    updateScrollArrows($('#scTableWrap'), $('#scScrollLeft'), $('#scScrollRight'));
  }

  function bindScenarios() {
    if (!$('#scForm')) return;
    bindScrollArrows($('#scTableWrap'), $('#scScrollLeft'), $('#scScrollRight'));
    MOBILE_QUERY.addEventListener('change', renderScenarios);
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
    $('#sLigneBtn').addEventListener('click', () => pickCharge($('#sLigne').value, (id) => {
      $('#sLigne').value = id;
      renderScenarioForm();
      $('#sLigneBtn').focus();
    }));
    $('#sMontant').addEventListener('input', renderPreview);
    bindAddWizard({
      openBtn: '#btnOpenScenarioWizard', overlay: '#scenarioWizardOverlay', form: '#scForm',
      closeBtn: '#scenarioWizardClose', backBtn: '#scenarioWizardBack',
      nextBtn: '#scenarioWizardNext', finishBtn: '#scenarioWizardFinish', stepLabel: '#scenarioWizardStepLabel',
      steps: ['[data-step="1"]', '[data-step="2"]', '[data-step="3"]'],
      fields: ['#sLigneBtn', '#sMontant', '#sOption']
    });
    bindResponsiveTrigger('#btnOpenScenarioWizard', '#addScenarioMobileSlot', '#economies .card__head');
    $('#btnClearScenarios').addEventListener('click', () => {
      confirmDelete('Effacer TOUTES les économies ?', [], () => {
        state.scenarios = [];
        refresh();
      }, { center: true });
    });
  }

  /* ==========================================================================
     3. Rendement
     ========================================================================== */

  function syncYieldInputs() {
    if (!$('#yCapital')) return;
    $('#yCapital').value = state.yield.capital;
    $('#yVersement').value = state.yield.versement;
    $('#yAnnees').value = state.yield.annees;
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
  const gainYearLabel = (n) => `Année ${n}`;

  /** Tableau comparatif des deux rendements, construit une seule fois :
      libellés à gauche (Capital, Épargné, Intérêts, Année X avec boutons
      haut/bas), une colonne par taux avec son champ « … % » en en-tête
      (« Rendement (annuel) » à gauche indique que c'est un taux par an). Mis à jour sur place pour ne pas recréer le champ en cours de
      saisie. */
  let yieldCards = null;
  const chevron = (d) => s('svg', { width: 10, height: 10, viewBox: '0 0 16 16', 'aria-hidden': 'true' },
    s('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));

  function yieldCardEls() {
    if (yieldCards) return yieldCards;
    const cols = ['taux1', 'taux2'].map((key, i) => {
      const rate = h('input', {
        class: 'cmp__rate', type: 'number', min: 0, max: MAX_RATE, step: 0.01, inputmode: 'decimal',
        'aria-label': `Rendement ${i + 1}, en % par an`
      });
      rate.addEventListener('input', () => {
        state.yield[key] = clamp(num(rate.value), 0, MAX_RATE);
        onYieldChange();
      });
      return {
        rate,
        col: h('col', {}),
        head: h('th', { scope: 'col', class: 'cmp__head' },
          h('label', { class: 'cmp__rate-field' }, rate, ' %')),
        big: h('td', {}),
        dep: h('td', {}),
        gain: h('td', { class: 'good' }),
        yearGain: h('td', { class: 'good' })
      };
    });

    const yearLbl = h('span', {});
    const up = h('button', { type: 'button', class: 'year-step__btn', 'aria-label': 'Année suivante' }, chevron('M4 10l4-4 4 4'));
    const down = h('button', { type: 'button', class: 'year-step__btn', 'aria-label': 'Année précédente' }, chevron('M4 6l4 4 4-4'));
    const stepYear = (delta) => {
      state.yield.anneeGain = clamp(state.yield.anneeGain + delta, 1, state.yield.annees);
      onYieldChange();
    };
    up.addEventListener('click', () => stepYear(1));
    down.addEventListener('click', () => stepYear(-1));

    const row = (label, cls, cell, attrs = {}) =>
      h('tr', { class: cls }, h('th', { scope: 'row', ...attrs }, label), ...cols.map((c) => c[cell]));
    const table = h('table', { class: 'cmp' },
      h('caption', { class: 'sr-only' }, 'Comparaison des deux rendements'),
      h('colgroup', {}, h('col', { class: 'cmp__labels' }), cols.map((c) => c.col)),
      // « Rendement » écrit une fois, au-dessus de Capital, pour les deux colonnes.
      h('thead', {}, h('tr', {}, h('th', { scope: 'row' }, 'Rendement (annuel)'), cols.map((c) => c.head))),
      h('tbody', {},
        row('Capital', 'cmp__capital', 'big'),
        row('Épargné', null, 'dep'),
        row('Intérêts', null, 'gain'),
        row(h('span', { class: 'year-step' }, yearLbl, h('span', { class: 'year-step__btns' }, up, down)), null, 'yearGain')
      ));

    yieldCards = { cols, yearLbl, up, down };
    $('#yieldCards').replaceChildren(table);
    return yieldCards;
  }

  function onYieldChange() {
    renderYield();
    renderSummary();
    renderSynthese();
    save();
  }

  function renderYield() {
    if (!$('#h-rend')) return;
    const { years, results, gainYear } = computeYield();
    const [low, high] = results;
    const deposited = low.pts[years].deposited;
    const rLow = fmtRate(low.rate);
    const rHigh = fmtRate(high.rate);

    // En-têtes du tableau année par année qui suivent les taux choisis
    $('#thCapLow').textContent = `Capital à ${rLow}`;
    $('#thGainLow').textContent = `Gain à ${rLow}`;
    $('#thCapHigh').textContent = `Capital à ${rHigh}`;
    $('#thGainHigh').textContent = `Gain à ${rHigh}`;

    // Cartes de résultat : une par taux saisi (taux1 puis taux2), mises à
    // jour sur place pour ne pas recréer le champ Rendement en cours de saisie.
    // La couleur suit le rang du taux (le plus bas = r2), comme le graphique.
    const { taux1, taux2 } = state.yield;
    const ui = yieldCardEls();
    ui.cols.forEach((c, i) => {
      const rate = i === 0 ? taux1 : taux2;
      const isLow = i === 0 ? taux1 <= taux2 : taux2 < taux1;
      const { pts } = isLow ? low : high;
      const last = pts[years];
      // Couleur de la colonne = celle de sa courbe (taux le plus bas = r2).
      for (const el of [c.col, c.head]) {
        el.classList.toggle('cmp--r2', isLow);
        el.classList.toggle('cmp--r10', !isLow);
      }
      if (document.activeElement !== c.rate) c.rate.value = rate;
      c.big.textContent = eur0.format(last.balance);
      c.dep.textContent = eur0.format(last.deposited);
      c.gain.textContent = `+${eur0.format(last.balance - last.deposited)}`;
      c.yearGain.textContent = `+${eur0.format(gainOfYear(pts, gainYear))}`;
    });
    ui.yearLbl.textContent = gainYearLabel(gainYear);
    ui.down.disabled = gainYear <= 1;
    ui.up.disabled = gainYear >= years;

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
    if (!$('#yCapital')) return;
    const read = () => {
      state.yield.capital = num($('#yCapital').value);
      state.yield.versement = num($('#yVersement').value);
      state.yield.annees = clamp(Math.round(num($('#yAnnees').value)) || 1, 1, 50);
      // L'année du gain (boutons haut/bas des tuiles) reste dans la durée.
      state.yield.anneeGain = clamp(state.yield.anneeGain, 1, state.yield.annees);
      onYieldChange();
    };
    ['#yCapital', '#yVersement', '#yAnnees']
      .forEach((sel) => $(sel).addEventListener('input', read));

    const ecoMonthly = () => Math.round(computeSavings().monthly * 100) / 100;
    $('#btnUseEco').addEventListener('click', () => {
      const eco = ecoMonthly();
      if (eco <= 0) return;
      state.yield.versement = eco;
      syncYieldInputs();
      onYieldChange();
    });

    // Pop-up « Simuler un placement » : préremplie avec la simulation en
    // cours, appliquée d'un coup sur Terminer.
    const wizardOverlay = $('#yieldWizardOverlay');
    $('#btnOpenYieldWizard').addEventListener('click', () => {
      const y = state.yield;
      $('#wCapital').value = y.capital;
      $('#wVersement').value = y.versement;
      $('#wAnnees').value = y.annees;
      $('#wTaux1').value = y.taux1;
      $('#wTaux2').value = y.taux2;
      $('#wBtnUseEco').disabled = ecoMonthly() <= 0;
      $('#wBtnUseEco').title = $('#btnUseEco').title;
    });
    $('#wBtnUseEco').addEventListener('click', () => {
      const eco = ecoMonthly();
      if (eco > 0) $('#wVersement').value = eco;
    });
    // Listener ajouté avant celui de bindAddWizard, qui ferme ensuite la pop-up.
    $('#yieldWizardForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const y = state.yield;
      y.capital = num($('#wCapital').value);
      y.versement = num($('#wVersement').value);
      y.annees = clamp(Math.round(num($('#wAnnees').value)) || 1, 1, 50);
      y.taux1 = clamp(num($('#wTaux1').value), 0, MAX_RATE);
      y.taux2 = clamp(num($('#wTaux2').value), 0, MAX_RATE);
      y.anneeGain = clamp(y.anneeGain, 1, y.annees);
      syncYieldInputs();
      onYieldChange();
    });
    bindAddWizard({
      openBtn: '#btnOpenYieldWizard', overlay: '#yieldWizardOverlay', form: '#yieldWizardForm',
      closeBtn: '#yieldWizardClose', backBtn: '#yieldWizardBack',
      nextBtn: '#yieldWizardNext', finishBtn: '#yieldWizardFinish', stepLabel: '#yieldWizardStepLabel',
      steps: ['[data-step="1"]', '[data-step="2"]', '[data-step="3"]', '[data-step="4"]'],
      fields: ['#wVersement', '#wCapital', '#wAnnees', '#wTaux1']
    });
    bindResponsiveTrigger('#yieldActions', '#addYieldMobileSlot', '#rendement .card__head');

    // Pop-up d'exemples : chaque bouton préremplit épargne/durée/taux depuis ses data-attributes.
    document.querySelectorAll('.example-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        // Depuis la pop-up « Simuler un placement » : l'exemple préremplit
        // seulement ses champs, l'utilisateur poursuit avec Suivant puis
        // valide avec Terminer (rien n'est appliqué à la simulation avant).
        if (wizardOverlay && !wizardOverlay.hidden) {
          $('#wVersement').value = num(btn.dataset.mensuel);
          $('#wAnnees').value = clamp(Math.round(num(btn.dataset.annees)) || 1, 1, 50);
          $('#wTaux1').value = clamp(num(btn.dataset.taux1), 0, MAX_RATE);
          $('#wTaux2').value = clamp(num(btn.dataset.taux2), 0, MAX_RATE);
          $('#exampleClose').click();
          $('#wVersement').focus();
          return;
        }
        state.yield.versement = num(btn.dataset.mensuel);
        state.yield.annees = clamp(Math.round(num(btn.dataset.annees)) || 1, 1, 50);
        state.yield.taux1 = clamp(num(btn.dataset.taux1), 0, MAX_RATE);
        state.yield.taux2 = clamp(num(btn.dataset.taux2), 0, MAX_RATE);
        state.yield.anneeGain = clamp(state.yield.anneeGain, 1, state.yield.annees);
        syncYieldInputs();
        onYieldChange();
        $('#exampleClose').click();
      });
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
    if (!$('#viewMois')) return;
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
      $('#barScrollLeft').hidden = true;
      $('#barScrollRight').hidden = true;
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
    updateScrollArrows($('#barScroll'), $('#barScrollLeft'), $('#barScrollRight'));
  }

  /** Affiche/masque une paire de flèches selon la position de scroll horizontal de leur conteneur. */
  function updateScrollArrows(scrollEl, leftBtn, rightBtn) {
    const canScroll = scrollEl.scrollWidth > scrollEl.clientWidth + 1;
    leftBtn.hidden = !canScroll || scrollEl.scrollLeft <= 0;
    rightBtn.hidden = !canScroll || scrollEl.scrollLeft >= scrollEl.scrollWidth - scrollEl.clientWidth - 1;
  }

  /** Relie une paire de flèches à leur conteneur défilant (clic = défile, scroll = rafraîchit l'affichage). */
  function bindScrollArrows(scrollEl, leftBtn, rightBtn) {
    updateScrollArrows(scrollEl, leftBtn, rightBtn);
    scrollEl.addEventListener('scroll', () => updateScrollArrows(scrollEl, leftBtn, rightBtn));
    leftBtn.addEventListener('click', () => {
      scrollEl.scrollBy({ left: -scrollEl.clientWidth * 0.8, behavior: 'smooth' });
    });
    rightBtn.addEventListener('click', () => {
      scrollEl.scrollBy({ left: scrollEl.clientWidth * 0.8, behavior: 'smooth' });
    });
  }

  function bindSynthese() {
    if (!$('#viewMois')) return;
    const setView = (v) => { state.view = v; renderSynthese(); save(); };
    $('#viewMois').addEventListener('click', () => setView('mois'));
    $('#viewAn').addEventListener('click', () => setView('an'));

    const scrollEl = $('#barScroll');
    bindScrollArrows(scrollEl, $('#barScrollLeft'), $('#barScrollRight'));

    // Ni export PDF ni impression réels : on s'appuie sur la boîte de dialogue
    // d'impression du navigateur (feuille @media print dédiée), qui propose déjà
    // « Enregistrer en PDF » comme destination.
    $('#btnExportPdf')?.addEventListener('click', () => window.print());
    $('#btnPrint')?.addEventListener('click', () => window.print());

    if ('ResizeObserver' in window) {
      let lastW = 0;
      new ResizeObserver(() => {
        const w = Math.floor(scrollEl.clientWidth);
        if (w && w !== lastW) { lastW = w; if (synModel) renderBars(synModel); }
      }).observe(scrollEl);
    }
  }

  /* ==========================================================================
     Résumé (tuiles du haut)
     ========================================================================== */

  function renderSummary() {
    if (!$('#kpiRevenus')) return;
    const m = totalMonthly();
    const rev = totalRevenus();
    $('#kpiRevenus').textContent = eur2.format(rev);
    $('#kpiRevenusSub').textContent = `${eur2.format(annual(rev))} par an`;
    setSigned($('#kpiSolde'), rev - m);
    $('#kpiSoldeSub').textContent = `${eur2.format(annual(rev - m))} par an`;
    $('#kpiMensuel').textContent = eur2.format(m);
    $('#kpiNbLignes').textContent = `${state.charges.length} poste${state.charges.length > 1 ? 's' : ''}`;
    $('#kpiAnnuel').textContent = eur2.format(annual(m));

    const eco = computeSavings();
    $('#kpiEco').textContent = eur2.format(eco.monthly);
    $('#kpiEcoSub').textContent = m > 0 && eco.monthly > 0
      ? `${eur2.format(eco.annual)} /an`
      : 'Ajoutez des comparaisons (partie 3)';

    const { years, results } = computeYield();
    const [low, high] = results;
    $('#kpiCapLabel').textContent = `Capital dans ${years} an${years > 1 ? 's' : ''}`;
    const kpiCap = $('#kpiCap');
    kpiCap.replaceChildren(eur0.format(high.pts[years].balance) + ' ', h('span', { class: 'tile__unit' }, `(${fmtRate(high.rate)})`));
    $('#kpiCapSub').textContent = `${eur0.format(low.pts[years].balance)} (${fmtRate(low.rate)})`;
  }

  /* ==========================================================================
     Démarrage
     ========================================================================== */

  /** Recalcule tout sauf le tableau des charges (pour ne pas perdre le focus pendant la saisie). */
  function refresh() {
    renderRevenusTotals();
    renderChargeTotals();
    renderDepenseTotals();
    renderScenarioForm();
    renderScenarios();
    renderYield();
    renderSummary();
    renderSynthese();
    renderCashback();
    renderRoundUp();
    save();
  }

  function init() {
    renderLineForms();
    bindLines();
    bindDepenses();
    bindHistorique();
    bindCashback();
    bindRoundUp();
    bindScenarios();
    bindYield();
    bindInfoModal('#rendementInfoBtn', '#infoOverlay', '#infoClose');
    bindInfoModal('#btnExemple', '#exampleOverlay', '#exampleClose');
    bindInfoModal('#wBtnExemple', '#exampleOverlay', '#exampleClose');
    bindInfoModal('#soldeMoisInfoBtn', '#soldeInfoOverlay', '#soldeInfoClose');
    bindSynthese();
    // Pages Exporter et Imprimer uniquement (report.js n'est chargé que là).
    window.Report?.bindExport({ state, totalRevenus, totalMonthly, computeSavings, computeYield, cashbackFraction, roundUpAmount, CAT_KEY });
    syncYieldInputs();
    renderLines('revenus');
    renderLines('charges');
    renderDepenses();
    refresh();
  }

  init();
})();
