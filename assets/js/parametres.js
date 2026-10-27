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

  // Affiche le facteur réellement défini dans le CSS (--zoom-large).
  const factor = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom-large'));
  if (factor) document.getElementById('zoomLargeValue').textContent = `${Math.round(factor * 100)} %`;
})();
