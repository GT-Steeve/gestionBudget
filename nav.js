/* ==========================================================================
   Gestion budget — chrome partagé entre les pages (thème + menu mobile)
   Inclus par index.html ET apropos.html, avant script.js s'il est présent.
   ========================================================================== */
'use strict';

(() => {
  const THEME_KEY = 'gestion-epargne-theme';

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
    // Referme le menu une fois un lien de section (ou le bouton thème) activé.
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

  /* ---------- Thème ---------- */

  function initTheme() {
    const saved = store.get(THEME_KEY);
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
    const btn = $('#themeBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      store.set(THEME_KEY, next);
    });
  }

  initMenu();
  initTheme();
})();
