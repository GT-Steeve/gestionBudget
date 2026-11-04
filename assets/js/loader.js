/* ==========================================================================
   Gestion budget — écran de chargement « pile de pièces ».
   Inclus dans le <head> de chaque page, sans defer, juste après style.css :
   il masque le contenu dès le début du chargement (classe is-pending sur
   <html>), n'affiche la pile que si la page met plus de SHOW_DELAY à être
   prête (pas de flash sur un chargement rapide), puis révèle le contenu en
   cascade (is-revealing). Sans JavaScript, rien n'est masqué.
   ========================================================================== */
'use strict';

(() => {
  const root = document.documentElement;
  const SHOW_DELAY = 250;   // ms avant d'afficher la pile
  const STEP = 320;         // ms entre deux pièces (= délais des @keyframes coin-drop-*)
  const REVEAL = 700;       // ms de la cascade d'arrivée du contenu
  const MAX_WAIT = 8000;    // filet de sécurité : le contenu s'affiche quoi qu'il arrive
  const STEPS = ['Chargement des revenus', 'Chargement des charges', 'Chargement des dépenses', 'Calcul des économies', 'Préparation de la synthèse'];

  const timers = [];
  let loader = null;
  let finished = false;

  root.classList.add('is-pending');

  const show = () => {
    if (finished) return;
    if (!document.body) { timers.push(setTimeout(show, 50)); return; }
    loader = document.createElement('div');
    loader.className = 'page-loader';
    loader.setAttribute('role', 'status');
    loader.innerHTML = '<div class="page-loader__stack" aria-hidden="true">'
      + '<span class="coin"></span>'.repeat(STEPS.length)
      + `</div><p class="page-loader__label">${STEPS[0]}</p>`;
    document.body.appendChild(loader);
    root.classList.add('is-loading');
    const label = loader.querySelector('.page-loader__label');
    STEPS.forEach((txt, i) => { if (i) timers.push(setTimeout(() => { label.textContent = txt; }, i * STEP)); });
  };

  const done = () => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    root.classList.remove('is-pending', 'is-loading');
    root.classList.add('is-revealing');
    const shown = loader;
    setTimeout(() => {
      root.classList.remove('is-revealing');
      if (shown) shown.remove();
    }, REVEAL);
  };

  timers.push(setTimeout(show, SHOW_DELAY));
  setTimeout(done, MAX_WAIT);
  if (document.readyState === 'complete') done();
  else window.addEventListener('load', done, { once: true });
  // Retour arrière depuis le cache (bfcache) : la page est déjà prête.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    timers.forEach(clearTimeout);
    root.classList.remove('is-pending', 'is-loading', 'is-revealing');
    if (loader) loader.remove();
  });
})();
