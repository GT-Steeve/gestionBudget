/* ==========================================================================
   Gestion budget
   1. Charges mensuelles / annuelles (annuel = mensuel × 12)
   2. Économie potentielle en remplaçant une ligne par une autre option
   3. Simuler un placement (deux taux annuels modifiables, 2 % et 10 % par défaut,
      intérêts composés ; gain affiché pour l'année de votre choix)
   ========================================================================== */
'use strict';

(() => {
  /* ---------- Constantes ---------- */

  const STORAGE_KEY = Profiles.dataKey(); // données du profil actif (voir profiles.js)
  const CATEGORIES = ['Loyer', 'Factures', 'Courses', 'Transport', 'Abonnements', 'Activité', 'Plaisir', 'Assurance', 'Épargne', 'Prêt', 'Famille / Proche', 'Autre'];
  const REV_CATEGORIES = ['Salaire', 'Aide', 'Autre'];
  const DEP_CATEGORIES = ['Course', 'Alimentaire', 'Transport', 'Shopping', 'Divertissement', 'Sortie', 'Équipement', 'Entretien ménager', 'Cadeau', 'Famille / Proche', 'Santé', 'Amende', 'Imprévu', 'Restaurant', 'Autre'];
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
  const DEFAULT_RATES = [2, 10]; // rendements annuels proposés par défaut, en % (modifiables)
  const MAX_RATE = 100;          // plafond des rendements saisis, en %
  const ROUND_UP_OPTIONS = [1, 2, 3, 5, 10]; // multiples disponibles pour le RoundUp, en €
  const MONTHS = Calc.MONTHS;

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
  /** Clé « AAAA-MM » du mois d'une date, pour comparer/archiver par mois. */
  const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  /** Libellé lisible d'une clé « AAAA-MM », ex. « septembre 2026 ». */
  const monthLabel = (key) => {
    const [y, m] = key.split('-').map(Number);
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
  };
  /** Nom du mois courant seul (sans année), ex. « septembre ». */
  const currentMonthName = () => new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(new Date());
  /** « d'octobre », « de mars » : élision devant une voyelle (avril, août, octobre). */
  const currentMonthWithPreposition = () => {
    const name = currentMonthName();
    return /^[aeiouh]/i.test(name) ? `d'${name}` : `de ${name}`;
  };
  /** En dessous de 640px, Dépenses/Revenus/Charges basculent vers un ordre de
      colonnes différent (Libellé/Montant en premier) pour rester visibles
      sans défilement horizontal — voir renderDepenses/renderLines. */
  const MOBILE_QUERY = window.matchMedia('(max-width: 640px)');

  const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eurCompact = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
  const pct1 = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
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

  /** Pop-up de confirmation avant suppression (détails de la ligne + Annuler/Confirmer). */
  function confirmDelete(title, details, onConfirm, opts = {}) {
    const overlay = $('#confirmOverlay');
    if (!overlay) { onConfirm(); return; }
    const titleEl = $('#confirmTitle');
    titleEl.textContent = title;
    titleEl.classList.toggle('modal__title--center', !!opts.center);
    $('#confirmDetails').replaceChildren(
      ...details.flatMap(([label, value]) => [h('dt', {}, label), h('dd', {}, value)])
    );
    $('#confirmOverlay .modal__actions').classList.toggle('modal__actions--center', !!opts.center);
    $('#confirmOverlay .modal').classList.toggle('modal--narrow', !!opts.center);

    const okBtn = $('#confirmOk');
    const cancelBtn = $('#confirmCancel');
    const close = () => {
      overlay.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKey);
    };
    const onOk = () => { close(); onConfirm(); };
    const onCancel = () => close();
    const onOverlayClick = (e) => { if (e.target === overlay) onCancel(); };
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKey);

    overlay.hidden = false;
    okBtn.focus();
  }

  /** Relie un bouton « i » à une pop-up d'information (texte statique + Fermer). */
  function bindInfoModal(triggerSel, overlaySel, closeSel) {
    const trigger = $(triggerSel);
    const overlay = $(overlaySel);
    if (!trigger || !overlay) return;
    const closeBtn = $(closeSel);
    const close = () => {
      overlay.hidden = true;
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    trigger.addEventListener('click', () => {
      overlay.hidden = false;
      document.addEventListener('keydown', onKey);
      closeBtn.focus();
    });
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  /** Pop-up de choix en boutons (catégorie, date, heure) plutôt qu'un menu
      ou sélecteur natif, plus lisible sur mobile. fill(list, close) remplit
      la grille et renvoie le bouton à focaliser ; compact = petites cases. */
  function openPicker(title, fill, { compact = false } = {}) {
    const overlay = $('#catPickerOverlay');
    if (!overlay) return;
    // Ouverte aussi depuis d'autres pop-ups (wizard d'ajout, Détail) : déplacée
    // en fin de <body> pour s'afficher au-dessus (et que leur Échap la voie
    // comme celle du dessus).
    document.body.append(overlay);
    const list = $('#catPickerList');
    const close = () => {
      overlay.hidden = true;
      overlay.removeEventListener('click', onOverlayClick);
      $('#catPickerClose').removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
    const onOverlayClick = (e) => { if (e.target === overlay) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };

    $('#catPickerTitle').textContent = title;
    list.classList.toggle('cat-picker--compact', compact);
    const focusEl = fill(list, close);
    overlay.addEventListener('click', onOverlayClick);
    $('#catPickerClose').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    overlay.hidden = false;
    focusEl?.focus();
  }

  /** Bouton d'option de la grille du picker, mis en avant s'il est sélectionné. */
  const pickerOpt = (label, selected, onclick, extra = {}) => h('button', {
    type: 'button', class: 'cat-picker__opt', 'aria-pressed': String(selected), onclick, ...extra
  }, label);

  /** Choix de catégorie (la catégorie actuelle mise en avant) ; onPick(cat)
      n'est appelé que si elle change. */
  function pickCategory(cats, current, onPick) {
    openPicker('Choisir la catégorie', (list, close) => {
      const buttons = cats.map((cat) => pickerOpt(cat, cat === current, () => { close(); if (cat !== current) onPick(cat); }));
      list.style.gridTemplateColumns = '';
      list.replaceChildren(...buttons);
      return buttons.find((b) => b.getAttribute('aria-pressed') === 'true') || buttons[0];
    });
  }

  /** Choix d'une date : calendrier d'un mois (‹ mois ›), un bouton par jour ;
      un clic sur « mois année » affiche les années (12 par page) pour en
      changer. onPick(année, mois, jour). */
  function pickDate(current, onPick) {
    const ref = current || new Date();
    let year = ref.getFullYear();
    let month = ref.getMonth();
    let yearStart = year - 5; // première année de la page affichée en vue Années
    openPicker('Choisir la date', (list, close) => {
      const navBar = (label, labelProps, prevLabel, nextLabel, shift) => h('div', { class: 'cal__nav' },
        h('button', { type: 'button', class: 'icon-btn', 'data-nav': 'prev', 'aria-label': prevLabel, onclick: () => shift(-1) }, '‹'),
        h('button', { type: 'button', class: 'cal__month', ...labelProps }, label),
        h('button', { type: 'button', class: 'icon-btn', 'data-nav': 'next', 'aria-label': nextLabel, onclick: () => shift(1) }, '›'));
      const navFocus = (delta) => (delta < 0 ? '[data-nav="prev"]' : '[data-nav="next"]');

      const drawYears = (focusSel) => {
        const years = Array.from({ length: 12 }, (_, i) => yearStart + i).map((y) => pickerOpt(String(y), y === year, () => {
          year = y;
          drawDays('.cal__month');
        }));
        list.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
        list.replaceChildren(
          navBar(`${yearStart} – ${yearStart + 11}`, { 'aria-label': 'Revenir au calendrier', onclick: () => drawDays('.cal__month') },
            'Années précédentes', 'Années suivantes', (delta) => { yearStart += delta * 12; drawYears(navFocus(delta)); }),
          ...years);
        const el = focusSel ? $(focusSel, list) : years.find((b) => b.getAttribute('aria-pressed') === 'true') || years[0];
        el.focus();
        return el;
      };

      const drawDays = (focusSel) => {
        const label = capitalize(new Date(year, month, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));
        const shift = (delta) => {
          const d = new Date(year, month + delta, 1);
          year = d.getFullYear();
          month = d.getMonth();
          drawDays(navFocus(delta));
        };
        const nav = navBar(label, { 'aria-label': `${label} : changer d’année`, onclick: () => { yearStart = year - 5; drawYears(); } },
          'Mois précédent', 'Mois suivant', shift);
        const weekdays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((j) => h('span', { class: 'cal__wd', 'aria-hidden': 'true' }, j));
        const offset = (new Date(year, month, 1).getDay() + 6) % 7; // lundi en premier
        const blanks = Array.from({ length: offset }, () => h('span'));
        const days = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => {
          const day = i + 1;
          const selected = !!current && current.getFullYear() === year && current.getMonth() === month && current.getDate() === day;
          return pickerOpt(String(day), selected, () => { close(); onPick(year, month, day); },
            { 'aria-label': new Date(year, month, day).toLocaleDateString('fr-FR', { dateStyle: 'full' }) });
        });
        list.style.gridTemplateColumns = 'repeat(7, minmax(0, 1fr))';
        list.replaceChildren(nav, ...weekdays, ...blanks, ...days);
        const el = focusSel ? $(focusSel, list) : days.find((b) => b.getAttribute('aria-pressed') === 'true') || days[0];
        el.focus();
        return el;
      };
      return drawDays();
    }, { compact: true });
  }

  /** Choix d'une heure chiffre par chiffre : dizaine et unité de l'heure,
      dizaine et unité des minutes, chacune encadrée de flèches ±1 (en boucle,
      l'heure restant entre 0 et 23), puis Valider. onPick(heures, minutes). */
  function pickTime(current, onPick) {
    const ref = current || new Date();
    // Chiffres : [dizaine heure, unité heure, dizaine minutes, unité minutes].
    const digits = [Math.floor(ref.getHours() / 10), ref.getHours() % 10, Math.floor(ref.getMinutes() / 10), ref.getMinutes() % 10];
    const max = (i) => [2, digits[0] === 2 ? 3 : 9, 5, 9][i];
    const CHEVRON = (up) => `<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="${up ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const LABELS = ['Dizaine des heures', 'Unité des heures', 'Dizaine des minutes', 'Unité des minutes'];
    openPicker('Choisir l’heure', (list, close) => {
      const valueEls = digits.map(() => h('span', { class: 'time-spin__value' }));
      /** Affiche le chiffre i ; dir (+1/−1) le fait rouler comme la molette
          d'un cadenas : +1 descend (le nouveau chiffre arrive par le haut),
          −1 monte. Sans dir (ou mouvements réduits) : changement direct. */
      const roll = (i, dir = 0) => {
        const box = valueEls[i];
        const next = h('span', { class: 'time-spin__digit' }, String(digits[i]));
        if (!dir || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          box.replaceChildren(next);
          return;
        }
        const way = dir > 0 ? 'down' : 'up';
        // Chiffres sortants (plusieurs si clics rapides) : retirés en fin d'animation.
        for (const old of [...box.children]) {
          old.className = `time-spin__digit time-spin__digit--out-${way}`;
          old.addEventListener('animationend', () => old.remove(), { once: true });
        }
        next.classList.add(`time-spin__digit--in-${way}`);
        box.append(next);
      };
      const step = (i, delta) => {
        const m = max(i);
        digits[i] = (digits[i] + delta + m + 1) % (m + 1);
        roll(i, delta);
        // Passage à 2x heures : l'unité ne peut dépasser 3 (23 h max).
        if (i === 0 && digits[1] > max(1)) {
          digits[1] = max(1);
          roll(1, -1);
        }
      };
      const arrow = (i, up) => {
        const btn = h('button', {
          type: 'button', class: 'icon-btn time-spin__arrow', 'aria-label': `${LABELS[i]} ${up ? '+1' : '−1'}`,
          onclick: () => step(i, up ? 1 : -1)
        });
        btn.innerHTML = CHEVRON(up);
        return btn;
      };
      const col = (i) => h('div', { class: 'time-spin__col' }, arrow(i, true), valueEls[i], arrow(i, false));
      const ok = h('button', {
        type: 'button', class: 'btn time-spin__ok',
        onclick: () => { close(); onPick(digits[0] * 10 + digits[1], digits[2] * 10 + digits[3]); }
      }, 'Valider');
      list.style.gridTemplateColumns = '1fr';
      list.replaceChildren(
        h('div', { class: 'time-spin' }, col(0), col(1), h('span', { class: 'time-spin__sep' }, 'h'), col(2), col(3)),
        ok);
      digits.forEach((_, i) => roll(i));
      return ok;
    });
  }

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

  /** Pop-up d'ajout guidé, un champ à la fois (Retour/Suivant), plus
      pratique qu'une ligne de formulaire à plusieurs champs côte à côte au
      clavier mobile. cfg.steps/cfg.fields : même ordre, un par étape. */
  function bindAddWizard(cfg) {
    const overlay = $(cfg.overlay);
    const openBtn = $(cfg.openBtn);
    const form = $(cfg.form);
    if (!overlay || !openBtn || !form) return;

    const closeBtn = $(cfg.closeBtn);
    const backBtn = $(cfg.backBtn);
    const nextBtn = $(cfg.nextBtn);
    const finishBtn = $(cfg.finishBtn);
    const stepLabel = $(cfg.stepLabel);
    const steps = cfg.steps.map((sel) => $(sel, overlay));
    const total = steps.length;
    let current = 0;

    const showStep = (i) => {
      current = i;
      steps.forEach((el, idx) => { el.hidden = idx !== i; });
      backBtn.hidden = i === 0;
      nextBtn.hidden = i === total - 1;
      finishBtn.hidden = i !== total - 1;
      if (stepLabel) stepLabel.textContent = `Étape ${i + 1} / ${total}`;
      $(cfg.fields[i])?.focus();
    };

    const close = () => {
      overlay.hidden = true;
      document.removeEventListener('keydown', onKey);
    };
    // Échap ne ferme que la pop-up du dessus (ex. Exemples ouverte depuis le
    // wizard Placement : seule celle-ci se ferme).
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const top = [...document.querySelectorAll('.modal-overlay:not([hidden])')].pop();
      if (top === overlay) close();
    };
    const open = () => {
      showStep(0);
      overlay.hidden = false;
      document.addEventListener('keydown', onKey);
    };
    const goNext = () => {
      const field = $(cfg.fields[current]);
      if (field && !field.reportValidity()) return;
      showStep(Math.min(current + 1, total - 1));
    };

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    nextBtn.addEventListener('click', goNext);
    backBtn.addEventListener('click', () => showStep(Math.max(current - 1, 0)));
    // Entrée dans un champ texte/nombre = Suivant (ou Terminer sur la
    // dernière étape), comme la touche "suivant" d'un clavier mobile.
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      (current === total - 1 ? finishBtn : nextBtn).click();
    });
    // La validation du formulaire (bindForm) gère déjà preventDefault + ajout
    // + reset ; ce listener, ajouté après, ferme juste la pop-up une fois
    // l'ajout effectué.
    form.addEventListener('submit', close);
  }

  /** Déplace un bouton d'ajout entre deux emplacements selon la largeur
      d'écran : conteneur mobile (au-dessus de la carte) en dessous de
      MOBILE_QUERY, sinon dans l'en-tête de carte donné (à droite du titre,
      via .card__head .btn). Le conteneur mobile se masque tout seul une
      fois vidé (voir .add-trigger--center:empty). */
  function bindResponsiveTrigger(btnSel, mobileSlotSel, headSel) {
    const btn = $(btnSel);
    const mobileSlot = $(mobileSlotSel);
    const head = $(headSel);
    if (!btn || !mobileSlot || !head) return;
    const place = () => (MOBILE_QUERY.matches ? mobileSlot : head).append(btn);
    place();
    MOBILE_QUERY.addEventListener('change', place);
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
    const loyer = { id: uid(), categorie: 'Loyer', nom: 'Loyer', mensuel: 1200 };
    const elec = { id: uid(), categorie: 'Factures', nom: 'Électricité', mensuel: 120 };
    const inter = { id: uid(), categorie: 'Factures', nom: 'Internet + mobile', mensuel: 90 };
    const courses = { id: uid(), categorie: 'Courses', nom: 'Courses alimentaires', mensuel: 400 };
    const transport = { id: uid(), categorie: 'Transport', nom: 'Pass transport', mensuel: 90 };
    const assurance = { id: uid(), categorie: 'Assurance', nom: 'Assurance habitation', mensuel: 25 };
    const abos = { id: uid(), categorie: 'Abonnements', nom: 'Netflix + Spotify', mensuel: 30 };
    const livret = { id: uid(), categorie: 'Épargne', nom: 'Livret A', mensuel: 150 };

    // Dépenses datées par rapport à aujourd'hui : mois en cours (jours déjà
    // passés uniquement) et deux mois précédents, archivés dans l'historique.
    const now = new Date();
    const depense = (monthsAgo, day, categorie, nom, montant) => {
      const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1, 12);
      d.setDate(monthsAgo ? day : Math.min(day, now.getDate()));
      return { id: uid(), categorie, nom, montant, ajout: d.toISOString() };
    };
    const archive = (monthsAgo, items) => ({
      mois: monthKey(new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)),
      total: items.reduce((sum, d) => sum + d.montant, 0),
      items
    });

    return {
      revenus: [
        { id: uid(), categorie: 'Salaire', nom: 'Salaire net', mensuel: 2300 },
        { id: uid(), categorie: 'Aide', nom: 'Aide enfant', mensuel: 150 }
      ],
      charges: [loyer, elec, inter, courses, transport, assurance, abos, livret],
      depenses: [
        depense(0, 2, 'Alimentaire', 'Boulangerie', 8.4),
        depense(0, 4, 'Transport', 'Essence', 55),
        depense(0, 6, 'Restaurant', 'Pizzeria', 32.5),
        depense(0, 9, 'Shopping', 'Zara', 49.99),
        depense(0, 12, 'Divertissement', 'Jeu Steam', 19.99),
        depense(0, 15, 'Santé', 'Pharmacie', 14.2),
        depense(0, 18, 'Sortie', 'Cinéma', 22),
        depense(0, 21, 'Cadeau', 'Anniversaire de Léa', 35),
        depense(0, 24, 'Entretien ménager', 'Lessive, éponges', 12.8)
      ],
      depensesHistorique: [
        archive(1, [
          depense(1, 3, 'Alimentaire', 'Marché', 23.6),
          depense(1, 5, 'Transport', 'Essence', 60),
          depense(1, 8, 'Restaurant', 'Fast-food', 14.9),
          depense(1, 11, 'Famille / Proche', 'Sortie en famille', 45),
          depense(1, 14, 'Équipement', 'Bouilloire', 29.99),
          depense(1, 19, 'Sortie', 'Bowling', 18),
          depense(1, 22, 'Amende', 'Stationnement', 35),
          depense(1, 27, 'Shopping', 'Amazon', 24.5)
        ]),
        archive(2, [
          depense(2, 2, 'Alimentaire', 'Boulangerie', 6.9),
          depense(2, 6, 'Transport', 'Péage', 12.4),
          depense(2, 9, 'Imprévu', 'Garage, plaquettes de frein', 180),
          depense(2, 13, 'Restaurant', 'Restaurant japonais', 41),
          depense(2, 17, 'Santé', 'Médecin', 30),
          depense(2, 20, 'Divertissement', 'Place de concert', 55),
          depense(2, 25, 'Cadeau', 'Fleurs', 25)
        ])
      ],
      depensesMoisCourant: monthKey(now),
      cashbackRate: 1,
      roundUpTo: 1,
      scenarios: [
        { id: uid(), chargeId: elec.id, option: 'Fournisseur moins cher', nouveau: 52 },
        { id: uid(), chargeId: courses.id, option: 'Marque distributeur + drive', nouveau: 260 },
        { id: uid(), chargeId: abos.id, option: 'Offre duo partagée', nouveau: 18 }
      ],
      yield: { capital: 3000, versement: 150, annees: 15, taux1: DEFAULT_RATES[0], taux2: DEFAULT_RATES[1], anneeGain: 5 },
      view: 'mois'
    };
  }

  /** Date d'ajout enregistrée (ISO) si valide, sinon null (anciennes lignes). */
  const validDate = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);

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
        mensuel: num(c.mensuel),
        cashbackOn: c.cashbackOn !== false,
        roundUpOn: c.roundUpOn !== false,
        ajout: validDate(c.ajout)
      })),
      revenus: (Array.isArray(saved.revenus) ? saved.revenus : []).map((r) => ({
        id: String(r.id || uid()),
        categorie: REV_CATEGORIES.includes(r.categorie) ? r.categorie : 'Salaire',
        nom: String(r.nom || 'Sans nom').slice(0, 60),
        mensuel: num(r.mensuel),
        ajout: validDate(r.ajout)
      })),
      depenses: (Array.isArray(saved.depenses) ? saved.depenses : []).map((d) => ({
        id: String(d.id || uid()),
        categorie: DEP_CATEGORIES.includes(d.categorie) ? d.categorie : 'Autre',
        nom: String(d.nom || 'Sans nom').slice(0, 60),
        montant: num(d.montant),
        cashbackOn: d.cashbackOn !== false,
        roundUpOn: d.roundUpOn !== false,
        ajout: validDate(d.ajout)
      })),
      depensesHistorique: (Array.isArray(saved.depensesHistorique) ? saved.depensesHistorique : []).map((m) => ({
        mois: /^\d{4}-\d{2}$/.test(m.mois) ? m.mois : monthKey(new Date()),
        total: num(m.total),
        items: (Array.isArray(m.items) ? m.items : []).map((d) => ({
          id: String(d.id || uid()),
          categorie: DEP_CATEGORIES.includes(d.categorie) ? d.categorie : 'Autre',
          nom: String(d.nom || 'Sans nom').slice(0, 60),
          montant: num(d.montant),
          ajout: validDate(d.ajout)
        }))
      })).slice(0, 12),
      depensesMoisCourant: /^\d{4}-\d{2}$/.test(saved.depensesMoisCourant) ? saved.depensesMoisCourant : monthKey(new Date()),
      cashbackRate: Number.isFinite(saved.cashbackRate) ? clamp(saved.cashbackRate, 0, MAX_RATE) : 1,
      roundUpTo: ROUND_UP_OPTIONS.includes(saved.roundUpTo) ? saved.roundUpTo : 1,
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

  /* Archive les dépenses du mois précédent dès qu'on change de mois (ex. premier
     chargement de l'app en un nouveau mois) : la liste en cours repart à zéro,
     l'ancienne reste consultable dans l'historique (12 mois glissants max). */
  (() => {
    const nowKey = monthKey(new Date());
    if (state.depensesMoisCourant !== nowKey) {
      if (state.depenses.length) {
        state.depensesHistorique = [
          { mois: state.depensesMoisCourant, total: state.depenses.reduce((sum, d) => sum + d.montant, 0), items: state.depenses },
          ...state.depensesHistorique
        ].slice(0, 12);
      }
      state.depenses = [];
      state.depensesMoisCourant = nowKey;
      save();
    }
  })();

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
  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
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

    const close = () => {
      overlay.hidden = true;
      editBtn.removeEventListener('click', onEdit);
      cancelBtn.removeEventListener('click', onCancel);
      saveBtn.removeEventListener('click', onSave);
      closeBtn.removeEventListener('click', close);
      $('#detailList').removeEventListener('keydown', onListKey);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKey);
    };
    const onOverlayClick = (e) => { if (e.target === overlay) close(); };
    // Échap ne ferme que la pop-up du dessus (choix de catégorie ouvert depuis
    // le mode Modifier : seule celle-ci se ferme).
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const top = [...document.querySelectorAll('.modal-overlay:not([hidden])')].pop();
      if (top === overlay) close();
    };
    editBtn.addEventListener('click', onEdit);
    cancelBtn.addEventListener('click', onCancel);
    saveBtn.addEventListener('click', onSave);
    closeBtn.addEventListener('click', close);
    $('#detailList').addEventListener('keydown', onListKey);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKey);
    setEditing(false);
    overlay.hidden = false;
    closeBtn.focus();
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
    syncYieldInputs();
    renderLines('revenus');
    renderLines('charges');
    renderDepenses();
    refresh();
  }

  init();
})();
