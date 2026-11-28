/* ==========================================================================
   Gestion budget — page Produits financiers : « Voir la fiche » ouvre la
   fiche du produit en pop-up, la même que dans le simulateur de la page
   Placement (fiche.js, données de placement-data.js retrouvées par ISIN).
   ========================================================================== */
'use strict';

(() => {
  const overlay = document.getElementById('pfModal');
  if (!overlay) return;
  const box = overlay.querySelector('.modal');
  let close = null;

  function open(isin) {
    const s = PlacementData.byIsin(isin);
    if (!s) return;
    const { html, src } = Fiche.body(s);
    box.innerHTML = `${Fiche.closeBtn('data-close', 'Fermer')}<div class="pf-modal__body">${html}
      <div class="pf-mfoot">${src}</div></div>`;
    close = UI.openModal(overlay, { focus: box.querySelector('.pf-modal__x'), onClose: () => { close = null; } });
  }

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.fiche) { e.preventDefault(); open(e.target.dataset.fiche); }
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fiche]');
    if (btn) { open(btn.dataset.fiche); return; }
    if (e.target.closest('#pfModal [data-close]')) close?.();
  });
})();
