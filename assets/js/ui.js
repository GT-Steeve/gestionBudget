/* ==========================================================================
   Gestion budget — outils d'interface partagés : formats d'affichage,
   création d'éléments DOM, pop-ups (confirmation, information, choix en
   boutons, ajout guidé) et tracés SVG des graphiques. Exposés via window.UI.
   Inclus par toutes les pages, après profiles.js et avant nav.js.
   ========================================================================== */
'use strict';

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  /** Largeur « mobile » : en dessous de 640px, les tableaux changent l'ordre de
      leurs colonnes (Libellé/Montant en premier, voir renderDepenses/renderLines
      dans script.js) et les formulaires passent dans des pop-ups guidées. */
  const MOBILE_QUERY = window.matchMedia('(max-width: 640px)');


  /* ---------- Formats d'affichage ---------- */

  const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eurCompact = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
  const pct1 = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const rateNf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  /** Taux annuel affiché, ex. « 2 % » ou « 7,5 % » (espace insécable). */
  const fmtRate = (r) => `${rateNf.format(r)} %`;
  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
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

  /* ---------- Éléments DOM ---------- */

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

  /* ---------- Pop-ups ---------- */

  /* Pop-ups ouvertes, de la plus ancienne à celle du dessus : Échap et Tab ne
     concernent que la dernière (ex. choix de catégorie ouvert depuis un ajout
     guidé : Échap ne ferme que le choix). */
  const openModals = [];
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /** Éléments atteignables avec Tab dans la pop-up : visibles, et pour un groupe
      de boutons radio, seulement celui qui est coché (comme le navigateur). */
  const tabbables = (overlay) => [...overlay.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length
    && (el.type !== 'radio' || el.checked || !overlay.querySelector(`input[type="radio"][name="${CSS.escape(el.name)}"]:checked`)));

  const topModal = () => {
    // Une pop-up masquée ou retirée sans passer par closeModal ne compte plus.
    while (openModals.length && (openModals.at(-1).overlay.hidden || !openModals.at(-1).overlay.isConnected)) openModals.pop();
    return openModals.at(-1);
  };

  document.addEventListener('keydown', (e) => {
    const top = topModal();
    if (!top) return;
    if (e.key === 'Escape') {
      top.close();
      return;
    }
    if (e.key !== 'Tab') return;
    // Tab reste dans la pop-up : du dernier élément on revient au premier, et inversement.
    const items = tabbables(top.overlay);
    if (!items.length) return;
    const inside = top.overlay.contains(document.activeElement);
    if (e.shiftKey && (!inside || document.activeElement === items[0])) {
      e.preventDefault();
      items.at(-1).focus();
    } else if (!e.shiftKey && (!inside || document.activeElement === items.at(-1))) {
      e.preventDefault();
      items[0].focus();
    }
  });

  /** Affiche une pop-up (.modal-overlay) et renvoie sa fonction de fermeture.
      Échap (si elle est au-dessus) et un clic sur le fond la ferment ; à la
      fermeture, le focus revient sur l'élément qui l'avait à l'ouverture.
      opts.focus : élément (ou sélecteur dans la pop-up) à focaliser ;
      opts.onClose : appelé une fois la pop-up fermée. */
  function openModal(overlay, { focus, onClose } = {}) {
    const known = openModals.findIndex((m) => m.overlay === overlay);
    if (known >= 0) {
      if (!overlay.hidden) return openModals[known].close; // déjà ouverte
      openModals.splice(known, 1); // masquée sans closeModal : on repart de zéro
    }
    const opener = document.activeElement;
    const onBackdrop = (e) => { if (e.target === overlay) close(); };
    const entry = { overlay, close };
    function close() {
      const i = openModals.indexOf(entry);
      if (i < 0) return;
      openModals.splice(i, 1);
      overlay.hidden = true;
      overlay.removeEventListener('click', onBackdrop);
      // Focus resté dans la pop-up (désormais masquée) : retour au bouton
      // d'ouverture, sauf s'il est hors de la pop-up restée au-dessus (Safari ne
      // donne pas le focus à un bouton cliqué) : premier élément de celle-ci.
      if (!document.activeElement || document.activeElement === document.body || overlay.contains(document.activeElement)) {
        const top = topModal();
        const back = opener?.isConnected && (!top || top.overlay.contains(opener)) ? opener : top && tabbables(top.overlay)[0];
        back?.focus?.();
      }
      onClose?.();
    }
    openModals.push(entry);
    overlay.hidden = false;
    overlay.addEventListener('click', onBackdrop);
    (typeof focus === 'string' ? $(focus, overlay) : focus)?.focus();
    return close;
  }

  /** Ferme la pop-up si elle est ouverte (bouton Fermer, passage en bureau…). */
  const closeModal = (overlay) => openModals.find((m) => m.overlay === overlay)?.close();

  /** Pop-up de confirmation (#confirmOverlay) : détails [libellé, valeur] puis
      Annuler / Confirmer. opts.center : pop-up étroite, titre, détails et
      boutons centrés ; opts.okLabel / opts.cancelLabel : textes des boutons ;
      opts.danger (vrai par défaut) : bouton rouge, pour une suppression.
      Sans pop-up dans la page, l'action est faite directement. */
  function confirmDialog(title, details, onConfirm, opts = {}) {
    const overlay = $('#confirmOverlay');
    if (!overlay) { onConfirm(); return; }
    const center = !!opts.center;
    const titleEl = $('#confirmTitle');
    titleEl.textContent = title;
    titleEl.classList.toggle('modal__title--center', center);
    const detailsEl = $('#confirmDetails');
    detailsEl.classList.toggle('modal__details--center', center);
    detailsEl.replaceChildren(...details.flatMap(([label, value]) => [h('dt', {}, label), h('dd', {}, value)]));
    $('#confirmOverlay .modal__actions').classList.toggle('modal__actions--center', center);
    $('#confirmOverlay .modal').classList.toggle('modal--narrow', center);
    // Ouverte aussi depuis une autre pop-up (wizard d'ajout) : déplacée en fin
    // de <body> pour s'afficher au-dessus.
    document.body.append(overlay);

    const okBtn = $('#confirmOk');
    okBtn.textContent = opts.okLabel || 'Confirmer';
    okBtn.classList.toggle('btn--danger', opts.danger !== false);
    $('#confirmCancel').textContent = opts.cancelLabel || 'Annuler';
    const cancelBtn = $('#confirmCancel');
    const onOk = () => { close(); onConfirm(); };
    const onCancel = () => close();
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    const close = openModal(overlay, {
      focus: okBtn,
      onClose: () => {
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
      }
    });
  }

  /** Relie un bouton « i » à une pop-up d'information (texte statique + Fermer). */
  function bindInfoModal(triggerSel, overlaySel, closeSel) {
    const trigger = $(triggerSel);
    const overlay = $(overlaySel);
    if (!trigger || !overlay) return;
    const closeBtn = $(closeSel);
    trigger.addEventListener('click', () => openModal(overlay, { focus: closeBtn }));
    closeBtn.addEventListener('click', () => closeModal(overlay));
  }

  /** Pop-up de choix en boutons (catégorie, date, heure) plutôt qu'un menu
      ou sélecteur natif, plus lisible sur mobile. fill(list, close) remplit
      la grille et renvoie le bouton à focaliser ; compact = petites cases. */
  function openPicker(title, fill, { compact = false } = {}) {
    const overlay = $('#catPickerOverlay');
    if (!overlay) return;
    // Ouverte aussi depuis d'autres pop-ups (wizard d'ajout, Détail) : déplacée
    // en fin de <body> pour s'afficher au-dessus.
    document.body.append(overlay);
    const list = $('#catPickerList');
    const closeBtn = $('#catPickerClose');
    const close = openModal(overlay, { onClose: () => closeBtn.removeEventListener('click', close) });
    closeBtn.addEventListener('click', close);
    $('#catPickerTitle').textContent = title;
    list.classList.toggle('cat-picker--compact', compact);
    fill(list, close)?.focus();
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

  /** Pop-up d'ajout guidé, un champ à la fois (Retour/Suivant), plus
      pratique qu'une ligne de formulaire à plusieurs champs côte à côte au
      clavier mobile. cfg.steps/cfg.fields : même ordre, un par étape (un
      sélecteur, une liste de sélecteurs ou null). Options : cfg.flow()
      renvoie les indices des étapes à parcourir selon les choix déjà faits,
      cfg.onOpen(btn) remet la pop-up à zéro (btn : bouton qui l'a ouverte,
      cfg.openBtn pouvant en lister plusieurs), cfg.onStep(i) prépare l'étape i. */
  function bindAddWizard(cfg) {
    const overlay = $(cfg.overlay);
    const openBtns = [].concat(cfg.openBtn).map((sel) => $(sel)).filter(Boolean);
    const form = $(cfg.form);
    if (!overlay || !openBtns.length || !form) return;

    const closeBtn = $(cfg.closeBtn);
    const backBtn = $(cfg.backBtn);
    const nextBtn = $(cfg.nextBtn);
    const finishBtn = $(cfg.finishBtn);
    const stepLabel = $(cfg.stepLabel);
    // Étapes cherchées dans la pop-up, ou dans cfg.stepsRoot si elles n'y sont
    // pas toujours (formulaire Sauvegarder, déplacé selon la largeur d'écran).
    const steps = cfg.steps.map((sel) => $(sel, cfg.stepsRoot || overlay));
    // Parcours : toutes les étapes dans l'ordre, ou celles que renvoie
    // cfg.flow() (indices dans cfg.steps), relu à chaque étape pour suivre
    // les choix déjà faits (embranchements).
    const order = () => (cfg.flow ? cfg.flow() : steps.map((_, i) => i));
    // Champ(s) à valider avant de passer l'étape i (sélecteur ou liste), le
    // premier recevant le focus ; un champ masqué dans l'étape est ignoré.
    const visible = (el) => { const hid = el.closest('[hidden]'); return !hid || hid === overlay; };
    const fieldsOf = (i) => [].concat(cfg.fields[i] || []).map((sel) => $(sel)).filter((el) => el && visible(el));
    let pos = 0;

    const showStep = (p) => {
      const seq = order();
      pos = Math.max(0, Math.min(p, seq.length - 1));
      const i = seq[pos];
      const last = pos === seq.length - 1;
      steps.forEach((el, idx) => { el.hidden = idx !== i; });
      backBtn.hidden = pos === 0;
      nextBtn.hidden = last;
      finishBtn.hidden = !last;
      if (stepLabel) stepLabel.textContent = `Étape ${pos + 1} / ${seq.length}`;
      cfg.onStep?.(i);
      fieldsOf(i)[0]?.focus();
    };

    const close = () => closeModal(overlay);
    const open = (e) => {
      cfg.onOpen?.(e.currentTarget);
      showStep(0);
      openModal(overlay);
    };
    const current = () => order()[pos];
    const goNext = () => {
      if (!fieldsOf(current()).every((el) => el.reportValidity())) return;
      showStep(pos + 1);
    };

    for (const btn of openBtns) btn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    nextBtn.addEventListener('click', goNext);
    backBtn.addEventListener('click', () => showStep(pos - 1));
    // Entrée dans un champ texte/nombre = Suivant (ou Terminer sur la
    // dernière étape), comme la touche "suivant" d'un clavier mobile.
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      (pos === order().length - 1 ? finishBtn : nextBtn).click();
    });
    // La validation du formulaire (bindForm) gère déjà preventDefault + ajout
    // + reset ; ce listener, ajouté après, ferme juste la pop-up une fois
    // l'ajout effectué.
    form.addEventListener('submit', close);
    return { next: goNext, show: showStep };
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


  /* ---------- Tracés SVG (graphiques de l'application et du rapport) ---------- */

  function niceScale(max, ticks) {
    if (max <= 0) return { max: 100, step: 25 };
    const raw = max / ticks;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / pow;
    const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    const step = nice * pow;
    return { max: Math.ceil(max / step - 1e-9) * step, step };
  }

  function arcPath(cx, cy, r0, r1, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
    return `M${pt(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${pt(r0, a0)} Z`;
  }

  function ringPath(cx, cy, r0, r1) {
    const circle = (r) => `M${cx - r} ${cy} A${r} ${r} 0 1 1 ${cx + r} ${cy} A${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
    return `${circle(r1)} ${circle(r0)}`;
  }

  /** « Vendredi 13 Octobre 2026 » : jour et mois avec majuscule. */
  const fmtAjoutDate = (d) => {
    const jour = capitalize(d.toLocaleDateString('fr-FR', { weekday: 'long' }));
    const mois = capitalize(d.toLocaleDateString('fr-FR', { month: 'long' }));
    return `${jour} ${d.getDate()} ${mois} ${d.getFullYear()}`;
  };

  /** Round up d'un montant : différence jusqu'au multiple supérieur de n ; un
      montant déjà pile sur un multiple est arrondi au multiple suivant (x1 →
      1,00 €, x2 → 2,00 €…) plutôt qu'à 0,00 €. */
  const roundUpOf = (montant, n) => {
    if (montant <= 0) return 0;
    const diff = Math.ceil(montant / n) * n - montant;
    // Tolérance au centime : les flottants ne tombent pas toujours pile.
    return diff < 0.005 ? n : diff;
  };

  /** Pop-up Détail (#detailOverlay) d'un revenu, d'une charge ou d'une
      dépense (kind : 'revenus', 'charges', 'depenses'), avec mode Modifier :
      Libellé, Catégorie, Montant, date et heure deviennent des champs ; les
      valeurs calculées (annuel, cashback, round up) suivent la saisie.
      opts.state : état du budget (taux de cashback, multiple du round up) ;
      opts.onSaved() : après Valider (ligne déjà modifiée) ;
      opts.onDelete(done) : affiche Effacer (#detailDelete, s'il existe), qui
      demande confirmation puis appelle done() pour fermer le pop-up. */
  function itemDetails(item, kind, { state, onSaved, onDelete } = {}) {
    const overlay = $('#detailOverlay');
    if (!overlay) return;
    const isCharge = kind === 'charges';
    const isRevenu = kind === 'revenus';
    const monthly = isCharge || isRevenu; // montant mensuel (sinon ponctuel)
    const key = monthly ? 'mensuel' : 'montant';
    const { CATEGORIES, REV_CATEGORIES, DEP_CATEGORIES, num } = window.BudgetState;
    const cats = [...(isCharge ? CATEGORIES : isRevenu ? REV_CATEGORIES : DEP_CATEGORIES)].sort((a, b) => a.localeCompare(b, 'fr'));
    const editBtn = $('#detailEdit');
    const closeBtn = $('#detailClose');
    const cancelBtn = $('#detailCancel');
    const saveBtn = $('#detailSave');
    const deleteBtn = $('#detailDelete');
    // Croix (icône) : reste visible pendant la modification ; l'ancien bouton
    // texte « Fermer » laisse la place à Annuler / Valider.
    const closeIsIcon = closeBtn.classList.contains('icon-btn');
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
      if (monthly) rows.push(['Annuel', eur2.format(montant * 12)]);
      // Les revenus n'ont ni cashback ni round up.
      if (isRevenu) return rows;
      rows.push(
        [`Cashback (${fmtRate(state.cashbackRate)})`, item.cashbackOn !== false ? eur2.format(montant * state.cashbackRate / 100) : off],
        [`RoundUp (x${state.roundUpTo})`, item.roundUpOn !== false ? eur2.format(roundUpOf(montant, state.roundUpTo)) : off]
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
          ...(item.produit ? [['Produit suivi', `${item.produit} · ${eur2.format(item.produitPrix || 0)}`]] : []),
          ...(item.habitude ? [['Habitude suivie', item.habitude]] : []),
          ...(item.motif ? [['Motif', item.motif]] : []),
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
      closeBtn.hidden = on && !closeIsIcon;
      if (deleteBtn) deleteBtn.hidden = on || !onDelete;
      cancelBtn.hidden = !on;
      saveBtn.hidden = !on;
      render();
      if (!on) editBtn.focus();
    };
    const onEdit = () => setEditing(true);
    // Effacer : confirmation par-dessus le pop-up ; une fois confirmée, la
    // ligne est supprimée et le pop-up de détail se ferme.
    const onDeleteClick = () => onDelete(() => close());
    const onCancel = () => setEditing(false);
    const onSave = () => {
      const nom = draft.nom.trim();
      if (!nom) { $('.detail-field', overlay)?.reportValidity(); return; }
      item.nom = nom.slice(0, 60);
      item.categorie = draft.categorie;
      item[key] = draft.montant;
      if (draft.ajout) item.ajout = draft.ajout.toISOString();
      onSaved?.();
      setEditing(false);
    };
    // Entrée dans un champ = Valider.
    const onListKey = (e) => {
      if (e.key === 'Enter' && draft && e.target.tagName === 'INPUT') { e.preventDefault(); onSave(); }
    };

    editBtn.addEventListener('click', onEdit);
    cancelBtn.addEventListener('click', onCancel);
    saveBtn.addEventListener('click', onSave);
    if (deleteBtn && onDelete) deleteBtn.addEventListener('click', onDeleteClick);
    $('#detailList').addEventListener('keydown', onListKey);
    setEditing(false);
    const close = openModal(overlay, {
      focus: closeBtn,
      onClose: () => {
        editBtn.removeEventListener('click', onEdit);
        cancelBtn.removeEventListener('click', onCancel);
        saveBtn.removeEventListener('click', onSave);
        if (deleteBtn) deleteBtn.removeEventListener('click', onDeleteClick);
        closeBtn.removeEventListener('click', close);
        $('#detailList').removeEventListener('keydown', onListKey);
      }
    });
    closeBtn.addEventListener('click', close);
  }

  window.UI = {
    $, h, s, MOBILE_QUERY, eur2, eur0, eurCompact, pct1, rateNf, fmtRate, capitalize, monthLabel,
    currentMonthName, currentMonthWithPreposition, openModal, closeModal, confirmDialog, bindInfoModal, openPicker,
    pickerOpt, pickCategory, pickDate, pickTime, bindAddWizard, bindResponsiveTrigger,
    niceScale, arcPath, ringPath, fmtAjoutDate, roundUpOf, itemDetails
  };
})();
