/* ==========================================================================
   Gestion budget — chrome partagé entre les pages (thème, taille, menu mobile)
   Inclus par toutes les pages, après budgets.js et ui.js, avant script.js s'il est présent.
   ========================================================================== */
'use strict';

(() => {
  const THEME_KEY = 'gestion-epargne-theme';
  const ZOOM_KEY = 'gestion-epargne-taille';
  const OLD_ZOOM_KEY = 'gestion-epargne-zoom'; // ancien réglage à 2 tailles (normal 100 % / large 115 %)
  const ZOOMS = ['small', 'normal', 'large'];

  const $ = (sel, root = document) => root.querySelector(sel);

  const store = {
    get(key) {
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
    }
  };

  /* ---------- Menu mobile (hamburger) ---------- */

  function initMenu() {
    const btn = $('#menuBtn');
    const menu = $('#siteMenu');
    if (!btn || !menu) return;

    const close = () => {
      menu.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
      menu.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    };

    btn.addEventListener('click', () => {
      if (menu.classList.contains('is-open')) close(); else open();
    });
    // Referme le menu une fois un lien de section activé.
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) close();
    });
    document.addEventListener('click', (e) => {
      if (!menu.classList.contains('is-open')) return;
      if (menu.contains(e.target) || btn.contains(e.target)) return;
      close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        close();
        btn.focus();
      }
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 640) close();
    });
  }

  /* ---------- Préférences d'affichage (thème, taille) ----------
     Appliquées sur chaque page via <html data-theme> et <html data-zoom> ;
     la page Paramètres (parametres.js) les modifie via window.Prefs. Le
     facteur de chaque taille est défini dans le CSS (--zoom-*) ; sans
     data-zoom, c'est la taille normale. */

  const root = document.documentElement;
  const Prefs = {
    /** Thème affiché : choix enregistré, sinon celui de l'appareil. */
    theme: () => root.dataset.theme
      || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    setTheme(theme) {
      root.dataset.theme = theme;
      store.set(THEME_KEY, theme);
    },
    zoom: () => root.dataset.zoom || 'normal',
    setZoom(zoom) {
      if (zoom === 'small' || zoom === 'large') root.dataset.zoom = zoom; else delete root.dataset.zoom;
      store.set(ZOOM_KEY, zoom);
    }
  };

  function initPrefs() {
    const theme = store.get(THEME_KEY);
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    let zoom = store.get(ZOOM_KEY);
    if (!ZOOMS.includes(zoom)) {
      // Reprend l'ancien réglage en gardant la même taille à l'écran.
      const old = store.get(OLD_ZOOM_KEY);
      zoom = old === 'large' ? 'normal' : old === 'normal' ? 'small' : null;
      if (zoom) store.set(ZOOM_KEY, zoom);
    }
    if (zoom === 'small' || zoom === 'large') root.dataset.zoom = zoom;
  }

  /* ---------- Bouton « Pour tout effacer » du footer ----------
     Sur les pages avec script.js (body[data-app]), c'est lui qui gère déjà ce bouton :
     on ne s'en occupe que sur les pages qui n'ont pas le tableau de bord (ex. À propos,
     Annexe). Même pop-up de confirmation que script.js (UI.confirmDialog), pas l'alerte
     native du navigateur, pour une expérience cohérente sur toutes les pages. */

  function initClearFooter() {
    const btn = $('#btnClearFooter');
    if (!btn || document.body.dataset.app === 'true') return;
    btn.addEventListener('click', () => {
      const STORAGE_KEY = Budgets.dataKey();
      const saved = store.get(STORAGE_KEY) || {};
      const revenus = Array.isArray(saved.revenus) ? saved.revenus : [];
      const charges = Array.isArray(saved.charges) ? saved.charges : [];
      const scenarios = Array.isArray(saved.scenarios) ? saved.scenarios : [];
      const depenses = Array.isArray(saved.depenses) ? saved.depenses : [];
      const depensesHistorique = Array.isArray(saved.depensesHistorique) ? saved.depensesHistorique : [];
      UI.confirmDialog('Êtes-vous sûr de tout effacer ?', [
        ['Ressources', `${revenus.length}`],
        ['Charges', `${charges.length}`],
        ['Comparaisons', `${scenarios.length}`],
        ['Dépenses', `${depenses.length}`],
        ['Mois archivés', `${depensesHistorique.length}`]
      ], () => {
        saved.revenus = [];
        saved.charges = [];
        saved.scenarios = [];
        saved.appliquees = [];
        saved.depenses = [];
        saved.depensesHistorique = [];
        saved.produits = [];
        saved.habitudes = [];
        saved.suggestionsMasquees = { lieux: [], motifs: [] };
        store.set(STORAGE_KEY, saved);
        // Budget entièrement vidé : le guide de démarrage repart de zéro (comme script.js).
        // Ces pages sont toutes dans /pages/ : la Synthèse est un niveau au-dessus.
        const budget = Budgets.active();
        if (budget.exemple) { location.href = '../index.html'; return; }
        Budgets.setGuide(budget.id, null);
        location.href = 'guide.html';
      });
    });
  }

  /* ---------- Flèches de défilement du menu d'onglets (mobile) ----------
     Affiche une flèche gauche/droite seulement quand le menu peut encore
     défiler dans ce sens (masquée dès que la bordure correspondante est
     atteinte). Vit ici plutôt que dans script.js car le menu est présent
     sur toutes les pages, y compris celles sans tableau de bord (À propos). */

  function initNavScrollArrows() {
    const scrollEl = $('.nav');
    const leftBtn = $('#navScrollLeft');
    const rightBtn = $('#navScrollRight');
    if (!scrollEl || !leftBtn || !rightBtn) return;

    const update = () => {
      const canScroll = scrollEl.scrollWidth > scrollEl.clientWidth + 1;
      leftBtn.hidden = !canScroll || scrollEl.scrollLeft <= 0;
      rightBtn.hidden = !canScroll || scrollEl.scrollLeft >= scrollEl.scrollWidth - scrollEl.clientWidth - 1;
    };

    // Amène l'onglet de la page courante dans la zone visible dès le
    // chargement, au cas où il serait hors champ (ex. « À propos », en bout
    // de liste) : sans ça, rien ne signale qu'il faut défiler pour le voir.
    const active = scrollEl.querySelector('a[aria-current="page"]');
    if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });

    update();
    scrollEl.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    leftBtn.addEventListener('click', () => {
      scrollEl.scrollBy({ left: -scrollEl.clientWidth * 0.8, behavior: 'smooth' });
    });
    rightBtn.addEventListener('click', () => {
      scrollEl.scrollBy({ left: scrollEl.clientWidth * 0.8, behavior: 'smooth' });
    });
  }

  /* ---------- Bouton « Fermer l'exemple » ----------
     Tant que le budget d'exemple est ouvert, un bouton fixé en bas de l'écran
     permet d'en sortir : retour au budget d'avant, puis à la page Paramètres.
     Revenir sur la page Paramètres ferme aussi l'exemple, sans bouton : fait ici,
     avant budget.js, pour que la liste affichée ne contienne plus l'exemple. */

  function initExampleClose() {
    if (!Budgets.active().exemple) return;
    if ($('#budgetList')) {
      Budgets.closeExample();
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn example-close';
    btn.textContent = 'Fermer l\'exemple';
    btn.addEventListener('click', () => {
      Budgets.closeExample();
      location.href = location.pathname.includes('/pages/') ? 'parametres.html#budget' : 'pages/parametres.html#budget';
    });
    document.body.append(btn);
    document.body.classList.add('has-example-close');
  }

  /* ---------- Sélecteur de budget (budget actif) ----------
     Remplace le titre « Gestion budget » : au centre de la barre du haut en
     mobile, en haut de la barre latérale dépliée sur tablette et bureau (le
     CSS gère la place), à gauche de la barre du haut en mobile. Le titre
     reste dans le HTML pour les lecteurs d'écran. Changer de budget recharge
     la page sur ses données ; « + Nouveau » ouvre la création d'un budget
     sur la page Paramètres. */

  function initWallet() {
    const brand = $('.topbar .brand');
    if (!brand) return;
    const inPages = location.pathname.includes('/pages/');
    const budgetUrl = `${inPages ? '' : 'pages/'}parametres.html#nouveau`;

    const wallet = document.createElement('div');
    wallet.className = 'wallet';
    const label = document.createElement('label');
    label.className = 'wallet__label';
    label.htmlFor = 'walletSelect';
    label.textContent = 'Budget';
    const select = document.createElement('select');
    select.id = 'walletSelect';
    select.className = 'wallet__select';
    const add = document.createElement('a');
    add.className = 'btn btn--ghost btn--sm wallet__new';
    add.href = budgetUrl;
    // « Nouveau » est masqué sur les écrans étroits (CSS) : « + » seul.
    const addText = document.createElement('span');
    addText.className = 'wallet__new-text';
    addText.textContent = 'Nouveau';
    add.append('+', addText);
    add.setAttribute('aria-label', 'Nouveau budget');
    const row = document.createElement('div');
    row.className = 'wallet__row';
    row.append(select, add);
    wallet.append(label, row);
    brand.after(wallet);
    document.body.classList.add('has-wallet');

    const refresh = () => {
      const activeId = Budgets.activeId();
      select.replaceChildren(...Budgets.list().map((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nom;
        opt.selected = p.id === activeId;
        return opt;
      }));
      select.title = Budgets.active().nom;
    };
    select.addEventListener('change', () => {
      if (!Budgets.setActive(select.value)) { refresh(); return; }
      location.reload();
    });
    refresh();
    window.Wallet = { refresh };
  }

  /* ---------- Message après redirection ----------
     Une page qui redirige (ex. Budget après une création ou un import)
     enregistre un message avec Flash.set ; la page d'arrivée l'affiche une
     seule fois dans une pop-up : { title, text?, action? (libellé du bouton) }. */

  const FLASH_KEY = 'gestion-budget-flash';
  const Flash = {
    set(message) {
      try { sessionStorage.setItem(FLASH_KEY, JSON.stringify(message)); } catch { /* stockage indisponible */ }
    },
    take() {
      try {
        const message = JSON.parse(sessionStorage.getItem(FLASH_KEY));
        sessionStorage.removeItem(FLASH_KEY);
        return message;
      } catch { return null; }
    }
  };

  function initFlash() {
    const message = Flash.take();
    if (!message || typeof message.title !== 'string') return;
    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const overlay = el('div', 'modal-overlay');
    const modal = el('div', 'modal modal--narrow');
    const title = el('p', 'modal__title modal__title--center', message.title);
    const text = el('p', 'modal__text success-text', typeof message.text === 'string' ? message.text : '');
    const ok = el('button', 'btn', typeof message.action === 'string' ? message.action : 'Fermer');
    title.id = 'flashTitle';
    ok.type = 'button';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'flashTitle');
    const actions = el('div', 'modal__actions modal__actions--center');
    actions.append(ok);
    modal.append(title, text, actions);
    overlay.append(modal);

    document.body.append(overlay);
    // Pop-up créée pour l'occasion : retirée de la page une fois fermée.
    ok.addEventListener('click', UI.openModal(overlay, { focus: ok, onClose: () => overlay.remove() }));
  }

  /* ---------- Retour arrière ---------- */

  /** Page réaffichée depuis le cache du navigateur (bouton Retour/Avance) :
      ses données en mémoire datent d'avant les saisies faites ailleurs, et
      la prochaine modification les écraserait. On la recharge. */
  function initBackCache() {
    window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });
  }

  window.Prefs = Prefs;
  window.Flash = Flash;

  initBackCache();

  initPrefs();
  initMenu();
  initClearFooter();
  initExampleClose();
  initWallet();
  initNavScrollArrows();
  initFlash();
})();
