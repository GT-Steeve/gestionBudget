/* ==========================================================================
   Gestion budget — chrome partagé entre les pages (thème, taille, menu mobile)
   Inclus par toutes les pages, après profiles.js et avant script.js s'il est présent.
   ========================================================================== */
'use strict';

(() => {
  const THEME_KEY = 'gestion-epargne-theme';
  const ZOOM_KEY = 'gestion-epargne-zoom';

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
     facteur de la taille agrandie est défini dans le CSS (html[data-zoom]). */

  const root = document.documentElement;
  const Prefs = {
    /** Thème affiché : choix enregistré, sinon celui de l'appareil. */
    theme: () => root.dataset.theme
      || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    setTheme(theme) {
      root.dataset.theme = theme;
      store.set(THEME_KEY, theme);
    },
    zoom: () => (root.dataset.zoom === 'large' ? 'large' : 'normal'),
    setZoom(zoom) {
      if (zoom === 'large') root.dataset.zoom = 'large'; else delete root.dataset.zoom;
      store.set(ZOOM_KEY, zoom);
    }
  };

  function initPrefs() {
    const theme = store.get(THEME_KEY);
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    if (store.get(ZOOM_KEY) === 'large') root.dataset.zoom = 'large';
  }

  /* ---------- Bouton « Pour tout effacer » du footer ----------
     Sur les pages avec script.js (body[data-app]), c'est lui qui gère déjà ce bouton :
     on ne s'en occupe que sur les pages qui n'ont pas le tableau de bord (ex. À propos,
     Annexe). Même pop-up de confirmation que script.js (#confirmOverlay), pas l'alerte
     native du navigateur, pour une expérience cohérente sur toutes les pages. */

  /** opts.center : pop-up étroit, titre, texte et boutons centrés (comme script.js). */
  function confirmDeleteFooter(title, details, onConfirm, opts = {}) {
    const overlay = $('#confirmOverlay');
    if (!overlay) { onConfirm(); return; }
    const center = !!opts.center;
    $('#confirmTitle').textContent = title;
    $('#confirmTitle').classList.toggle('modal__title--center', center);
    $('#confirmOverlay .modal').classList.toggle('modal--narrow', center);
    $('#confirmOverlay .modal__actions').classList.toggle('modal__actions--center', center);
    const detailsEl = $('#confirmDetails');
    detailsEl.classList.toggle('modal__details--center', center);
    detailsEl.replaceChildren();
    for (const [label, value] of details) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      detailsEl.append(dt, dd);
    }

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

  function initClearFooter() {
    const btn = $('#btnClearFooter');
    if (!btn || document.body.dataset.app === 'true') return;
    btn.addEventListener('click', () => {
      const STORAGE_KEY = Profiles.dataKey();
      const saved = store.get(STORAGE_KEY) || {};
      const revenus = Array.isArray(saved.revenus) ? saved.revenus : [];
      const charges = Array.isArray(saved.charges) ? saved.charges : [];
      const scenarios = Array.isArray(saved.scenarios) ? saved.scenarios : [];
      const depenses = Array.isArray(saved.depenses) ? saved.depenses : [];
      const depensesHistorique = Array.isArray(saved.depensesHistorique) ? saved.depensesHistorique : [];
      confirmDeleteFooter('Êtes-vous sûr de tout effacer ?', [
        ['Revenus', `${revenus.length}`],
        ['Charges', `${charges.length}`],
        ['Comparaisons', `${scenarios.length}`],
        ['Dépenses', `${depenses.length}`],
        ['Mois archivés', `${depensesHistorique.length}`]
      ], () => {
        saved.revenus = [];
        saved.charges = [];
        saved.scenarios = [];
        saved.depenses = [];
        saved.depensesHistorique = [];
        store.set(STORAGE_KEY, saved);
        location.href = 'index.html';
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
     Tant que le profil d'exemple est ouvert, un bouton fixé en bas de l'écran
     permet d'en sortir : retour au profil d'avant, puis à la page Profil.
     Revenir sur la page Profil ferme aussi l'exemple, sans bouton : fait ici,
     avant profil.js, pour que la liste affichée ne contienne plus l'exemple. */

  function initExampleClose() {
    if (!Profiles.active().exemple) return;
    if ($('#profilList')) {
      Profiles.closeExample();
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn example-close';
    btn.textContent = 'Fermer l\'exemple';
    btn.addEventListener('click', () => {
      Profiles.closeExample();
      location.href = location.pathname.includes('/pages/') ? 'profil.html' : 'pages/profil.html';
    });
    document.body.append(btn);
    document.body.classList.add('has-example-close');
  }

  // Même pop-up de confirmation, réutilisée par la page Profil (profil.js).
  window.confirmDialog = confirmDeleteFooter;
  window.Prefs = Prefs;

  initPrefs();
  initMenu();
  initClearFooter();
  initExampleClose();
  initNavScrollArrows();
})();
