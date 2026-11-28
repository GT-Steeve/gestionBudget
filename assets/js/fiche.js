/* ==========================================================================
   Gestion budget — fiche produit (rendement, faits, top 10 ou rendement
   par année, source datée), partagée par le simulateur de la page Placement
   (placement.js, étape Produits) et la page Produits financiers
   (produits.js). Renvoie le HTML du contenu ; chaque page ajoute ses
   boutons. S'appuie sur placement-data.js (SEEN).
   ========================================================================== */
'use strict';

(() => {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pctNf = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct = (n) => `${pctNf.format(n)} %`;
  const signedPct = (n) => `${n > 0 ? '+' : ''}${pct(n)}`;
  const X_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  /** Bouton croix de la fenêtre (attr : data-close, data-back…). */
  const closeBtn = (attr, label) => `<button type="button" class="icon-btn pf-modal__x" ${attr} aria-label="${label}">${X_ICON}</button>`;

  /** Contenu de la fiche s (deux colonnes) et ligne « Source ». editable :
      la page permet de modifier la fiche (sinon, pas de renvoi vers
      « Modifier la fiche » dans les messages). */
  function body(s, { editable = false } = {}) {
    const seen = s.seen || PlacementData.SEEN;
    const tot = s.top10.reduce((a, [, w]) => a + w, 0);
    const mx = Math.max(...s.top10.map((t) => t[1]), 1);
    const perf = s.perf == null ? '<span class="pf-big__none">Non renseignée</span>'
      : `${s.approx ? '≈ ' : ''}${esc(signedPct(s.perf))}<small>${esc(s.perfUnit || '/ an')}</small>`;
    const fund = s.fund ? `<dl class="pf-facts"><div class="pf-facts__wide"><dt>Fonds</dt><dd>${esc(s.fund)}</dd></div>
      ${s.ter != null ? `<div><dt>Frais (TER)</dt><dd>${esc(s.ter.toLocaleString('fr-FR', { minimumFractionDigits: 2 }))} % / an</dd></div>` : ''}
      ${s.aum ? `<div><dt>Encours</dt><dd>${esc(s.aum)}</dd></div>` : ''}</dl>` : '';
    const facts = s.facts ? `<dl class="pf-facts">${s.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : '';
    let right;
    if (s.years) {
      const ymx = Math.max(...s.years.map((r) => Math.abs(r[1])), 1);
      right = `<h3 class="pf-top10__h">Rendement par année <span>${esc(seen)}</span></h3>
        ${s.years.map(([yr, v]) => `<div class="pf-row10${v < 0 ? ' is-neg' : ''}"><i></i><b>${yr}${yr === 2026 ? ' (à date)' : ''}</b><span>${esc(signedPct(v))}</span><div class="pf-bar" style="width:${Math.abs(v) / ymx * 100}%"></div></div>`).join('')}
        <p class="pf-small">${s.perfUnit ? 'Pas assez d’années de cotation pour calculer une moyenne.' : 'Moyenne géométrique des rendements annuels 2021 à 2025, l’année 2026 n’étant pas terminée.'}</p>`;
    } else if (s.type === 'Action') {
      right = `<h3 class="pf-top10__h">Rendement par année</h3><p class="pf-small">Historique non relevé pour cette action${editable ? ' : saisissez son rendement moyen avec « Modifier la fiche »' : ''}.</p>`;
    } else if (s.top10.length) {
      right = `<h3 class="pf-top10__h">${esc(s.compTitle || '10 premières sociétés')} <span>${esc(s.compDate || '')}</span></h3>
        ${s.top10.slice(0, 10).map(([n, w], i) => `<div class="pf-row10"><i>${i + 1}</i><b>${esc(n)}</b><span>${esc(pct(w))}</span><div class="pf-bar" style="width:${w / mx * 100}%"></div></div>`).join('')}
        <p class="pf-small">${esc(s.compNote || '')}${s.compNote ? ' · ' : ''}Top 10 : ${esc(pct(tot))}</p>`;
    } else if (s.topNames) {
      right = `<h3 class="pf-top10__h">10 premières sociétés</h3>
        ${s.topNames.map((n, i) => `<div class="pf-row10"><i>${i + 1}</i><b>${esc(n)}</b><span>—</span></div>`).join('')}
        <p class="pf-small">${esc(s.compNote || '')}</p>`;
    } else {
      right = `<h3 class="pf-top10__h">${s.type === 'Obligation' ? 'Composition' : '10 premières sociétés'}</h3><p class="pf-small">Composition non renseignée${editable ? '. Utilisez « Modifier la fiche » pour la saisir ; sinon elle compte en « Non renseigné » dans l\'Aperçu' : ''}.</p>`;
    }
    const src = s.url ? `<p class="pf-small pf-src">Source : <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.src)}<span class="sr-only"> (nouvel onglet)</span></a>${s.url2 ? ` · <a href="${esc(s.url2)}" target="_blank" rel="noopener">${esc(s.src2)}<span class="sr-only"> (nouvel onglet)</span></a>` : ''} · consulté le ${esc(seen)}.${s.perf == null ? '' : s.years ? ' Rendement moyen calculé à partir des variations annuelles du cours.' : ' Rendement moyen annualisé calculé à partir du rendement cumulé publié.'}</p>` : '';
    return { src, html: `<div class="pf-mcols"><div>
      <h2 class="pf-modal__title" id="pfModalTitle">${esc(s.name)}</h2>
      <p class="pf-modal__desc">${esc(s.desc)}</p>
      <div class="pf-perf">
        <p class="pf-small">${esc(s.perfLabel || 'Rendement moyen estimé · EUR')}</p>
        <p class="pf-big${s.perf < 0 ? ' is-neg' : ''}">${perf}</p>
        ${s.period ? `<p class="pf-small">${esc(s.period)}</p>` : ''}
        ${s.method ? `<p class="pf-small pf-method">${esc(s.method)}</p>` : ''}
        <p class="pf-small">${[s.ticker, s.isin].filter(Boolean).map(esc).join(' · ')}</p>
      </div>
      ${facts}${fund}
    </div><div class="pf-top10">${right}</div></div>` };
  }

  window.Fiche = { esc, pct, signedPct, closeBtn, body };
})();
