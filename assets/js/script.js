/* ==========================================================================
   Gestion budget — pages du tableau de bord (Synthèse, Revenus, Charges,
   Dépenses, Économie, Placement, CashBack, RoundUp, Sauvegarder, Imprimer).
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
      'Placement': 'Ex. Versement programmé ETF, assurance vie',
      'Prêt': 'Ex. Crédit immobilier, prêt auto',
      'Famille / Proche': 'Ex. Aide aux parents, argent de poche',
      'Autre': 'Ex. Pension alimentaire (enfants)'
    },
    // Dépenses : le champ demande où la dépense a été faite (magasin, lieu, site).
    depenses: {
      'Course': 'Ex. Carrefour, Monoprix, Lidl',
      'Alimentaire': 'Ex. Boulangerie, marché, Picard',
      'Transport': 'Ex. Station Total, SNCF, parking',
      'Shopping': 'Ex. Amazon, Zara, Decathlon',
      'Divertissement': 'Ex. Steam, PlayStation Store, Fnac',
      'Sortie': 'Ex. Cinéma Pathé, bowling, bar',
      'Détente': 'Ex. Spa, massage, hammam',
      'Équipement': 'Ex. Darty, Boulanger, Ikea',
      'Entretien ménager': 'Ex. Action, supermarché',
      'Cadeau': 'Ex. Fleuriste, Fnac, en ligne',
      'Famille / Proche': 'Ex. Chez mes parents, parc d\'attractions',
      'Santé': 'Ex. Pharmacie, médecin, opticien',
      'Amende': 'Ex. Amende en ligne (ANTAI), mairie',
      'Imprévu': 'Ex. Garage, plombier',
      'Restaurant': 'Ex. Pizzeria, Uber Eats, fast-food',
      'Épargne': 'Ex. Livret A à ma banque',
      'Placement': 'Ex. PEA, courtier en ligne',
      'Autre': 'Ex. En ligne, mairie, chez un particulier'
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
    'Placement': 'Ex. Frais de courtage plus bas, ETF moins chargé',
    'Prêt': 'Ex. Renégociation du taux, rachat de crédit',
    'Famille / Proche': 'Ex. Budget fixe, montant revu ensemble',
    Autre: 'Ex. Option moins chère'
  };
  const MONTHS = Calc.MONTHS;
  const { CATEGORIES, REV_CATEGORIES, DEP_CATEGORIES, MAX_RATE, ROUND_UP_OPTIONS,
    uid, num, clamp, readRate } = BudgetState;
  const { $, h, s, MOBILE_QUERY, eur2, eur0, eurCompact, pct1, rateNf, fmtRate, capitalize, monthLabel,
    currentMonthName, openModal, confirmDialog: confirmDelete, bindInfoModal,
    openPicker, pickerOpt, pickCategory, bindAddWizard, bindResponsiveTrigger,
    niceScale, arcPath, ringPath, roundUpOf, itemDetails, fmtAjoutDate } = UI;

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

  const saved = store.get(STORAGE_KEY);
  const profil = Profiles.active();
  // Profil d'exemple, ou profil créé « pré-rempli » jamais ouvert : budget fictif.
  // Sinon un budget vide (premier usage : la page Guide propose de le remplir).
  const state = !saved && (profil.exemple || profil.preRempli) ? BudgetState.exampleState() : BudgetState.load(saved);
  const save = () => store.set(STORAGE_KEY, state);
  // Nouveau mois : les dépenses du mois précédent passent dans l'historique.
  if (BudgetState.archiveMonth(state)) save();
  // Autre onglet qui modifie ce profil ou change de profil actif : on recharge,
  // sinon la prochaine saisie ici écraserait ses changements. Une écriture
  // identique à l'état affiché est ignorée (pas de rechargements en boucle).
  window.addEventListener('storage', (e) => {
    if (e.key === null || (e.key === STORAGE_KEY && e.newValue !== JSON.stringify(state))
      || STORAGE_KEY !== Profiles.dataKey()) location.reload();
  });

  /* ---------- Calculs (les fonctions pures vivent dans calc.js, testées à part) ---------- */

  const annual = Calc.annual;
  /** Taux de cashback configurable (state.cashbackRate, en %), en fraction (0.01 = 1 %). */
  const cashbackFraction = () => state.cashbackRate / 100;

  /** Round up au multiple state.roundUpTo (règle dans ui.js, partagée avec la page Suivi). */
  const roundUpAmount = (montant) => roundUpOf(montant, state.roundUpTo);
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
      newestFirst: true, compact: true
    },
    charges: {
      body: '#chargesBody', cats: sortAlpha(CATEGORIES),
      empty: 'Aucune charge pour le moment. Ajoutez votre première ligne ci-dessus.',
      wrap: '#chargesTableWrap', left: '#chargesScrollLeft', right: '#chargesScrollRight',
      newestFirst: true, compact: true
    }
  };

  // Mobile et tablette (même seuil que la règle CSS « Tablette ») : tableaux
  // simplifiés (Dépenses, Charges, Revenus), voir renderDepenses et renderLines.
  const COMPACT_QUERY = window.matchMedia('(max-width: 900px)');

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

  /** Pop-up Détail d'une ligne (ui.js) : Modifier, et Effacer si onDelete
      est donné. Après Valider, les tableaux et totaux de la page suivent ;
      onSaved (facultatif) : mise à jour en plus (pop-up du jour…). */
  function showItemDetails(item, kind, onDelete, onSaved) {
    itemDetails(item, kind, {
      state, onDelete,
      onSaved: () => {
        if (kind === 'depenses') renderDepenses(); else renderLines(kind);
        refresh();
        onSaved?.();
      }
    });
  }

  /** Effacer depuis le pop-up Détail d'une charge ou d'une dépense :
      confirmation, suppression, puis done() ferme le pop-up et after()
      (facultatif) met à jour ce qui en dépend (pop-up du jour…). */
  function askDeleteItem(item, kind, done, after) {
    const isCharge = kind === 'charges';
    confirmDelete(`Supprimer ${isCharge ? 'cette charge' : 'cette dépense'} ?`, [
      ['Catégorie', item.categorie],
      ['Libellé', item.nom],
      [isCharge ? 'Valeur' : 'Montant', isCharge ? `${eur2.format(item.mensuel)} / mois` : eur2.format(item.montant)]
    ], () => {
      BudgetState.removeItem(state, item, kind);
      done();
      refresh();
      after?.();
    });
  }

  /** Ligne d'un tableau CashBack / Round Up (cashback.html, roundUp.html) :
      un appui (ou Entrée / Espace) ouvre le pop-up Détail de la charge ou de
      la dépense, modifiable et effaçable. */
  function avantageRow(item, kind, ...cells) {
    const open = () => showItemDetails(item, kind, (done) => askDeleteItem(item, kind, done));
    return h('tr', {
      class: 'row-open', tabindex: '0', 'aria-label': `Voir le détail de ${item.nom}`,
      onclick: open,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }
    }, ...cells);
  }

  /** Bouton œil d'une charge ou d'une dépense : toutes ses informations, cashback
      et round up compris (lus au clic, donc toujours à jour des modifications). */
  function detailButton(item, kind, onDelete) {
    const btn = h('button', {
      class: 'icon-btn icon-btn--view', type: 'button', 'aria-label': `Voir le détail de ${item.nom}`, title: 'Voir le détail',
      onclick: () => showItemDetails(item, kind, onDelete)
    });
    btn.innerHTML = EYE_ICON;
    return btn;
  }

  function renderLines(type) {
    const cfg = LINE_TYPES[type];
    const body = $(cfg.body);
    if (!body) return;
    body.replaceChildren();
    // Charges et revenus en mobile/tablette : Libellé et Mensuel seuls, ligne cliquable.
    const compact = cfg.compact && COMPACT_QUERY.matches;

    if (!state[type].length) {
      body.append(h('tr', {}, h('td', { colspan: compact ? 2 : 5, class: 'empty' }, cfg.empty)));
      updateScrollArrows($(cfg.wrap), $(cfg.left), $(cfg.right));
      return;
    }

    // Pour les charges, la plus récemment ajoutée s'affiche en haut (ordre
    // d'ajout inversé) ; les revenus gardent l'ordre d'ajout tel quel.
    const items = cfg.newestFirst ? [...state[type]].reverse() : state[type];

    for (const c of items) {
      /** Suppression confirmée ; done() (facultatif) ferme le pop-up de détail. */
      const askDelete = (done) => {
        confirmDelete(`Supprimer ${type === 'revenus' ? 'ce revenu' : 'cette charge'} ?`, [
          ['Catégorie', c.categorie],
          ['Libellé', c.nom],
          ['Valeur', `${eur2.format(c.mensuel)} / mois`]
        ], () => {
          BudgetState.removeItem(state, c, type);
          done?.();
          renderLines(type);
          refresh();
        });
      };

      // Ni champ, ni œil, ni corbeille, ni Catégorie / Annuel : un appui sur
      // la ligne ouvre le pop-up de détail (modification, suppression).
      if (compact) {
        const open = () => showItemDetails(c, type, askDelete);
        body.append(h('tr', {
          class: 'row-open', tabindex: '0', 'aria-label': `Voir le détail de ${c.nom}`,
          onclick: open,
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }
        },
        h('td', { class: 'cell-text' }, c.nom),
        h('td', { class: 'num' }, eur2.format(c.mensuel))
        ));
        continue;
      }

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
        onclick: () => askDelete()
      });
      del.innerHTML = TRASH_ICON;
      const actions = h('td', { class: 'num row-actions' }, detailButton(c, type, askDelete), del);

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

  /** Répartition par catégorie (barres proportionnelles + montant + part du
      total) ; kind ('revenus', 'charges', 'depenses') : un appui sur une
      catégorie ouvre le détail de ses lignes (pop-up #bdOverlay). */
  function renderBreakdown(box, cats, items, amountOf, total, emptyMsg, kind) {
    renderShareBars(box, cats.map((cat) => {
      const lines = items.filter((x) => x.categorie === cat);
      return {
        label: cat, total: lines.reduce((a, x) => a + amountOf(x), 0),
        open: kind && $('#bdOverlay') ? () => openBreakdownDetails(cat, kind, (x) => x.categorie === cat) : null
      };
    }), total, emptyMsg);
  }

  /** Pop-up simplifié de la répartition (lecture seule) pour une catégorie,
      un produit ou une habitude : chaque ligne avec son libellé, sa date et
      son heure d'ajout et son montant, de la plus ancienne à la plus
      récente, puis le total. Lu à l'ouverture, donc toujours à jour.
      kind : 'revenus', 'charges' ou 'depenses' ; match(x) : lignes retenues ;
      amountOf(x) : montant affiché (par défaut mensuel ou montant). */
  function openBreakdownDetails(title, kind, match, amountOf) {
    const overlay = $('#bdOverlay');
    const monthly = kind !== 'depenses';
    amountOf ||= (x) => (monthly ? x.mensuel : x.montant);
    const type = { revenus: 'revenu', charges: 'charge', depenses: 'depense' }[kind];
    const lines = state[kind].filter((x) => match(x) && amountOf(x) > 0)
      .sort((a, b) => (a.ajout ? Date.parse(a.ajout) : Infinity) - (b.ajout ? Date.parse(b.ajout) : Infinity));
    const when = (iso) => {
      if (!iso) return 'Date non connue';
      const d = new Date(iso);
      return `${fmtAjoutDate(d)} · ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
    };
    const suffix = monthly ? ' / mois' : '';
    const total = lines.reduce((t, x) => t + amountOf(x), 0);
    $('#bdTitle').textContent = title;
    $('#bdList').replaceChildren(
      ...lines.map((x) => h('li', { class: `cal-ev cal-ev--${type}` },
        h('span', { class: 'sw', 'aria-hidden': 'true' }),
        h('span', { class: 'cal-ev__name' }, x.nom, h('span', { class: 'cal-ev__cat' }, when(x.ajout))),
        h('span', { class: 'cal-ev__amount' }, `${eur2.format(amountOf(x))}${suffix}`))),
      ...(lines.length > 1 ? [h('li', { class: 'cal-ev cal-ev--solde' },
        h('span', { class: 'sw', 'aria-hidden': 'true' }),
        h('span', { class: 'cal-ev__name' }, 'Total'),
        h('span', { class: 'cal-ev__amount' }, `${eur2.format(total)}${suffix}`))] : []));
    const close = openModal(overlay, {
      focus: '#bdClose',
      onClose: () => $('#bdClose').removeEventListener('click', close)
    });
    $('#bdClose').addEventListener('click', close);
  }

  /** Barres de répartition (libellé, barre, montant, part du total), de la
      plus grosse à la plus petite ; les lignes à 0 sont ignorées. Une ligne
      avec rename (nom actuel + callback) affiche un libellé cliquable qui se
      change en champ pour la renommer (Entrée ou clic ailleurs : valider,
      Échap : annuler). Une ligne avec open s'ouvre d'un appui n'importe où ;
      avec openBar (lignes renommables), seule la barre ouvre le détail. */
  function renderShareBars(box, rows, total, emptyMsg) {
    box.replaceChildren();
    const sorted = rows.filter((x) => x.total > 0).sort((a, b) => b.total - a.total);

    if (!sorted.length) {
      box.append(h('p', { class: 'note' }, emptyMsg));
      return;
    }
    const max = sorted[0].total;
    for (const { label, title, total: rowTotal, rename, open, openBar } of sorted) {
      // open : toute la ligne ouvre le détail ; le libellé, en bouton, la rend accessible au clavier.
      const name = rename ? renameLabel(label, rename)
        : open ? h('button', { type: 'button', class: 'bd__name bd__name--open', title: `Voir le détail de ${label}` }, label)
          : h('span', { class: 'bd__name', title: title || label }, label);
      box.append(h('div', { class: open ? 'bd bd--open' : 'bd', onclick: open },
        name,
        openBar
          ? h('button', { type: 'button', class: 'bd__track bd__track--open', 'aria-label': `Voir le détail de ${label}`, title: 'Voir le détail', onclick: openBar },
            h('span', { class: 'bd__bar', style: `width:${(rowTotal / max) * 100}%` }))
          : h('div', { class: 'bd__track', role: 'presentation' },
            h('div', { class: 'bd__bar', style: `width:${(rowTotal / max) * 100}%` })),
        h('span', { class: 'bd__amt' }, eur2.format(rowTotal)),
        h('span', { class: 'bd__pct' }, total > 0 ? pct1.format(rowTotal / total) : '')
      ));
    }
  }

  /** Libellé de barre renommable : bouton (avec un crayon) qui laisse place à
      un champ texte prérempli. */
  function renameLabel(label, { value, onRename }) {
    const btn = h('button', {
      type: 'button', class: 'bd__name bd__name--edit', title: `Renommer « ${value} »`,
      'aria-label': `Renommer ${value}`
    }, h('span', { class: 'bd__label' }, label));
    btn.insertAdjacentHTML('beforeend', '<svg class="bd__pen" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>');
    btn.addEventListener('click', () => {
      const input = h('input', {
        type: 'text', class: 'cell bd__input', maxlength: 60, 'aria-label': `Nouveau nom de ${value}`
      });
      input.value = value;
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        const next = input.value.trim();
        if (ok && next && next !== value) onRename(next);
        else input.replaceWith(btn);
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); btn.focus(); }
      });
      input.addEventListener('blur', () => finish(true));
      btn.replaceWith(input);
      input.focus();
      input.select();
    });
    return btn;
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
      'Ajoutez des revenus pour voir leur répartition.', 'revenus');
  }

  function renderChargeTotals() {
    if (!$('.chg-tot-mensuel')) return;
    const m = totalMonthly();
    setAllText('.chg-tot-mensuel', eur2.format(m));
    setAllText('.chg-tot-annuel', eur2.format(annual(m)));

    renderBreakdown($('#breakdown'), CATEGORIES, state.charges, (c) => c.mensuel, m,
      'Ajoutez des charges pour voir leur répartition.', 'charges');
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
      if ($(cfg.body) && cfg.compact) COMPACT_QUERY.addEventListener('change', () => renderLines(type));
    }

    const clearCharges = () => {
      confirmDelete('Effacer TOUTES les charges ?', [], () => {
        const ids = new Set(state.charges.map((c) => c.id));
        state.charges = [];
        state.scenarios = state.scenarios.filter((x) => !ids.has(x.chargeId));
        state.appliquees = state.appliquees.filter((x) => !ids.has(x.chargeId));
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
        state.appliquees = [];
        state.depenses = [];
        state.depensesHistorique = [];
        state.produits = [];
        state.habitudes = [];
        state.suggestionsMasquees = { lieux: [], motifs: [] };
        renderLines('revenus');
        renderLines('charges');
        renderDepenses();
        refresh();
        // Budget entièrement vidé : on repart de zéro, guide de démarrage compris
        // (sinon un guide déjà « fini » ne se redéclenche jamais).
        if (!profil.exemple) {
          Profiles.setGuide(profil.id, null);
          location.href = location.pathname.includes('/pages/') ? 'guide.html' : 'pages/guide.html';
        }
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
      body.append(h('tr', {}, h('td', { colspan: COMPACT_QUERY.matches ? 2 : 4, class: 'empty' }, 'Aucune dépense pour le moment. Ajoutez votre premier achat ci-dessus.')));
      updateScrollArrows($('#depensesTableWrap'), $('#depensesScrollLeft'), $('#depensesScrollRight'));
      return;
    }

    // La dépense la plus récemment ajoutée s'affiche en haut (ordre d'ajout
    // inversé), plutôt que regroupée par catégorie.
    const ordered = [...state.depenses].reverse();

    for (const d of ordered) {
      /** Suppression confirmée ; done() (facultatif) ferme le pop-up de détail. */
      const askDelete = (done) => {
        confirmDelete('Supprimer cette dépense ?', [
          ['Catégorie', d.categorie],
          ['Libellé', d.nom],
          ['Montant', eur2.format(d.montant)]
        ], () => {
          state.depenses = state.depenses.filter((x) => x.id !== d.id);
          done?.();
          renderDepenses();
          refresh();
        });
      };

      // Mobile et tablette : ni champ, ni œil, ni corbeille, ni colonne
      // Catégorie ; un appui sur la ligne ouvre le pop-up de détail, d'où
      // l'on modifie ou efface la dépense.
      if (COMPACT_QUERY.matches) {
        const open = () => showItemDetails(d, 'depenses', askDelete);
        body.append(h('tr', {
          class: 'row-open', tabindex: '0', 'aria-label': `Voir le détail de ${d.nom}`,
          onclick: open,
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }
        },
        h('td', { class: 'cell-text' }, d.nom),
        h('td', { class: 'num' }, eur2.format(d.montant))
        ));
        continue;
      }

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
        onclick: () => askDelete()
      });
      del.innerHTML = TRASH_ICON;
      const actions = h('td', { class: 'num row-actions' }, detailButton(d, 'depenses', askDelete), del);

      body.append(h('tr', {},
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
    // Juste le mois en cours, avec une majuscule (« Novembre »).
    if ($('#depAchatsMoisSub')) $('#depAchatsMoisSub').textContent = moisNom.charAt(0).toUpperCase() + moisNom.slice(1);

    renderBreakdown($('#depBreakdown'), DEP_CATEGORIES, state.depenses, (d) => d.montant, total,
      'Ajoutez des dépenses pour voir leur répartition.', 'depenses');

    // Produits suivis du mois (seuls ou consommés par une habitude) : prix
    // seul de chacun (cumulé s'il a été racheté), en part des dépenses du mois.
    renderSuiviSection(SUIVI.produit, total, (d) => d.produit, (d) => d.produitPrix || 0);
    // Habitudes du mois : montant cumulé de chacune, et son coût sur un an si
    // chaque mois ressemblait à celui-ci.
    const habitudes = renderSuiviSection(SUIVI.habitude, total, (d) => d.habitude, (d) => d.montant);
    const an = $('#depHabitudeAn');
    if (an && habitudes.length) {
      // « Sur un an à ce rythme : » puis une habitude par ligne, la plus chère d'abord.
      an.replaceChildren('Sur un an à ce rythme :', ...habitudes
        .sort((x, y) => y.total - x.total)
        .flatMap((r) => [h('br'), `${r.nom} ≈ ${eur0.format(r.total * 12)}`]));
    }
  }

  /** Répartition du mois pour un type de suivi (produit ou habitude) : une
      barre par nom suivi (nameOf(d), vide si la dépense n'est pas suivie),
      renommable ; section masquée s'il n'y en a pas. Renvoie les lignes
      ({ nom, total, fois }). */
  function renderSuiviSection(kind, total, nameOf, amountOf) {
    const section = $(kind.section);
    if (!section) return [];
    const byNom = new Map();
    for (const d of state.depenses) {
      const nom = nameOf(d);
      if (!nom) continue;
      const key = suiviKey(nom);
      const row = byNom.get(key) || { nom, total: 0, fois: 0 };
      row.total += amountOf(d);
      row.fois += 1;
      byNom.set(key, row);
    }
    const rows = [...byNom.values()];
    section.hidden = !rows.length;
    renderShareBars($(kind.breakdown), rows.map((r) => ({
      label: r.fois > 1 ? `${r.nom} (×${r.fois})` : r.nom,
      total: r.total,
      rename: { value: r.nom, onRename: (nom) => { renameSuivi(kind, r.nom, nom); renderDepenses(); refresh(); } },
      // Appui sur la barre : dépenses du mois de ce produit / cette habitude (le libellé sert à renommer).
      openBar: $('#bdOverlay') ? () => openBreakdownDetails(r.nom, 'depenses', (d) => suiviKey(nameOf(d) || '') === suiviKey(r.nom), amountOf) : null
    })), total, '');
    return rows;
  }

  /* ---------- Produits et habitudes suivis ---------- */

  // Deux types de suivi : produit (besoin précis et répété) et habitude de
  // dépense (café, tabac…). list : catalogue dans state ; field : champ de la
  // dépense qui porte le nom suivi ; section/breakdown : répartition du mois.
  const SUIVI = {
    produit: { list: 'produits', field: 'produit', section: '#depProduitSection', breakdown: '#depProduitBreakdown' },
    habitude: { list: 'habitudes', field: 'habitude', section: '#depHabitudeSection', breakdown: '#depHabitudeBreakdown' }
  };
  const suiviKey = (nom) => nom.trim().toLocaleLowerCase('fr');
  /** Élément du catalogue (produit ou habitude) portant ce nom (casse ignorée), sinon undefined. */
  const findSuivi = (kind, nom) => state[kind.list].find((p) => suiviKey(p.nom) === suiviKey(nom));

  /** Renomme un produit ou une habitude partout : catalogue, dépenses du mois
      et de l'historique, et leur libellé s'il reprenait l'ancien nom. Si le
      nouveau nom est déjà pris dans le catalogue, les deux sont fusionnés. */
  function renameSuivi(kind, ancien, nouveau) {
    const nom = nouveau.trim().slice(0, 60);
    const oldKey = suiviKey(ancien);
    if (!nom) return;
    const existing = findSuivi(kind, nom);
    if (existing && suiviKey(existing.nom) !== oldKey) {
      state[kind.list] = state[kind.list].filter((p) => suiviKey(p.nom) !== oldKey);
    } else {
      const p = findSuivi(kind, ancien);
      if (p) p.nom = nom;
    }
    const finalNom = (existing && suiviKey(existing.nom) !== oldKey) ? existing.nom : nom;
    const relabel = (d) => {
      if (!d[kind.field] || suiviKey(d[kind.field]) !== oldKey) return;
      const ancienNom = d[kind.field];
      d[kind.field] = finalNom;
      if (d.nom === ancienNom) d.nom = finalNom;
      else if (d.nom === `${ancienNom} + autres articles`) d.nom = `${finalNom} + autres articles`.slice(0, 60);
    };
    state.depenses.forEach(relabel);
    state.depensesHistorique.forEach((m) => m.items.forEach(relabel));
  }
  /** Appui long (3 s) sur un bouton : onLong() au lieu du clic. Le bouton se
      remplit pendant l'appui (.is-pressing, voir CSS) ; bouger le doigt ou
      relâcher avant annule. Au clavier : touche Suppr ou Retour arrière. */
  const LONG_PRESS_MS = 3000;
  function bindLongPress(btn, onLong) {
    let timer = null;
    let start = null;
    let fired = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
      btn.classList.remove('is-pressing');
    };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      fired = false;
      start = { x: e.clientX, y: e.clientY };
      btn.classList.add('is-pressing');
      timer = setTimeout(() => {
        cancel();
        fired = true;
        onLong();
      }, LONG_PRESS_MS);
    });
    btn.addEventListener('pointermove', (e) => {
      if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(type, cancel);
    // Pas de menu contextuel (appui long sur mobile) ; pas de clic après l'appui long.
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      if (!fired) return;
      fired = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      e.preventDefault();
      onLong();
    });
  }

  function bindDepenses() {
    bindNomPlaceholder('#dCat', '#dNom', NOM_PLACEHOLDERS.depenses);
    const form = $('#depenseForm');
    // Étapes de la pop-up (même ordre que cfg.steps ci-dessous).
    const STEP = { suivi: 0, produit: 1, habitude: 2, cat: 3, montant: 4, nom: 5, motif: 6, prix: 7, avantages: 8 };
    const avecAutres = () => $('input[name="dAvec"]:checked')?.value === 'avec';
    const produitNom = () => ($('#dProduit')?.value || '').trim();
    const habitudeNom = () => ($('#dHabitude')?.value || '').trim();
    // Parcours choisi à la 1re étape « Que suivre ? » : 'general' (Dépense),
    // 'produit' ou 'habitude'.
    const mode = () => $('input[name="dSuivi"]:checked')?.value || 'general';
    const isPrecis = () => mode() === 'produit';

    /** Dernier prix payé pour ce produit (achat le plus récent du mois, sinon
        de l'historique, du plus récent au plus ancien), ou 0 s'il est inconnu. */
    const dernierPrix = (nom) => {
      const key = suiviKey(nom);
      const match = (d) => d.produit && suiviKey(d.produit) === key && d.produitPrix > 0;
      const d = [...state.depenses].reverse().find(match)
        || state.depensesHistorique.flatMap((m) => m.items).find(match);
      return d ? d.produitPrix : 0;
    };
    /** Préremplit le prix d'un produit déjà connu : l'utilisateur garde la
        valeur (Suivant) ou la modifie. Rien n'est écrasé tant que le produit
        n'a pas changé (retour en arrière après une correction). */
    const prefillPrix = (field) => {
      const key = suiviKey(produitNom());
      if (field.dataset.prefillFor === key) return;
      field.dataset.prefillFor = key;
      const prix = dernierPrix(produitNom());
      field.value = prix ? String(prix) : '';
      // Valeur sélectionnée : une frappe la remplace directement.
      if (prix) requestAnimationFrame(() => { try { field.select(); } catch { /* type non sélectionnable */ } });
    };
    let wizard = null;

    /** Cartes des noms déjà saisis (produits, habitudes, lieux ou motifs),
        filtrées par la saisie : un clic remplit le champ et passe à l'étape
        suivante. Mêmes boutons que « Choisir la catégorie » (le nom saisi,
        s'il est connu, mis en avant). opts.confirmPick(nom, ok) : confirmation
        avant de reprendre la carte ; opts.remove(nom) : retire la suggestion
        (appui long de 3 s ou touche Suppr, après confirmation). */
    const renderPicks = (names, input, box, list, opts = {}) => {
      const boxEl = $(box);
      const listEl = $(list);
      if (!boxEl || !listEl) return;
      const query = suiviKey($(input).value);
      const matches = sortAlpha(names).filter((nom) => !query || suiviKey(nom).includes(query));
      boxEl.hidden = !matches.length;
      const pick = (nom) => {
        $(input).value = nom;
        wizard?.next();
      };
      listEl.replaceChildren(...matches.map((nom) => {
        const btn = pickerOpt(nom, suiviKey(nom) === query,
          () => (opts.confirmPick ? opts.confirmPick(nom, () => pick(nom)) : pick(nom)), { title: nom });
        if (opts.remove) {
          bindLongPress(btn, () => confirmDelete('Retirer cette suggestion ?', [['', nom]], () => {
            opts.remove(nom);
            save();
            renderCurrentPicks();
          }, { center: true, okLabel: 'Retirer' }));
        }
        return btn;
      }));
    };
    /** Lieux ou motifs des dépenses du mois et de l'historique (field : 'nom'
        ou 'motif'), sans doublon ni suggestion retirée. */
    const pastValues = (field, keep, masques) => {
      const hidden = new Set(masques.map(suiviKey));
      const values = new Map();
      for (const d of [...state.depenses, ...state.depensesHistorique.flatMap((m) => m.items)]) {
        const v = d[field];
        if (v && keep(d) && !hidden.has(suiviKey(v)) && !values.has(suiviKey(v))) values.set(suiviKey(v), v);
      }
      return [...values.values()];
    };
    const sansNom = (list, nom) => list.filter((p) => suiviKey(p.nom) !== suiviKey(nom));
    const renderProduitPicks = () => renderPicks(state.produits.map((p) => p.nom),
      '#dProduit', '#dProduitsBox', '#dProduitsList',
      { remove: (nom) => { state.produits = sansNom(state.produits, nom); } });
    const renderHabitudePicks = () => renderPicks(state.habitudes.map((p) => p.nom),
      '#dHabitude', '#dHabitudesBox', '#dHabitudesList',
      { remove: (nom) => { state.habitudes = sansNom(state.habitudes, nom); } });
    // Lieux des achats (dépenses sans produit suivi) : repris d'un clic à l'étape « Où ».
    const renderNomPicks = () => renderPicks(
      pastValues('nom', (d) => !d.produit && !d.habitude, state.suggestionsMasquees.lieux),
      '#dNom', '#dNomsBox', '#dNomsList',
      { remove: (nom) => { state.suggestionsMasquees.lieux.push(nom); } });
    const renderMotifPicks = () => renderPicks(
      pastValues('motif', () => true, state.suggestionsMasquees.motifs),
      '#dMotif', '#dMotifsBox', '#dMotifsList', {
        // Carte coupée si le motif est long : il est confirmé en entier avant d'être repris.
        confirmPick: (nom, ok) => confirmDelete('Est-ce bien le motif ?', [['', nom]], ok,
          { center: true, okLabel: 'Oui', cancelLabel: 'Non', danger: false }),
        remove: (nom) => { state.suggestionsMasquees.motifs.push(nom); }
      });
    /** Cartes de l'étape affichée, redessinées après le retrait d'une suggestion. */
    const renderCurrentPicks = () => {
      const step = form?.querySelector('.wizard__step:not([hidden])')?.dataset.step;
      ({ produit: renderProduitPicks, habitude: renderHabitudePicks, nom: renderNomPicks, motif: renderMotifPicks })[step]?.();
    };

    /** Étape Prix : le champ « total de l'achat » n'apparaît que si le produit
        a été acheté avec d'autres articles ; ce total couvre au moins son prix. */
    const syncPrix = () => {
      const avec = avecAutres();
      const nom = produitNom();
      $('#dTotalField').hidden = !avec;
      $('#dPrixLabel').textContent = avec ? `Prix de « ${nom} » seul (€)` : `Combien avez-vous payé « ${nom} » ? (€)`;
      const total = $('#dTotal');
      total.setCustomValidity(avec && num(total.value) < num($('#dPrix').value)
        ? 'Le total de l’achat doit être au moins égal au prix du produit.' : '');
    };

    wizard = bindAddWizard({
      openBtn: '#btnOpenDepenseWizard', overlay: '#depenseWizardOverlay', form: '#depenseForm',
      closeBtn: '#depenseWizardClose', backBtn: '#depenseWizardBack',
      nextBtn: '#depenseWizardNext', finishBtn: '#depenseWizardFinish', stepLabel: '#depenseWizardStepLabel',
      steps: ['[data-step="suivi"]', '[data-step="produit"]', '[data-step="habitude"]', '[data-step="cat"]',
        '[data-step="montant"]', '[data-step="nom"]', '[data-step="motif"]', '[data-step="prix"]',
        '[data-step="avantages"]'],
      fields: ['input[name="dSuivi"]:checked', '#dProduit', '#dHabitude', '#dCatBtn', '#dMontant', '#dNom', '#dMotif',
        ['#dPrix', '#dTotal'], null],
      // Produit : produit, sa catégorie seulement s'il est nouveau, puis son
      // prix. Habitude : habitude, produit consommé (sa catégorie s'il est
      // nouveau), son prix puis le motif. Dépense : catégorie, montant, lieu.
      flow: () => {
        const m = mode();
        if (m === 'produit') {
          return [STEP.suivi, STEP.produit, ...(findSuivi(SUIVI.produit, produitNom()) ? [] : [STEP.cat]), STEP.prix,
            STEP.avantages];
        }
        if (m === 'habitude') {
          return [STEP.suivi, STEP.habitude, STEP.produit, ...(findSuivi(SUIVI.produit, produitNom()) ? [] : [STEP.cat]),
            STEP.montant, STEP.motif, STEP.avantages];
        }
        return [STEP.suivi, STEP.cat, STEP.montant, STEP.nom, STEP.avantages];
      },
      onOpen: () => {
        $('input[name="dSuivi"][value="general"]').checked = true;
        $('input[name="dAvec"][value="seul"]').checked = true;
        for (const sel of ['#dProduit', '#dHabitude', '#dMotif', '#dPrix', '#dTotal', '#dMontant']) {
          $(sel).value = '';
          delete $(sel).dataset.prefillFor;
        }
      },
      onStep: (i) => {
        const m = mode();
        // « Que suivre ? » : un clic sur Dépense, Produit ou Habitude passe
        // directement à l'étape 2, sans bouton Suivant.
        // (bindAddWizard a déjà masqué Suivant sur la dernière étape.)
        if (i === STEP.suivi) $('#depenseWizardNext').hidden = true;
        // Titre : la question à l'étape 1, puis « Nouvelle dépense ».
        $('#depenseWizardTitle').textContent = i === STEP.suivi ? 'Que suivre ?' : 'Nouvelle dépense';
        if (i === STEP.cat) {
          const nom = m === 'general' ? '' : produitNom();
          $('#dCatQuestion').textContent = nom ? `Dans quelle catégorie ranger « ${nom} » ?` : 'Dans quelle catégorie ?';
        }
        if (i === STEP.montant) {
          $('#dMontantLabel').textContent = m === 'habitude'
            ? `Combien vous a coûté « ${produitNom()} » ? (€)` : 'Combien avez-vous dépensé ? (€)';
        }
        if (i === STEP.produit) {
          $('#dProduitLabel').textContent = m === 'habitude'
            ? `Quel produit pour « ${habitudeNom()} » ?` : 'Quel produit souhaitez-vous suivre ?';
          renderProduitPicks();
        }
        if (i === STEP.motif) renderMotifPicks();
        if (i === STEP.nom) renderNomPicks();
        if (i === STEP.habitude) renderHabitudePicks();
        if (i === STEP.prix) {
          prefillPrix($('#dPrix'));
          syncPrix();
        }
        if (i === STEP.montant) {
          const montant = $('#dMontant');
          if (m === 'habitude') prefillPrix(montant);
          else if (montant.dataset.prefillFor !== undefined) {
            // Retour à « Dépense » après une habitude : pas de prix d'un produit.
            montant.value = '';
            delete montant.dataset.prefillFor;
          }
        }
      }
    });
    bindResponsiveTrigger('#btnOpenDepenseWizard', '#addDepenseMobileSlot', '#depenses .card__head');
    if (form) {
      $('#dProduit').addEventListener('input', renderProduitPicks);
      $('#dHabitude').addEventListener('input', renderHabitudePicks);
      // Retour vers une étape à cartes (habitude, produit, lieu, motif) : champ vidé
      // pour choisir de nouveau, toutes les cartes de nouveau visibles. Ce
      // listener passe après celui de bindAddWizard (étape déjà affichée).
      const PICK_STEPS = {
        habitude: ['#dHabitude', renderHabitudePicks],
        produit: ['#dProduit', renderProduitPicks],
        motif: ['#dMotif', renderMotifPicks],
        nom: ['#dNom', renderNomPicks]
      };
      $('#depenseWizardBack').addEventListener('click', () => {
        const step = form.querySelector('.wizard__step:not([hidden])')?.dataset.step;
        const [sel, render] = PICK_STEPS[step] || [];
        if (!sel) return;
        $(sel).value = '';
        render();
      });
      // Clic sur une carte de « Que suivre ? » : la coche et passe à l'étape 2.
      // Seul le clic sur la carte compte (pas le clic relayé au bouton radio,
      // ni les flèches du clavier, qui changent juste le choix ; Entrée valide).
      for (const card of form.querySelectorAll('[data-step="suivi"] .choice')) {
        card.addEventListener('click', (e) => {
          if (e.target.tagName === 'INPUT') return;
          e.preventDefault();
          card.querySelector('input').checked = true;
          wizard?.next();
        });
      }
      $('#dMotif').addEventListener('input', renderMotifPicks);
      $('#dNom').addEventListener('input', renderNomPicks);
      for (const radio of form.querySelectorAll('input[name="dAvec"]')) radio.addEventListener('change', syncPrix);
      $('#dPrix').addEventListener('input', syncPrix);
      $('#dTotal').addEventListener('input', syncPrix);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const avantages = {
          cashbackOn: $('#dCashbackOn').checked, roundUpOn: $('#dRoundUpOn').checked,
          ajout: new Date().toISOString()
        };
        // Nouveau produit : ajouté au catalogue avec la catégorie choisie, pour
        // le resélectionner la prochaine fois sans le retaper.
        const produitSuivi = () => {
          const nom = produitNom().slice(0, 60);
          if (!nom) return null;
          let produit = findSuivi(SUIVI.produit, nom);
          if (!produit) {
            produit = { nom, categorie: $('#dCat').value };
            state.produits.push(produit);
          }
          return produit;
        };
        if (isPrecis()) {
          const produit = produitSuivi();
          if (!produit) return;
          const prix = num($('#dPrix').value);
          const avec = avecAutres();
          state.depenses.push({
            id: uid(), categorie: produit.categorie,
            nom: (avec ? `${produit.nom} + autres articles` : produit.nom).slice(0, 60),
            montant: avec ? Math.max(num($('#dTotal').value), prix) : prix,
            ...avantages, produit: produit.nom, produitPrix: prix
          });
        } else if (mode() === 'habitude') {
          const nom = habitudeNom().slice(0, 60);
          const produit = produitSuivi();
          if (!nom || !produit) return;
          // Nouvelle habitude : ajoutée au catalogue (carte à la prochaine
          // saisie), rangée dans la catégorie de son premier produit. Le
          // produit consommé compte dans la répartition par produit.
          let habitude = findSuivi(SUIVI.habitude, nom);
          if (!habitude) {
            habitude = { nom, categorie: produit.categorie };
            state.habitudes.push(habitude);
          }
          const prix = num($('#dMontant').value);
          const motif = $('#dMotif').value.trim().slice(0, 80);
          // Motif retiré des suggestions puis saisi de nouveau : il revient.
          state.suggestionsMasquees.motifs = state.suggestionsMasquees.motifs
            .filter((m) => suiviKey(m) !== suiviKey(motif));
          state.depenses.push({
            id: uid(), categorie: produit.categorie, nom: produit.nom, montant: prix, ...avantages,
            produit: produit.nom, produitPrix: prix, habitude: habitude.nom, ...(motif ? { motif } : {})
          });
          $('#dMontant').value = '';
        } else {
          const nom = $('#dNom').value.trim();
          if (!nom) return;
          // Lieu retiré des suggestions puis saisi de nouveau : il revient.
          state.suggestionsMasquees.lieux = state.suggestionsMasquees.lieux
            .filter((l) => suiviKey(l) !== suiviKey(nom));
          state.depenses.push({ id: uid(), categorie: $('#dCat').value, nom, montant: num($('#dMontant').value), ...avantages });
          $('#dNom').value = '';
          $('#dMontant').value = '';
        }
        $('#dCashbackOn').checked = true;
        $('#dRoundUpOn').checked = true;
        renderDepenses();
        refresh();
      });
    }
    const wrap = $('#depensesTableWrap');
    if (wrap) bindScrollArrows(wrap, $('#depensesScrollLeft'), $('#depensesScrollRight'));
    if ($('#depensesTable')) COMPACT_QUERY.addEventListener('change', renderDepenses);

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

  /** Pop-up Historique : un mois archivé à la fois, comme la page Suivi.
      state.depensesHistorique va du plus récent au plus ancien ; histIndex
      est le mois affiché (0 = le plus récent, ouvert en premier). La flèche
      gauche recule d'un mois archivé, la droite avance ; une flèche sans
      mois de ce côté est masquée. */
  let histIndex = 0;
  function renderHistorique() {
    const box = $('#historiqueList');
    if (!box) return;
    const months = state.depensesHistorique;
    const nav = $('#historiqueNav');
    nav.hidden = !months.length;
    if (!months.length) {
      box.replaceChildren(h('p', { class: 'note' }, 'Aucun mois précédent enregistré pour le moment.'));
      return;
    }
    histIndex = Math.min(Math.max(histIndex, 0), months.length - 1);
    const m = months[histIndex];
    $('#historiqueMois').textContent = capitalize(monthLabel(m.mois));
    // visibility (et non hidden) : le titre reste centré entre les deux emplacements.
    const prev = $('#historiquePrev');
    const next = $('#historiqueNext');
    const hasPrev = histIndex < months.length - 1;
    const hasNext = histIndex > 0;
    // Flèche masquée sous le focus : on le rend à l'autre flèche (ou au titre du pop-up).
    if ((!hasPrev && document.activeElement === prev) || (!hasNext && document.activeElement === next)) {
      (hasPrev ? prev : hasNext ? next : $('#historiqueClose')).focus();
    }
    prev.style.visibility = hasPrev ? '' : 'hidden';
    next.style.visibility = hasNext ? '' : 'hidden';
    prev.disabled = !hasPrev;
    next.disabled = !hasNext;

    const items = [...m.items].sort((x, y) => String(x.ajout || '').localeCompare(String(y.ajout || '')));
    box.replaceChildren(items.length
      ? h('table', { class: 'table' },
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, 'Catégorie'),
          h('th', { scope: 'col' }, 'Libellé'),
          h('th', { scope: 'col', class: 'num' }, 'Montant (€)'))),
        h('tbody', {}, ...items.map((d) => h('tr', {},
          h('td', {}, d.categorie),
          h('td', {}, d.nom),
          h('td', { class: 'num' }, eur2.format(d.montant))))),
        h('tfoot', {}, h('tr', {},
          h('th', { scope: 'row', colspan: 2 }, 'Total'),
          h('td', { class: 'num' }, eur2.format(m.total)))))
      : h('p', { class: 'note' }, 'Aucune dépense ce mois-là.'));
  }

  /* ---------- Synthèse des habitudes ---------- */

  // Pistes selon le motif donné (mots-clés, accents et majuscules ignorés).
  const HABIT_TIPS = [
    [/fatigu|sommeil|crev|epuis|reveil/, 'Fatigue : misez d\'abord sur le sommeil, un verre d\'eau ou quelques minutes de marche avant de racheter.'],
    [/stress|anxi|nerv|angoiss|pression|tension/, 'Stress : remplacez l\'achat par une courte pause sans dépense (respiration, marche, musique), souvent aussi efficace.'],
    [/ennui|ennuy|rien a faire|occup/, 'Ennui : prévoyez une activité gratuite pour ce moment-là (appel à un proche, lecture, sortie).'],
    [/faim|creux|fringale|grignot/, 'Faim : emportez un en-cas préparé à la maison, bien moins cher.'],
    [/collegu|ami|pote|social|soiree|pause|potes|famille/, 'Moment partagé : proposez une alternative (thermos maison, pause sans achat) ou fixez un nombre de fois par semaine.'],
    [/envie|plaisir|recompens|craqu|gourman|kiff/, 'Envie / récompense : gardez-la comme plaisir prévu, avec un nombre de fois fixé à l\'avance.'],
    [/reflexe|automatique|routine|machinal|trajet/, 'Réflexe : changez le trajet ou le moment qui déclenche l\'achat, et notez-le à chaque fois avant d\'acheter.']
  ];
  const sansAccent = (txt) => txt.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  /** Éléments les plus fréquents d'une liste de noms : « Expresso ×8, Café ×3 ». */
  const topCounts = (names, max = 4) => {
    const counts = new Map();
    for (const nom of names) {
      const key = suiviKey(nom);
      const c = counts.get(key) || { nom, n: 0 };
      c.n += 1;
      counts.set(key, c);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom, 'fr')).slice(0, max);
  };
  const fmtCounts = (list) => list.map((c) => (c.n > 1 ? `${c.nom} ×${c.n}` : c.nom)).join(', ');

  /** Contenu du pop-up Synthèse des habitudes : une fiche par habitude
      (dépenses du mois et de l'historique), la plus coûteuse ce mois en premier. */
  function renderHabitudeSynth() {
    const box = $('#habitudeSynthList');
    if (!box) return;
    const all = [...state.depenses.map((d) => ({ ...d, courant: true })),
      ...state.depensesHistorique.flatMap((m) => m.items)].filter((d) => d.habitude);
    const byHabit = new Map();
    for (const d of all) {
      const key = suiviKey(d.habitude);
      const g = byHabit.get(key) || { nom: d.habitude, items: [], mois: 0, fois: 0 };
      g.items.push(d);
      if (d.courant) { g.mois += d.montant; g.fois += 1; }
      byHabit.set(key, g);
    }
    if (!byHabit.size) {
      box.replaceChildren(h('p', { class: 'note' }, 'Aucune habitude suivie pour le moment.'));
      return;
    }
    const cards = [...byHabit.values()].sort((a, b) => b.mois - a.mois).map((g) => {
      const produits = topCounts(g.items.map((d) => d.produit).filter(Boolean));
      const motifs = topCounts(g.items.map((d) => d.motif).filter(Boolean));
      const motifsTxt = sansAccent(`${g.items.map((d) => d.motif || '').join(' ')}`);
      const tips = HABIT_TIPS.filter(([re]) => re.test(motifsTxt)).map(([, tip]) => tip);
      if (/tabac|cigaret|clope|vape|puff/.test(sansAccent(g.nom))) {
        tips.push('Tabac : Tabac Info Service (39 89, appel gratuit) propose un accompagnement personnalisé pour réduire ou arrêter.');
      }
      if (!motifs.length) tips.push('Notez un motif à chaque achat : c\'est ce qui permet de repérer ce qui déclenche l\'habitude.');
      if (tips.length < 2) tips.push('Fixez un plafond mensuel pour cette habitude et comparez chaque mois ici.');
      if (g.mois > 0) tips.push(`En la réduisant de moitié, vous économiseriez environ ${eur0.format(g.mois * 6)} par an.`);
      return h('article', { class: 'habit-card' },
        h('div', { class: 'habit-card__head' },
          h('p', { class: 'habit-card__name' }, g.nom),
          h('span', { class: 'habit-card__cost' },
            g.fois ? `${eur2.format(g.mois)} ce mois (${g.fois} fois)` : 'Pas ce mois-ci')),
        h('dl', {},
          h('dt', {}, 'Produits'), h('dd', {}, produits.length ? fmtCounts(produits) : '—'),
          h('dt', {}, 'Motifs'), h('dd', {}, motifs.length ? fmtCounts(motifs) : 'Aucun motif noté')),
        h('ul', { class: 'habit-card__tips' }, ...tips.map((t) => h('li', {}, t))));
    });
    box.replaceChildren(...cards);
  }

  function bindHabitudeSynth() {
    const btn = $('#btnHabitudeSynth');
    if (!btn) return;
    bindInfoModal('#btnHabitudeSynth', '#habitudeSynthOverlay', '#habitudeSynthClose');
    btn.addEventListener('click', renderHabitudeSynth);
  }

  function bindHistorique() {
    const btn = $('#btnHistorique');
    if (!btn) return;
    bindInfoModal('#btnHistorique', '#historiqueOverlay', '#historiqueClose');
    // Ouverture : toujours sur le mois archivé le plus récent.
    btn.addEventListener('click', () => { histIndex = 0; renderHistorique(); });
    const step = (delta) => { histIndex += delta; renderHistorique(); };
    $('#historiquePrev').addEventListener('click', () => step(1));
    $('#historiqueNext').addEventListener('click', () => step(-1));
    // Flèches du clavier, comme sur la page Suivi.
    $('#historiqueOverlay').addEventListener('keydown', (e) => {
      const delta = { ArrowLeft: 1, ArrowRight: -1 }[e.key];
      if (!delta || e.target.closest('input, textarea, select')) return;
      const target = histIndex + delta;
      if (target < 0 || target >= state.depensesHistorique.length) return;
      e.preventDefault();
      step(delta);
    });
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
    /** N'affiche que les lignes soumises au cashback (voir Configurer) : une
        ligne désactivée n'a rien à montrer dans ce tableau. */
    const buildRows = (body, items, amountKey, wrap, leftBtn, rightBtn) => {
      const visible = items.filter((item) => item.cashbackOn !== false);
      setTableTotals(body, visible, amountKey, (montant) => montant * cashbackFraction());
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
        // Même ordre en mobile et en bureau : libellé, coût / montant, cashback.
        body.append(avantageRow(item, amountKey === 'mensuel' ? 'charges' : 'depenses', nameCell, montantCell, cashbackCell));
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
    // Taux / multiple affichés (titres, réglage) : à jour sur toutes les pages.
    syncCashbackRateUI();
    // Tuiles de résumé : seulement dans l'onglet de backOrRound.html.
    if (!$('#kpiCashbackChargesSub')) return;

    const chargesCashback = state.charges.reduce((sum, c) => sum + (c.cashbackOn !== false ? c.mensuel * cashbackFraction() : 0), 0);
    const depensesCashback = state.depenses.reduce((sum, d) => sum + (d.cashbackOn !== false ? d.montant * cashbackFraction() : 0), 0);
    if ($('#kpiCashbackCharges')) $('#kpiCashbackCharges').textContent = eur2.format(chargesCashback);
    $('#kpiCashbackChargesSub').textContent = `${eur2.format(annual(chargesCashback))} par an`;
    $('#kpiCashbackDepenses').textContent = eur2.format(depensesCashback);
    if ($('#cashbackAchatsMoisSub')) $('#cashbackAchatsMoisSub').textContent = `en ${currentMonthName()}`;
    // Ligne « CashBack du mois » du tableau : charges + dépenses du mois.
    if ($('#kpiCashbackMois')) $('#kpiCashbackMois').textContent = `+${eur2.format(chargesCashback + depensesCashback)}`;
  }

  /** Synchronise l'affichage du taux (titre de page, titre du pop-up, champ)
      sur state.cashbackRate. */
  function syncCashbackRateUI() {
    if ($('#cashbackPageRate')) $('#cashbackPageRate').textContent = fmtRate(state.cashbackRate);
    const input = $('#cashbackRateInput');
    if (input) input.value = rateNf.format(state.cashbackRate);
  }

  /** Liste des lignes du pop-up « Configurer » (CashBack ou Round Up) :
      deux groupes (Charges, Dépenses) avec le nombre de lignes actives, puis
      chaque ligne (son nom) et son interrupteur. flag : 'cashbackOn' ou 'roundUpOn'. */
  function renderAvantageSettings(box, flag) {
    box.replaceChildren();
    const group = (title, items) => {
      const count = h('span', { class: 'av-settings__count' });
      const sync = () => {
        const on = items.filter((it) => it[flag] !== false).length;
        count.textContent = `${on} / ${items.length} active${on > 1 ? 's' : ''}`;
      };
      const head = h('div', { class: 'av-settings__group' },
        h('h3', { class: 'h3' }, title, ' ', count));
      box.append(head);
      if (!items.length) {
        box.append(h('p', { class: 'note' }, 'Aucune ligne pour le moment.'));
        return;
      }
      for (const it of items) {
        // Ne pas recréer la liste à chaque clic : l'interrupteur perdrait
        // l'animation de son curseur. On met juste à jour le compteur (sync).
        const input = h('input', {
          type: 'checkbox', checked: it[flag] !== false,
          'aria-label': `${title} : ${it.nom}`,
          onchange: (e) => { it[flag] = e.target.checked; sync(); refresh(); }
        });
        box.append(h('div', { class: 'cb-row' },
          h('div', { class: 'cb-row__text' }, h('span', { class: 'cb-row__name', title: it.nom }, it.nom)),
          h('label', { class: 'switch' }, input, h('span', { class: 'switch__track' }, h('span', { class: 'switch__thumb' })))));
      }
      sync();
    };
    group('Charges', state.charges);
    group('Dépenses', state.depenses);
  }

  function renderCashbackSettings() {
    const box = $('#cashbackSettingsList');
    if (!box) return;
    syncCashbackRateUI();
    renderAvantageSettings(box, 'cashbackOn');
  }

  function bindCashback() {
    // Réglage (bouton Configurer et son pop-up) : onglet CashBack de backOrRound.html.
    const btn = $('#btnCashbackSettings');
    if (btn) {
      bindInfoModal('#btnCashbackSettings', '#cashbackSettingsOverlay', '#cashbackSettingsClose');
      btn.addEventListener('click', renderCashbackSettings);
      $('#cashbackRateInput').addEventListener('change', (e) => {
        state.cashbackRate = readRate(e.target.value, 1);
        syncCashbackRateUI();
        refresh();
      });
    }
    // Tableaux Charges / Dépenses : cashback.html.
    if ($('#cashbackChargesTableWrap')) {
      bindScrollArrows($('#cashbackChargesTableWrap'), $('#cashbackChargesScrollLeft'), $('#cashbackChargesScrollRight'));
      bindScrollArrows($('#cashbackDepensesTableWrap'), $('#cashbackDepensesScrollLeft'), $('#cashbackDepensesScrollRight'));
    }
  }

  /* ==========================================================================
     1quater. RoundUp (arrondit chaque charge/dépense au multiple supérieur
     choisi — 1/2/3/5/10 € — et met la différence de côté, comme sur Trade
     Republic ; même logique de paramétrage ligne par ligne que CashBack.)
     ========================================================================== */

  /** Ligne Total (tfoot) d'un tableau CashBack / RoundUp : somme des montants
      et des gains des lignes affichées (format desktop et mobile). */
  function setTableTotals(body, visible, amountKey, gainOf) {
    const table = body.closest('table');
    if (!table) return;
    const montant = visible.reduce((t, item) => t + item[amountKey], 0);
    const gain = visible.reduce((t, item) => t + gainOf(item[amountKey]), 0);
    table.querySelectorAll('[data-total="montant"]').forEach((td) => { td.textContent = eur2.format(montant); });
    table.querySelectorAll('[data-total="gain"]').forEach((td) => { td.textContent = eur2.format(gain); });
  }

  function renderRoundUp() {
    const buildRows = (body, items, amountKey, wrap, leftBtn, rightBtn) => {
      const visible = items.filter((item) => item.roundUpOn !== false);
      setTableTotals(body, visible, amountKey, roundUpAmount);
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
        // Même ordre en mobile et en bureau : libellé, coût / montant, round up.
        body.append(avantageRow(item, amountKey === 'mensuel' ? 'charges' : 'depenses', nameCell, montantCell, roundUpCell));
      }
      updateScrollArrows(wrap, leftBtn, rightBtn);
    };

    if ($('#roundUpChargesBody')) {
      buildRows($('#roundUpChargesBody'), state.charges, 'mensuel',
        $('#roundUpChargesTableWrap'), $('#roundUpChargesScrollLeft'), $('#roundUpChargesScrollRight'));
      buildRows($('#roundUpDepensesBody'), state.depenses, 'montant',
        $('#roundUpDepensesTableWrap'), $('#roundUpDepensesScrollLeft'), $('#roundUpDepensesScrollRight'));
    }
    // Taux / multiple affichés (titres, réglage) : à jour sur toutes les pages.
    syncRoundUpValueUI();
    // Tuiles de résumé : seulement dans l'onglet de backOrRound.html.
    if (!$('#kpiRoundUpChargesSub')) return;

    const chargesRoundUp = state.charges.reduce((sum, c) => sum + (c.roundUpOn !== false ? roundUpAmount(c.mensuel) : 0), 0);
    const depensesRoundUp = state.depenses.reduce((sum, d) => sum + (d.roundUpOn !== false ? roundUpAmount(d.montant) : 0), 0);
    if ($('#kpiRoundUpCharges')) $('#kpiRoundUpCharges').textContent = eur2.format(chargesRoundUp);
    $('#kpiRoundUpChargesSub').textContent = `${eur2.format(annual(chargesRoundUp))} par an`;
    $('#kpiRoundUpDepenses').textContent = eur2.format(depensesRoundUp);
    if ($('#roundUpAchatsMoisSub')) $('#roundUpAchatsMoisSub').textContent = `en ${currentMonthName()}`;
    // Ligne « Round Up du mois » du tableau : charges + dépenses du mois.
    if ($('#kpiRoundUpMois')) $('#kpiRoundUpMois').textContent = `+${eur2.format(chargesRoundUp + depensesRoundUp)}`;
  }

  /* ==========================================================================
     1quinquies. Page CashBack (backOrRound.html) : onglets CashBack / Round Up
     et calendrier des gains du mois, jour par jour (même présentation que la
     page Suivi). Les charges reviennent chaque mois au jour de leur ajout (à
     partir du mois d'ajout ; le 1er pour une ligne sans date), les dépenses
     comptent au jour de leur ajout. Les mois archivés n'ont plus le réglage
     ligne par ligne : leurs dépenses comptent toutes.
     ========================================================================== */

  const AV_TAB_KEY = 'gestion-budget-avantage-onglet';
  // Mois consulté dans le calendrier (« AAAA-MM »), le temps de la session :
  // retrouvé en revenant de la vue liste (cashback.html / roundUp.html).
  const AV_MONTH_KEY = 'gestion-budget-avantage-mois';
  const avCal = { tab: 'cashback', year: 0, month: 0 };

  /** Gain d'une ligne pour un onglet (l'affiché par défaut ; 0 si l'avantage y est désactivé). */
  const avGain = (item, montant, tab = avCal.tab) => (tab === 'cashback'
    ? (item.cashbackOn !== false ? montant * cashbackFraction() : 0)
    : (item.roundUpOn !== false ? roundUpAmount(montant) : 0));

  /** Gains du mois (y, m) par jour : { [jour]: [{ type, nom, montant, gain, item }] }. */
  function avantagesOf(y, m, tab = avCal.tab) {
    const byDay = {};
    const last = new Date(y, m + 1, 0).getDate();
    const monthStart = new Date(y, m, 1);
    const push = (day, ev) => { if (ev.gain > 0.004) (byDay[day] ||= []).push(ev); };
    for (const c of state.charges) {
      const added = c.ajout ? new Date(c.ajout) : null;
      if (added && new Date(added.getFullYear(), added.getMonth(), 1) > monthStart) continue;
      push(Math.min(added ? added.getDate() : 1, last), { type: 'charge', nom: c.nom, montant: c.mensuel, gain: avGain(c, c.mensuel, tab), item: c });
    }
    const fromKey = (key) => { const [yy, mm] = key.split('-').map(Number); return new Date(yy, mm - 1, 1); };
    const depenses = [
      ...state.depenses.map((d) => ({ d, mois: state.depensesMoisCourant })),
      ...state.depensesHistorique.flatMap((hm) => hm.items.map((d) => ({ d, mois: hm.mois })))
    ];
    for (const { d, mois } of depenses) {
      const date = d.ajout ? new Date(d.ajout) : fromKey(mois);
      if (date.getFullYear() !== y || date.getMonth() !== m) continue;
      push(date.getDate(), { type: 'depense', nom: d.nom, montant: d.montant, gain: avGain(d, d.montant, tab), item: d });
    }
    return byDay;
  }

  function renderAvantagesCal() {
    const grid = $('#avCalGrid');
    if (!grid) return;
    const { year, month } = avCal;
    const today = new Date();
    const last = new Date(year, month + 1, 0).getDate();
    const byDay = avantagesOf(year, month);
    const sumOf = (list) => list.reduce((t, ev) => t + ev.gain, 0);
    const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const nom = avCal.tab === 'cashback' ? 'CashBack' : 'Round Up';

    $('#avCalTitle').textContent = capitalize(new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
      .format(new Date(year, month, 1)));

    const offset = (new Date(year, month, 1).getDay() + 6) % 7; // lundi en premier
    const cells = Array.from({ length: offset }, () => h('li', { class: 'cal__cell cal__cell--pad', 'aria-hidden': 'true' }));
    const isThisMonth = year === today.getFullYear() && month === today.getMonth();
    for (let d = 1; d <= last; d++) {
      const list = byDay[d] || [];
      const gain = sumOf(list);
      // Une pastille par type (charges, dépenses) avec son gain.
      // Montants des cases en « 00,00 » : ni + (toujours positifs) ni €.
      const chips = ['charge', 'depense'].map((type) => {
        const evs = list.filter((ev) => ev.type === type);
        if (!evs.length) return null;
        const label = evs.length === 1 ? evs[0].nom : `${evs.length} ${type === 'charge' ? 'charges' : 'dépenses'}`;
        return h('span', { class: `cal-chip cal-chip--${type}` },
          h('span', { class: 'cal-chip__name' }, label), h('span', { class: 'cal-chip__amount' }, fmtCellGain(sumOf(evs))));
      }).filter(Boolean);
      // Case du jour : son gain et ses pastilles ; un clic ouvre le détail
      // (seulement s'il y a des gains ce jour-là).
      const cell = h('button', {
        type: 'button', class: `cal__day${list.length ? '' : ' cal__day--static'}`, 'data-day': d,
        'aria-label': `${fmtDay.format(new Date(year, month, d))}${gain ? `, ${nom} ${eur2.format(gain)}` : ''}`,
        'aria-current': isThisMonth && d === today.getDate() ? 'date' : null,
        'aria-haspopup': list.length ? 'dialog' : null,
        onclick: () => { if (list.length) openAvantagesDay(d, list, nom); }
      }, h('span', { class: 'cal__top' },
        h('span', { class: 'cal__num' }, String(d)),
        gain ? h('span', { class: 'cal__solde good', title: `${nom} du jour : ${eur2.format(gain)}`, 'data-gain': gain },
          fmtCellGain(gain)) : null),
      h('span', { class: 'cal__chips' }, chips));
      cells.push(h('li', { class: `cal__cell${list.length ? ' has-events' : ''}` }, cell));
    }
    grid.replaceChildren(...cells);
    fitGains(grid);
    renderAvantagesTables();
  }

  /** Tableaux de résumé des deux onglets pour le mois affiché par le
      calendrier : gain des charges (et son équivalent sur un an), gain des
      dépenses « en <mois> », total du mois. */
  function renderAvantagesTables() {
    const { year, month } = avCal;
    const now = new Date();
    const mois = new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(new Date(year, month, 1));
    const libelle = `en ${mois}${year !== now.getFullYear() ? ` ${year}` : ''}`;
    for (const [tab, key, low] of [['cashback', 'Cashback', 'cashback'], ['roundup', 'RoundUp', 'roundUp']]) {
      if (!$(`#kpi${key}Mois`)) continue;
      const sum = { charge: 0, depense: 0 };
      Object.values(avantagesOf(year, month, tab)).flat().forEach((ev) => { sum[ev.type] += ev.gain; });
      $(`#kpi${key}Charges`).textContent = eur2.format(sum.charge);
      $(`#kpi${key}ChargesSub`).textContent = `${eur2.format(annual(sum.charge))} par an`;
      $(`#kpi${key}Depenses`).textContent = eur2.format(sum.depense);
      $(`#${low}AchatsMoisSub`).textContent = libelle;
      $(`#kpi${key}Mois`).textContent = `+${eur2.format(sum.charge + sum.depense)}`;
    }
  }

  /** Gain du jour trop large pour sa case : arrondi à 1 décimale (« 12,5 »),
      puis à l'euro (« 13 ») plutôt que coupé (« 12,… »). */
  const GAIN_FORMATS = [2, 1, 0].map((n) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n }));
  /** Montant d'une case avec n décimales (2 par défaut), sans décimales s'il
      tombe juste une fois arrondi : « 12,50 », mais « 12 » plutôt que « 12,00 ». */
  const fmtCellGain = (v, n = 2) => {
    const rounded = Math.round(v * 10 ** n) / 10 ** n;
    return Number.isInteger(rounded) ? GAIN_FORMATS[2].format(rounded) : GAIN_FORMATS[2 - n].format(rounded);
  };
  function fitGains(grid) {
    for (const el of grid.querySelectorAll('.cal__solde[data-gain]')) {
      const v = Number(el.dataset.gain);
      for (const n of [2, 1, 0]) {
        el.textContent = fmtCellGain(v, n);
        if (el.scrollWidth <= el.clientWidth + 0.5) break;
      }
    }
  }

  /** Pop-up du détail d'un jour : chaque charge / dépense, son montant et son
      gain, puis le total du jour (dès deux lignes). */
  let avDay = null;   // { d, close } : pop-up du jour ouvert
  function openAvantagesDay(d, list, nom) {
    const overlay = $('#avZoomOverlay');
    if (!overlay) return;
    renderAvantagesDay(d, list, nom);
    const close = openModal(overlay, {
      focus: $('#avZoomClose'),
      onClose: () => {
        avDay = null;
        $('#avZoomClose').removeEventListener('click', close);
      }
    });
    avDay = { d, close };
    $('#avZoomClose').addEventListener('click', close);
  }

  /** Après une modification ou une suppression : pop-up du jour recalculé
      (le jour peut avoir changé de gains), fermé s'il n'en a plus. */
  function refreshAvantagesDay() {
    if (!avDay) return;
    const list = avantagesOf(avCal.year, avCal.month)[avDay.d] || [];
    if (!list.length) { avDay.close(); return; }
    renderAvantagesDay(avDay.d, list, avCal.tab === 'cashback' ? 'CashBack' : 'Round Up');
  }

  /** Contenu du pop-up du jour : titre, lignes et total. */
  const AV_DAY_FMT = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let avDayView = null; // contenu affiché par le pop-up du jour (sauvegarder / imprimer)
  function renderAvantagesDay(d, list, nom) {
    const total = list.reduce((t, ev) => t + ev.gain, 0);
    avDayView = { date: new Date(avCal.year, avCal.month, d), list, nom, total };
    $('#avDayTitle').textContent = capitalize(AV_DAY_FMT.format(avDayView.date));
    $('#avDayList').replaceChildren(
      ...list.map((ev) => h('li', {
        class: `cal-ev cal-ev--${ev.type} cal-ev--open`, tabindex: '0', 'aria-label': `Voir le détail de ${ev.nom}`,
        onclick: () => openAvantageDetails(ev),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAvantageDetails(ev); } }
      },
        h('span', { class: 'sw', 'aria-hidden': 'true' }),
        h('span', { class: 'cal-ev__name' }, ev.nom,
          h('span', { class: 'cal-ev__cat' }, `${ev.type === 'charge' ? 'Charge' : 'Dépense'} · ${eur2.format(ev.montant)}`)),
        h('span', { class: 'cal-ev__amount good' }, `+${eur2.format(ev.gain)}`))),
      ...(list.length > 1 ? [h('li', { class: 'cal-ev cal-ev--solde' },
        h('span', { class: 'sw', 'aria-hidden': 'true' }),
        h('span', { class: 'cal-ev__name' }, `${nom} du jour`),
        h('span', { class: 'cal-ev__amount good' }, `+${eur2.format(total)}`))] : []));
  }

  /** Pop-up Détail (modifiable) d'une charge ou d'une dépense du pop-up du
      jour, ouvert par-dessus lui : après Valider ou Effacer, le calendrier et
      le pop-up du jour suivent (fermé s'il n'a plus de gain). */
  function openAvantageDetails(ev) {
    const kind = ev.type === 'charge' ? 'charges' : 'depenses';
    const onDelete = (done) => askDeleteItem(ev.item, kind, done, refreshAvantagesDay);
    showItemDetails(ev.item, kind, onDelete, refreshAvantagesDay);
  }

  /** Activité du jour du pop-up (onglet CashBack ou Round Up), en rapport
      court : chaque charge / dépense, son montant, son gain et le total. */
  function avantagesDayReport() {
    const { date, list, nom, total } = avDayView;
    return {
      title: `${nom} du jour`,
      subtitle: `${capitalize(AV_DAY_FMT.format(date))} · Profil « ${Profiles.active().nom} »`,
      sections: [{
        title: '',
        // Taux entre parenthèses dans l'en-tête de la colonne CashBack : « CashBack (1 %) ».
        blocks: [Report.reportTable(['Type', 'Libellé', 'Montant', avCal.tab === 'cashback' ? `${nom} (${fmtRate(state.cashbackRate)})` : nom],
          list.map((ev) => [ev.type === 'charge' ? 'Charge' : 'Dépense', ev.nom, eur2.format(ev.montant), `+${eur2.format(ev.gain)}`]),
          { textCols: 2, foot: list.length > 1 ? ['Total', '', '', `+${eur2.format(total)}`] : undefined })]
      }]
    };
  }

  function bindAvantages() {
    if ($('#avZoomOverlay') && window.Report) {
      Report.bindPopupExport($('#avZoomOverlay'), {
        build: avantagesDayReport,
        name: () => {
          const d = avDayView.date;
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          return `gestion-budget-${avCal.tab === 'cashback' ? 'cashback' : 'roundup'}-${iso}`;
        },
        label: 'l’activité du jour'
      });
    }
    // Croix des pop-ups « Configurer » : même effet que leur bouton Terminé.
    for (const x of document.querySelectorAll('[data-close-for]')) {
      x.addEventListener('click', () => $(`#${x.dataset.closeFor}`)?.click());
    }
    const tabs = [...document.querySelectorAll('.avantages__tabs .tab')];
    if (!tabs.length) return;
    const today = new Date();
    Object.assign(avCal, { year: today.getFullYear(), month: today.getMonth() });
    try {
      if (localStorage.getItem(AV_TAB_KEY) === 'roundup') avCal.tab = 'roundup';
      const mois = sessionStorage.getItem(AV_MONTH_KEY);
      if (/^\d{4}-\d{2}$/.test(mois || '')) {
        const [y, m] = mois.split('-').map(Number);
        Object.assign(avCal, { year: y, month: m - 1 });
      }
    } catch { /* stockage indisponible */ }
    // Arrivée par le bouton Calendrier d'une vue liste : l'onglet correspondant.
    if (location.hash === '#cashback' || location.hash === '#roundup') avCal.tab = location.hash.slice(1);
    const apply = () => {
      tabs.forEach((t) => {
        const on = t.dataset.avantage === avCal.tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
      $('#panel-cashback').hidden = avCal.tab !== 'cashback';
      $('#panel-roundup').hidden = avCal.tab !== 'roundup';
      // Lien sous le calendrier : vers la page détaillée de l'onglet choisi.
      const more = $('#avMoreLink');
      if (more) {
        more.href = avCal.tab === 'cashback' ? 'cashback.html' : 'roundUp.html';
      }
      renderAvantagesCal();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => {
        avCal.tab = t.dataset.avantage;
        try { localStorage.setItem(AV_TAB_KEY, avCal.tab); } catch { /* stockage indisponible */ }
        apply();
      });
      // Flèches gauche/droite : onglet suivant ou précédent.
      t.addEventListener('keydown', (e) => {
        const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (!step) return;
        e.preventDefault();
        const next = tabs[(i + step + tabs.length) % tabs.length];
        next.focus();
        next.click();
      });
    });
    const shift = (delta) => {
      const d = new Date(avCal.year, avCal.month + delta, 1);
      avCal.year = d.getFullYear();
      avCal.month = d.getMonth();
      try {
        sessionStorage.setItem(AV_MONTH_KEY, `${avCal.year}-${String(avCal.month + 1).padStart(2, '0')}`);
      } catch { /* stockage indisponible */ }
      renderAvantagesCal();
    };
    // Largeur des cases changée : nouvel arrondi des gains si besoin.
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => fitGains($('#avCalGrid')), 150);
    });
    $('#avCalPrev').addEventListener('click', () => shift(-1));
    $('#avCalNext').addEventListener('click', () => shift(1));
    apply();
  }

  /** Synchronise l'affichage du multiple choisi (titre de page, titre du pop-up, select). */
  function syncRoundUpValueUI() {
    const label = `x${state.roundUpTo}`;
    if ($('#roundUpPageValue')) $('#roundUpPageValue').textContent = label;
    const radio = $(`input[name="roundUpTo"][value="${state.roundUpTo}"]`);
    if (radio) radio.checked = true;
  }

  function renderRoundUpSettings() {
    const box = $('#roundUpSettingsList');
    if (!box) return;
    syncRoundUpValueUI();
    renderAvantageSettings(box, 'roundUpOn');
  }

  function bindRoundUp() {
    // Réglage (bouton Configurer et son pop-up) : onglet Round Up de backOrRound.html.
    const btn = $('#btnRoundUpSettings');
    if (btn) {
      bindInfoModal('#btnRoundUpSettings', '#roundUpSettingsOverlay', '#roundUpSettingsClose');
      btn.addEventListener('click', renderRoundUpSettings);
      for (const radio of document.querySelectorAll('input[name="roundUpTo"]')) {
        radio.addEventListener('change', (e) => {
          const v = parseInt(e.target.value, 10);
          state.roundUpTo = ROUND_UP_OPTIONS.includes(v) ? v : 1;
          syncRoundUpValueUI();
          refresh();
        });
      }
    }
    // Tableaux Charges / Dépenses : roundUp.html.
    if ($('#roundUpChargesTableWrap')) {
      bindScrollArrows($('#roundUpChargesTableWrap'), $('#roundUpChargesScrollLeft'), $('#roundUpChargesScrollRight'));
      bindScrollArrows($('#roundUpDepensesTableWrap'), $('#roundUpDepensesScrollLeft'), $('#roundUpDepensesScrollRight'));
    }
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

  /** Pop-up de détails d'une comparaison (bouton œil), avec mode Modifier :
      poste de charge, option alternative et nouveau montant deviennent des
      champs ; l'actuel et les écarts suivent la saisie. Seules les
      comparaisons pas encore appliquées passent par ici : les économies
      appliquées ne se modifient pas (Annuler, puis refaire la comparaison). */
  function showScenarioDetails(sc) {
    const overlay = $('#detailOverlay');
    if (!overlay) return;
    const editBtn = $('#detailEdit');
    const closeBtn = $('#detailClose');
    const cancelBtn = $('#detailCancel');
    const saveBtn = $('#detailSave');
    let draft = null; // { chargeId, option, nouveau } pendant la modification

    $('#detailTitle').textContent = 'Détail de la comparaison';
    $('#detailStamp').hidden = true;

    const fmtEcart = (eco) => {
      const sign = eco > 0 ? '+' : eco < 0 ? '−' : '';
      const label = eco > 0 ? 'économie' : eco < 0 ? 'surcoût' : 'identique';
      return `${sign}${eur2.format(Math.abs(eco))} (${label})`;
    };
    /** Valeurs calculées (lecture seule) pour une charge et un nouveau montant. */
    const computed = (charge, nouveau) => {
      const eco = charge ? charge.mensuel - nouveau : 0;
      return [
        ['Actuel / mois', charge ? eur2.format(charge.mensuel) : '–'],
        ['Écart / mois', fmtEcart(eco)],
        ['Écart / an', fmtEcart(annual(eco))]
      ];
    };
    const row = ([label, value]) => [h('dt', {}, label), h('dd', {}, value)];

    const render = () => {
      const list = $('#detailList');
      if (!draft) {
        const charge = state.charges.find((c) => c.id === sc.chargeId);
        list.replaceChildren(...[
          ['Ligne', charge ? charge.nom : '–'],
          ['Option alternative', sc.option || '–'],
          ['Nouveau / mois', eur2.format(sc.nouveau)],
          ...computed(charge, sc.nouveau)
        ].flatMap(row));
        return;
      }
      const computedDds = [];
      const draftCharge = () => state.charges.find((c) => c.id === draft.chargeId);
      const updateComputed = () => computed(draftCharge(), draft.nouveau).forEach(([, v], i) => { computedDds[i].textContent = v; });
      const ligneBtn = h('button', {
        type: 'button', class: 'select-btn detail-field', 'aria-label': 'Ligne',
        onclick: () => pickCharge(draft.chargeId, (id) => {
          draft.chargeId = id;
          ligneBtn.textContent = draftCharge()?.nom || '–';
          updateComputed();
          ligneBtn.focus();
        })
      }, draftCharge()?.nom || '–');
      const optionInput = h('input', {
        type: 'text', class: 'detail-field', maxlength: '60', required: true, 'aria-label': 'Option alternative',
        oninput: (e) => { draft.option = e.target.value; }
      });
      optionInput.value = draft.option;
      const montantInput = h('input', {
        type: 'number', class: 'detail-field detail-field--num', min: '0', step: '0.01', inputmode: 'decimal',
        'aria-label': 'Nouveau / mois',
        oninput: (e) => { draft.nouveau = num(e.target.value); fitWidth(); updateComputed(); }
      });
      // Largeur ajustée au contenu : nombre de caractères saisis + 2.
      const fitWidth = () => { montantInput.style.width = `calc(${montantInput.value.length + 2}ch + 24px)`; };
      montantInput.value = String(draft.nouveau);
      fitWidth();
      const computedRows = computed(draftCharge(), draft.nouveau).map(([label, value]) => {
        const dd = h('dd', {}, value);
        computedDds.push(dd);
        return [h('dt', {}, label), dd];
      });
      list.replaceChildren(
        h('dt', {}, 'Ligne'), h('dd', {}, ligneBtn),
        h('dt', {}, 'Option alternative'), h('dd', {}, optionInput),
        h('dt', {}, 'Nouveau / mois'), h('dd', {}, montantInput),
        ...computedRows.flat()
      );
      optionInput.focus();
    };

    const setEditing = (on) => {
      draft = on ? { chargeId: sc.chargeId, option: sc.option || '', nouveau: sc.nouveau } : null;
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
      const option = draft.option.trim();
      if (!option) { $('input.detail-field', overlay)?.reportValidity(); return; }
      if (!state.charges.some((c) => c.id === draft.chargeId)) return;
      sc.chargeId = draft.chargeId;
      sc.option = option.slice(0, 60);
      sc.nouveau = draft.nouveau;
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

  function renderScenarios() {
    if (!$('#ecoMois')) return;
    renderAppliquees();
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

      const apply = h('button', {
        class: 'btn btn--ghost btn--sm', type: 'button',
        title: 'Remplacer la ligne par cette option dans vos charges',
        onclick: () => {
          // Gardé pour Annuler (Économies appliquées) : la charge d'avant et ses comparaisons.
          state.appliquees.unshift({
            id: uid(), chargeId: charge.id, ancienNom: charge.nom, ancienMensuel: charge.mensuel,
            nom: sc.option || charge.nom, nouveau: sc.nouveau,
            scenarios: state.scenarios.filter((x) => x.chargeId === charge.id)
          });
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

      const view = h('button', {
        class: 'icon-btn icon-btn--view', type: 'button', 'aria-label': `Voir le détail de ${sc.option || charge.nom}`, title: 'Voir le détail',
        onclick: () => showScenarioDetails(sc)
      });
      view.innerHTML = EYE_ICON;

      /* Cellules modifiables comme sur les pages Revenus / Charges / Dépenses.
         Enregistrées au changement (sortie du champ ou Entrée), pas à chaque
         frappe : refresh() redessine ce tableau, le champ perdrait le focus.
         Actuel / mois modifie la charge elle-même ; les écarts sont calculés. */
      const ligneBtn = h('button', {
        type: 'button', class: 'cell cell--pick', 'aria-label': `Ligne : ${charge.nom}`,
        onclick: () => pickCharge(sc.chargeId, (id) => { sc.chargeId = id; refresh(); })
      }, charge.nom);
      const ligneCell = h('td', {}, ligneBtn, h('span', { class: 'sub' }, charge.categorie));
      const optionInput = h('input', {
        class: 'cell', type: 'text', maxlength: 60, value: sc.option || '', 'aria-label': 'Option alternative',
        onchange: (e) => {
          sc.option = e.target.value.trim().slice(0, 60) || sc.option;
          refresh();
        }
      });
      const optionCell = h('td', {}, optionInput);
      if (isBest) optionCell.append(h('span', { class: 'pill pill--good' }, 'Retenue'));
      else if (eco > 0) optionCell.append(h('span', { class: 'pill', title: 'Une option plus économique est déjà retenue pour cette ligne' }, 'Non cumulée'));
      const amountInput = (value, label, onSet) => h('input', {
        class: 'cell num', type: 'number', min: 0, step: '0.01', inputmode: 'decimal',
        value: value.toFixed(2), 'aria-label': label,
        onchange: (e) => { onSet(num(e.target.value)); refresh(); }
      });
      const actuelCell = h('td', { class: 'num' }, amountInput(charge.mensuel, `Montant actuel mensuel de ${charge.nom}`, (v) => { charge.mensuel = v; }));
      const nouveauCell = h('td', { class: 'num' }, amountInput(sc.nouveau, `Nouveau montant mensuel de ${sc.option || charge.nom}`, (v) => { sc.nouveau = v; }));
      const ecartMoisCell = h('td', { class: `num delta delta--${kind}` }, `${sign}${eur2.format(Math.abs(eco))}`, h('small', {}, label));
      const ecartAnCell = h('td', { class: `num delta delta--${kind}` }, `${sign}${eur2.format(Math.abs(annual(eco)))}`, h('small', {}, label));
      const actionsCell = h('td', { class: 'num row-actions' }, eco > 0 ? apply : null, view, del);

      body.append(MOBILE_QUERY.matches
        ? h('tr', {}, ligneCell, optionCell, ecartMoisCell, actuelCell, nouveauCell, ecartAnCell, actionsCell)
        : h('tr', {}, ligneCell, optionCell, actuelCell, nouveauCell, ecartMoisCell, ecartAnCell, actionsCell));
    }
    updateScrollArrows($('#scTableWrap'), $('#scScrollLeft'), $('#scScrollRight'));
  }

  /** Économies appliquées, sous les comparaisons. Annuler rend à la charge son
      libellé et son montant d'avant, et remet ses comparaisons dans le tableau.
      Seule la plus récente d'une même charge peut être annulée : une plus
      ancienne écraserait sinon celle appliquée par-dessus. */
  function renderAppliquees() {
    const block = $('#appliqueesBlock');
    if (!block) return;
    block.hidden = !state.appliquees.length;
    const body = $('#appBody');
    body.replaceChildren();
    const seen = new Set();
    for (const a of state.appliquees) {
      const charge = state.charges.find((c) => c.id === a.chargeId);
      if (!charge) continue;
      const latest = !seen.has(a.chargeId);
      seen.add(a.chargeId);
      const eco = a.ancienMensuel - a.nouveau;
      const undo = h('button', {
        class: 'btn btn--ghost btn--sm', type: 'button', disabled: !latest,
        title: latest ? 'Revenir à la charge d\'avant et remettre ses comparaisons'
          : 'Annulez d\'abord l\'économie plus récente appliquée sur cette ligne',
        onclick: () => {
          charge.nom = a.ancienNom;
          charge.mensuel = a.ancienMensuel;
          const ids = new Set(state.scenarios.map((x) => x.id));
          state.scenarios.push(...a.scenarios.filter((x) => !ids.has(x.id)));
          state.appliquees = state.appliquees.filter((x) => x.id !== a.id);
          renderLines('charges');
          refresh();
        }
      }, 'Annuler');
      const ligneCell = h('td', {}, a.nom, a.ancienNom !== a.nom ? h('span', { class: 'sub' }, `Avant : ${a.ancienNom}`) : null);
      body.append(h('tr', {},
        ligneCell,
        h('td', { class: `num delta delta--${eco > 0 ? 'good' : ''}` }, `+${eur2.format(eco)}`,
          h('small', {}, `${eur2.format(annual(eco))} / an`)),
        h('td', { class: 'num' }, eur2.format(a.ancienMensuel)),
        h('td', { class: 'num' }, eur2.format(a.nouveau)),
        h('td', { class: 'num' }, undo)
      ));
    }
    updateScrollArrows($('#appTableWrap'), $('#appScrollLeft'), $('#appScrollRight'));
  }

  function bindScenarios() {
    if (!$('#scForm')) return;
    bindScrollArrows($('#scTableWrap'), $('#scScrollLeft'), $('#scScrollRight'));
    bindScrollArrows($('#appTableWrap'), $('#appScrollLeft'), $('#appScrollRight'));
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
    Transport: 'transport', Abonnements: 'abonnements', 'Activité': 'activite', Plaisir: 'plaisir', Autre: 'autre',
    Assurance: 'assurance', 'Épargne': 'epargne', Placement: 'placement', 'Prêt': 'pret', 'Famille / Proche': 'famille'
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
    renderAvantagesCal();
    save();
  }

  function init() {
    renderLineForms();
    bindLines();
    bindDepenses();
    bindHistorique();
    bindHabitudeSynth();
    bindCashback();
    bindRoundUp();
    bindAvantages();
    bindScenarios();
    bindYield();
    bindInfoModal('#rendementInfoBtn', '#infoOverlay', '#infoClose');
    bindInfoModal('#btnExemple', '#exampleOverlay', '#exampleClose');
    bindInfoModal('#wBtnExemple', '#exampleOverlay', '#exampleClose');
    bindInfoModal('#soldeMoisInfoBtn', '#soldeInfoOverlay', '#soldeInfoClose');
    bindSynthese();
    // Pages Sauvegarder et Imprimer uniquement (report.js n'est chargé que là).
    window.Report?.bindExport({ state, totalRevenus, totalMonthly, computeSavings, computeYield, cashbackFraction, roundUpAmount, CAT_KEY });
    syncYieldInputs();
    renderLines('revenus');
    renderLines('charges');
    renderDepenses();
    refresh();
  }

  init();
})();
