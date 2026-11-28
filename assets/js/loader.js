/* ==========================================================================
   Gestion budget — écran de chargement « pièces ».
   Inclus dans le <head> de chaque page, sans defer, juste après style.css et
   coin-story.js (animation CoinStory, version 2) : il masque le contenu dès
   le début du chargement (classe is-pending sur <html>), n'affiche
   l'animation que si la page met plus de SHOW_DELAY à être prête (pas de
   flash sur un chargement rapide), puis révèle le contenu en cascade
   (is-revealing). Sans JavaScript, rien n'est masqué.

   Une animation affichée ne s'arrête pas net à la fin du chargement : elle
   va au bout de l'étape suivante (le tas devient les trois piles, les piles
   deviennent la pyramide, montée plus vite, et son étoile), pour que le message — trier son
   argent, bâtir, faire fructifier — passe ; déjà sur « Objectif atteint »,
   elle s'arrête à la fin de cette étape, étoile comprise (CoinStory.settle).
   ========================================================================== */
'use strict';

(() => {
  const root = document.documentElement;
  const SHOW_DELAY = 250;   // ms avant d'afficher l'animation
  const STEP = 320;         // ms entre deux textes de chargement
  const REVEAL = 700;       // ms de la cascade d'arrivée du contenu
  const MAX_WAIT = 8000;    // filet de sécurité : le contenu s'affiche quoi qu'il arrive
  const MAX_SETTLE = 6000;  // fin de l'étape en cours : jamais plus longue que ça
  const STEPS = ['Chargement des ressources', 'Chargement des charges', 'Chargement des dépenses', 'Calcul des économies', 'Préparation de la synthèse'];

  const timers = [];
  let loader = null;
  let story = null;
  let finished = false;

  root.classList.add('is-pending');

  const show = () => {
    if (finished) return;
    if (!document.body) { timers.push(setTimeout(show, 50)); return; }
    loader = document.createElement('div');
    loader.className = 'page-loader';
    loader.setAttribute('role', 'status');
    loader.innerHTML = '<div class="page-loader__story" aria-hidden="true"></div>'
      + `<p class="page-loader__label">${STEPS[0]}</p>`;
    document.body.appendChild(loader);
    story = new CoinStory(loader.querySelector('.page-loader__story'), { loop: true, version: 2 });
    root.classList.add('is-loading');
    const label = loader.querySelector('.page-loader__label');
    STEPS.forEach((txt, i) => { if (i) timers.push(setTimeout(() => { label.textContent = txt; }, i * STEP)); });
  };

  const remove = () => {
    if (story) { story.destroy(); story = null; }
    if (loader) { loader.remove(); loader = null; }
  };

  const reveal = () => {
    root.classList.remove('is-pending', 'is-loading');
    root.classList.add('is-revealing');
    setTimeout(() => {
      root.classList.remove('is-revealing');
      remove();
    }, REVEAL);
  };

  const done = () => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    // Animation à l'écran : elle finit son étape suivante avant de laisser
    // place au contenu (filet : MAX_SETTLE). Sinon, le contenu arrive aussitôt.
    if (!story) { reveal(); return; }
    let revealed = false;
    const once = () => { if (!revealed) { revealed = true; reveal(); } };
    story.settle().then(once);
    setTimeout(once, MAX_SETTLE);
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
    remove();
  });
})();
