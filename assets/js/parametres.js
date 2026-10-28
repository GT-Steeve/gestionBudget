/* ==========================================================================
   Gestion budget — page Paramètres : taille d'affichage et thème. Les
   préférences sont appliquées et enregistrées par nav.js (window.Prefs).
   ========================================================================== */
'use strict';

(() => {
  const bind = (name, current, set) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = input.value === current;
      input.addEventListener('change', () => { if (input.checked) set(input.value); });
    });
  };

  bind('zoom', Prefs.zoom(), Prefs.setZoom);
  bind('theme', Prefs.theme(), Prefs.setTheme);

  // Affiche les facteurs réellement définis dans le CSS (--zoom-small/normal/large).
  const css = getComputedStyle(document.documentElement);
  document.querySelectorAll('[data-zoom-factor]').forEach((el) => {
    const factor = parseFloat(css.getPropertyValue(`--zoom-${el.dataset.zoomFactor}`));
    if (factor) el.textContent = `${Math.round(factor * 100)} %`;
  });
})();
