/* ==========================================================================
   Gestion budget — onglets accessibles (role="tablist" / "tab" / "tabpanel")
   Utilisé par produitFinance.html (Actions / Obligations / ETF).
   Un lien vers page.html#id-du-panneau ouvre directement le bon onglet
   (ex. boutons « Plus d'infos » de l'Annexe).
   ========================================================================== */
'use strict';

(() => {
  document.querySelectorAll('[role="tablist"]').forEach((list) => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls'));

    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panelOf(t).hidden = !on;
      });
      if (focus) tab.focus();
    };

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => {
        select(tab, false);
        // L'adresse suit l'onglet, pour pouvoir partager ou revenir dessus.
        history.replaceState(null, '', `#${tab.getAttribute('aria-controls')}`);
      });
      // Flèches gauche/droite, Début/Fin : navigation au clavier entre onglets.
      tab.addEventListener('keydown', (e) => {
        const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        select(tabs[(next + tabs.length) % tabs.length], true);
      });
    });

    const fromHash = () => tabs.find((t) => `#${t.getAttribute('aria-controls')}` === location.hash);
    select(fromHash() || tabs[0], false);
    window.addEventListener('hashchange', () => { const t = fromHash(); if (t) select(t, false); });
  });
})();
