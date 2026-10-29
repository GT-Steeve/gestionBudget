/* ==========================================================================
   Gestion budget — export (pages Exporter et Imprimer) : un même rapport,
   rendu en HTML pour le PDF et l'impression (fenêtre d'impression du
   navigateur), ou en fichier .docx pour Word et Google Docs (docx.js).
   Format du rapport : voir docx.js. Chargé seulement par ces deux pages,
   avant script.js, qui appelle Report.bindExport avec l'état du profil.
   ========================================================================== */
'use strict';

(() => {
  const { $, h, s, MOBILE_QUERY, eur2, eur0, eurCompact, pct1, fmtRate, capitalize, monthLabel,
    currentMonthWithPreposition, closeModal, bindAddWizard, niceScale, arcPath, ringPath } = UI;
  const { CATEGORIES, REV_CATEGORIES, DEP_CATEGORIES } = BudgetState;
  const annual = Calc.annual;

  /** Relie le formulaire d'export. ctx : état du profil actif et calculs de
      script.js (totaux, économies, placement, CashBack, RoundUp, couleurs). */
  function bindExport({ state, totalRevenus, totalMonthly, computeSavings, computeYield, cashbackFraction, roundUpAmount, CAT_KEY }) {
    const EXPORT_MODELS = {
      simple: { label: 'Simple', sections: ['synthese', 'depenses'] },
      standard: { label: 'Standard', sections: ['synthese', 'revenus', 'depenses', 'charges', 'placement'] },
      complet: {
        label: 'Complet',
        sections: ['synthese', 'revenus', 'depenses', 'charges', 'historique', 'economie', 'placement', 'cashback', 'roundup']
      }
    };

    const fmtDay = (iso) => (iso ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(iso)) : '–');
    /** Tableau du rapport, ou une phrase si la liste est vide. */
    const reportTable = (head, rows, extra = {}) => (rows.length
      ? { type: 'table', head, rows, align: head.map((_, i) => (i >= (extra.textCols || 1) ? 'right' : 'left')), ...extra }
      : { type: 'p', text: 'Aucune donnée pour le moment.' });
    /* Graphiques du rapport (PDF / impression uniquement, ignorés par docx.js) :
       un bloc table peut porter un champ `chart` (camembert qui remplace le
       tableau, ou courbe de capital affichée au-dessus) et un bloc kv un champ
       `tiles` (tuiles affichées à la place des lignes). Couleurs fixes, celles
       du thème clair, pour rester lisibles sur papier. */
    const REPORT_CAT_COLORS = {
      salaire: '#1baf7a', aide: '#008300', loyer: '#2a78d6', factures: '#eb6834', courses: '#eda100',
      transport: '#e87ba4', abonnements: '#4a3aa7', activite: '#9a6a3a', plaisir: '#7a9a0e', autre: '#e34948'
    };
    const REPORT_PALETTE = ['#2a78d6', '#eb6834', '#eda100', '#1baf7a', '#e87ba4', '#4a3aa7', '#9a6a3a',
      '#7a9a0e', '#e34948', '#0f8b8d', '#b04fb5', '#5b6b7a', '#c2185b', '#00838f', '#8d6e63'];
    const RESTE_LABEL = 'Reste à épargner';
    /** Une couleur par libellé : celle de la catégorie quand elle existe, sinon une couleur libre de la palette. */
    const reportColors = (labels) => {
      const fixed = labels.map((l) => (l === RESTE_LABEL ? '#d6ccb6' : REPORT_CAT_COLORS[CAT_KEY[l]] || null));
      const free = REPORT_PALETTE.filter((c) => !fixed.includes(c));
      let next = 0;
      return fixed.map((c) => c || free[next++ % free.length]);
    };
    /** Répartition (montant et part du total), de la plus grosse à la plus petite, « Reste à épargner » en dernier. */
    const breakdownTable = (entries, centerLabel) => {
      const kept = entries.filter((e) => e.value > 0)
        .sort((a, b) => (a.label === RESTE_LABEL) - (b.label === RESTE_LABEL) || b.value - a.value);
      const total = kept.reduce((sum, e) => sum + e.value, 0);
      const block = reportTable(['Catégorie', 'Montant', 'Part'],
        kept.map((e) => [e.label, eur2.format(e.value), pct1.format(e.value / total)]));
      if (block.type === 'table') {
        const colors = reportColors(kept.map((e) => e.label));
        block.chart = {
          kind: 'donut', centerLabel, centerValue: eur0.format(total),
          slices: kept.map((e, i) => ({ label: e.label, value: e.value, share: e.value / total, color: colors[i] }))
        };
      }
      return block;
    };
    const categoryTable = (cats, items, key, centerLabel) => breakdownTable(
      cats.map((cat) => ({ label: cat, value: items.filter((x) => x.categorie === cat).reduce((sum, x) => sum + x[key], 0) })),
      centerLabel);
    /** Bloc kv doublé de tuiles : [libellé, valeur, sous-titre?, ton ('good' | 'bad')?]. */
    const tilesBlock = (tiles) => ({
      type: 'kv',
      rows: tiles.map(([label, value, sub]) => [label, sub ? `${value} · ${sub}` : value]),
      tiles: tiles.map(([label, value, sub, tone]) => ({ label, value, sub, tone }))
    });
    const toneOf = (v) => (v > 0.004 ? 'good' : v < -0.004 ? 'bad' : null);
    const lineTable = (lines) => reportTable(['Catégorie', 'Libellé', 'Mensuel', 'Annuel'],
      lines.map((l) => [l.categorie, l.nom, eur2.format(l.mensuel), eur2.format(annual(l.mensuel))]),
      { textCols: 2, foot: ['Total', '', eur2.format(lines.reduce((sum, l) => sum + l.mensuel, 0)), eur2.format(annual(lines.reduce((sum, l) => sum + l.mensuel, 0)))] });
    const depenseTable = (items) => reportTable(['Date', 'Catégorie', 'Libellé', 'Montant'],
      [...items].sort((a, b) => String(a.ajout).localeCompare(String(b.ajout)))
        .map((d) => [fmtDay(d.ajout), d.categorie, d.nom, eur2.format(d.montant)]),
      { textCols: 3, foot: ['Total', '', '', eur2.format(items.reduce((sum, d) => sum + d.montant, 0))] });
    /** Tableau CashBack / RoundUp : lignes concernées (charges puis dépenses du mois). */
    const extraTable = (flag, amountOf, label) => {
      const rows = [
        ...state.charges.filter((c) => c[flag] !== false).map((c) => [c.nom, eur2.format(c.mensuel), eur2.format(amountOf(c.mensuel))]),
        ...state.depenses.filter((d) => d[flag] !== false).map((d) => [d.nom, eur2.format(d.montant), eur2.format(amountOf(d.montant))])
      ];
      return reportTable(['Libellé', 'Montant', label], rows);
    };
    const extraTotals = (flag, amountOf) => {
      const charges = state.charges.reduce((sum, c) => sum + (c[flag] !== false ? amountOf(c.mensuel) : 0), 0);
      const depenses = state.depenses.reduce((sum, d) => sum + (d[flag] !== false ? amountOf(d.montant) : 0), 0);
      return [
        ['Sur les charges', `${eur2.format(charges)} par mois · ${eur2.format(annual(charges))} par an`],
        [`Sur les dépenses ${currentMonthWithPreposition()}`, eur2.format(depenses)]
      ];
    };

    const REPORT_SECTIONS = {
      synthese() {
        const rev = totalRevenus();
        const ch = totalMonthly();
        const solde = rev - ch;
        const eco = computeSavings().monthly;
        const { years, results: [low, high] } = computeYield();
        // Même répartition que le camembert de la Synthèse : charges par catégorie + reste à épargner.
        const entries = CATEGORIES.map((cat) => ({
          label: cat, value: state.charges.filter((c) => c.categorie === cat).reduce((sum, c) => sum + c.mensuel, 0)
        }));
        if (solde > 0.004) entries.push({ label: RESTE_LABEL, value: solde });
        return {
          title: 'Synthèse',
          blocks: [
            tilesBlock([
              ['Revenus par mois', eur2.format(rev), `${eur2.format(annual(rev))} par an`],
              ['Charges par mois', eur2.format(ch), `${eur2.format(annual(ch))} par an`],
              ['Solde par mois (revenus − charges)', eur2.format(solde), `${eur2.format(annual(solde))} par an`, toneOf(solde)],
              ['Taux d\'épargne', rev > 0 ? pct1.format(solde / rev) : '–', 'solde ÷ revenus', toneOf(solde)],
              ['Économie possible', `${eur2.format(eco)} par mois`, eco > 0 ? `solde après économies : ${eur2.format(solde + eco)}` : null],
              [`Capital dans ${years} an${years > 1 ? 's' : ''}`, `${eur0.format(high.pts[years].balance)} à ${fmtRate(high.rate)}`,
                `${eur0.format(low.pts[years].balance)} à ${fmtRate(low.rate)}`]
            ]),
            { type: 'h3', text: 'Où va votre argent ?' },
            breakdownTable(entries, rev >= ch && rev > 0 ? 'Revenus par mois' : 'Charges par mois')
          ]
        };
      },
      revenus: () => ({
        title: 'Revenus',
        blocks: [lineTable(state.revenus), { type: 'h3', text: 'Répartition par catégorie' },
          categoryTable(REV_CATEGORIES, state.revenus, 'mensuel', 'Revenus par mois')]
      }),
      charges: () => ({
        title: 'Charges',
        blocks: [lineTable(state.charges), { type: 'h3', text: 'Répartition par catégorie' },
          categoryTable(CATEGORIES, state.charges, 'mensuel', 'Charges par mois')]
      }),
      depenses() {
        const total = state.depenses.reduce((sum, d) => sum + d.montant, 0);
        const n = state.depenses.length;
        return {
          title: `Dépenses de ${monthLabel(state.depensesMoisCourant)}`,
          blocks: [
            tilesBlock([
              ['Total dépensé', eur2.format(total)],
              ['Nombre de dépenses', String(n)],
              ['Montant moyen', n ? eur2.format(total / n) : '–']
            ]),
            depenseTable(state.depenses),
            { type: 'h3', text: 'Répartition par catégorie' },
            categoryTable(DEP_CATEGORIES, state.depenses, 'montant', 'Total dépensé')
          ]
        };
      },
      historique: () => ({
        title: 'Historique des dépenses',
        blocks: state.depensesHistorique.length
          ? state.depensesHistorique.flatMap((m) => [
            { type: 'h3', text: `${capitalize(monthLabel(m.mois))} · ${eur2.format(m.total)}` },
            depenseTable(m.items)
          ])
          : [{ type: 'p', text: 'Aucun mois archivé pour le moment.' }]
      }),
      economie() {
        const { rows, monthly, annual: yearly } = computeSavings();
        return {
          title: 'Économie',
          blocks: [
            reportTable(['Charge', 'Alternative', 'Actuel', 'Nouveau', 'Économie / mois'],
              rows.map((r) => [r.charge.nom, r.sc.option || '–', eur2.format(r.charge.mensuel), eur2.format(r.sc.nouveau), eur2.format(r.eco)]),
              { textCols: 2 }),
            { type: 'kv', rows: [['Économie possible (meilleure option par charge)', `${eur2.format(monthly)} par mois · ${eur2.format(yearly)} par an`]] }
          ]
        };
      },
      placement() {
        const { years, results: [low, high] } = computeYield();
        const table = reportTable(['Année', 'Total versé', `Capital à ${fmtRate(low.rate)}`, `Capital à ${fmtRate(high.rate)}`],
          low.pts.slice(1).map((p, i) => [String(p.year), eur0.format(p.deposited), eur0.format(p.balance), eur0.format(high.pts[i + 1].balance)]));
        if (table.type === 'table') {
          table.chart = {
            kind: 'growth',
            years: low.pts.map((p) => p.year),
            series: [
              { label: 'Total versé', color: '#9a9283', dashed: true, values: low.pts.map((p) => p.deposited) },
              { label: `Capital à ${fmtRate(low.rate)}`, color: '#2a78d6', values: low.pts.map((p) => p.balance) },
              { label: `Capital à ${fmtRate(high.rate)}`, color: '#1baf7a', values: high.pts.map((p) => p.balance) }
            ]
          };
        }
        return {
          title: 'Placement',
          blocks: [
            tilesBlock([
              ['Épargne mensuelle', eur2.format(state.yield.versement)],
              ['Capital de départ', eur2.format(state.yield.capital)],
              ['Durée', `${years} an${years > 1 ? 's' : ''}`],
              [`Capital à ${fmtRate(low.rate)}`, eur0.format(low.pts[years].balance), `dont ${eur0.format(low.pts[years].deposited)} versés`],
              [`Capital à ${fmtRate(high.rate)}`, eur0.format(high.pts[years].balance), `dont ${eur0.format(high.pts[years].deposited)} versés`, 'good']
            ]),
            table
          ]
        };
      },
      cashback: () => ({
        title: `CashBack (${fmtRate(state.cashbackRate)})`,
        blocks: [extraTable('cashbackOn', (m) => m * cashbackFraction(), 'Cashback'),
          { type: 'kv', rows: extraTotals('cashbackOn', (m) => m * cashbackFraction()) }]
      }),
      roundup: () => ({
        title: `RoundUp (x${state.roundUpTo})`,
        blocks: [extraTable('roundUpOn', roundUpAmount, 'Arrondi'),
          { type: 'kv', rows: extraTotals('roundUpOn', roundUpAmount) }]
      })
    };

    /** Contenu de chaque chapitre, affiché sous son titre dans le sommaire (PDF / impression). */
    const SECTION_SUMMARIES = {
      synthese: 'Chiffres clés et répartition de vos revenus',
      revenus: 'Détail des revenus et répartition par catégorie',
      depenses: 'Dépenses du mois et répartition par catégorie',
      charges: 'Détail des charges fixes et répartition par catégorie',
      historique: 'Dépenses des mois précédents',
      economie: 'Comparaisons et économies possibles',
      placement: 'Simulation d\'épargne et évolution du capital',
      cashback: 'Cashback estimé sur les charges et dépenses',
      roundup: 'Arrondi automatique mis de côté'
    };

    function buildReport(modelKey) {
      const model = EXPORT_MODELS[modelKey] || EXPORT_MODELS.simple;
      const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date());
      const profile = Profiles.active().nom;
      return {
        title: `Gestion budget · modèle ${model.label}`,
        subtitle: `Profil « ${profile} » · exporté le ${date}`,
        // Page de garde (PDF / impression uniquement, ignorée par docx.js).
        cover: { model: model.label, profile },
        sections: model.sections.map((key) => ({ ...REPORT_SECTIONS[key](), summary: SECTION_SUMMARIES[key] }))
      };
    }

    /** Camembert du rapport + légende (libellé, montant, part et barre de proportion). */
    function reportDonut(c) {
      const SIZE = 180, C = SIZE / 2, R1 = 86, R0 = 56;
      const svg = s('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, width: SIZE, height: SIZE, 'aria-hidden': 'true' });
      let a = -Math.PI / 2;
      for (const sl of c.slices) {
        const a1 = a + sl.share * 2 * Math.PI;
        svg.append(s('path', {
          d: sl.share >= 0.9999 ? ringPath(C, C, R0, R1) : arcPath(C, C, R0, R1, a, a1),
          'fill-rule': 'evenodd', fill: sl.color, stroke: '#fff', 'stroke-width': 1.5
        }));
        a = a1;
      }
      svg.append(
        s('text', { class: 'report__c1', x: C, y: C - 5, 'text-anchor': 'middle' }, c.centerLabel),
        s('text', { class: 'report__c2', x: C, y: C + 17, 'text-anchor': 'middle' }, c.centerValue)
      );
      const max = Math.max(...c.slices.map((sl) => sl.share));
      return h('div', { class: 'report__chart' },
        svg,
        h('ul', { class: 'report__legend' }, c.slices.map((sl) => h('li', {},
          h('span', { class: 'sw', style: `--c:${sl.color}` }),
          h('span', { class: 'rl-name' }, sl.label),
          h('span', { class: 'rl-val' }, eur2.format(sl.value)),
          h('span', { class: 'rl-pct' }, pct1.format(sl.share)),
          h('span', { class: 'rl-bar' }, h('span', { style: `width:${(sl.share / max) * 100}%;background:${sl.color}` }))
        ))));
    }

    /** Courbes du rapport (capital année par année), au-dessus du tableau du placement. */
    function reportGrowth(c) {
      const W = 640, H = 220, m0 = { t: 14, r: 12, b: 26, l: 58 };
      const iw = W - m0.l - m0.r, ih = H - m0.t - m0.b;
      const last = c.years.length - 1;
      const { max: yMax, step } = niceScale(Math.max(1, ...c.series.flatMap((sr) => sr.values)), 4);
      const X = (i) => m0.l + (last ? (i / last) * iw : iw / 2);
      const Y = (v) => m0.t + ih - (v / yMax) * ih;
      const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', 'aria-hidden': 'true' });
      for (let v = 0; v <= yMax + 1e-9; v += step) {
        svg.append(
          s('line', { class: v === 0 ? 'report__axis' : 'report__grid', x1: m0.l, x2: W - m0.r, y1: Y(v), y2: Y(v) }),
          s('text', { class: 'report__tick', x: m0.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, eurCompact.format(v))
        );
      }
      const every = Math.max(1, Math.ceil(c.years.length / 10));
      c.years.forEach((year, i) => {
        // Dernière année toujours affichée ; la graduation précédente saute si elle la chevauche.
        if (i === last || (i % every === 0 && last - i > every / 2)) {
          svg.append(s('text', { class: 'report__tick', x: X(i), y: H - 8, 'text-anchor': 'middle' }, year ? `${year} an${year > 1 ? 's' : ''}` : 'Départ'));
        }
      });
      for (const sr of c.series) {
        svg.append(s('polyline', {
          points: sr.values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' '),
          fill: 'none', stroke: sr.color, 'stroke-width': sr.dashed ? 1.5 : 2.5,
          'stroke-dasharray': sr.dashed ? '5 4' : 'none', 'stroke-linejoin': 'round'
        }));
      }
      return h('div', { class: 'report__growth' },
        svg,
        h('ul', { class: 'report__keys' }, c.series.map((sr) => h('li', {},
          h('span', { class: `sw${sr.dashed ? ' sw--dashed' : ''}`, style: `--c:${sr.color}` }), sr.label))));
    }

    /** Rapport → HTML (zone #printReport, seule visible à l'impression sur la page Exporter).
        dataUrl : lien « Gestion budget » de la page de garde, qui porte les
        données du profil pour l'import du PDF (pdflink.js). */
    function renderReportHtml(report, box, { dataUrl } = {}) {
      const cells = (tag, values, align = []) => values.map((v, i) => h(tag, { class: align[i] === 'right' ? 'num' : null }, v));
      const block = (b) => {
        if (b.type === 'h3') return h('h3', {}, b.text);
        if (b.type === 'p') return h('p', {}, b.text);
        if (b.type === 'kv' && b.tiles) {
          return h('div', { class: 'report__tiles' }, b.tiles.map((t) => h('div', { class: `report__tile${t.tone ? ` is-${t.tone}` : ''}` },
            h('span', {}, t.label), h('strong', {}, t.value), t.sub ? h('small', {}, t.sub) : null)));
        }
        if (b.type === 'kv') {
          return h('table', { class: 'report__kv' },
            h('tbody', {}, b.rows.map(([k, v]) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', { class: 'num' }, v)))));
        }
        if (b.chart?.kind === 'donut') return reportDonut(b.chart);
        return [
          b.chart?.kind === 'growth' ? reportGrowth(b.chart) : null,
          h('table', {},
            h('thead', {}, h('tr', {}, cells('th', b.head, b.align))),
            h('tbody', {}, b.rows.map((r) => h('tr', {}, cells('td', r, b.align)))),
            b.foot ? h('tfoot', {}, h('tr', {}, cells('td', b.foot, b.align))) : null)
        ];
      };
      const num = (i) => String(i + 1).padStart(2, '0');
      const { cover } = report;
      box.replaceChildren(
        // Page de garde
        h('div', { class: 'report__cover' },
          h('p', { class: 'report__brand' }, dataUrl ? h('a', { href: dataUrl }, 'Gestion budget') : 'Gestion budget'),
          h('div', { class: 'report__cover-main' },
            h('p', { class: 'report__kicker' }, `Modèle ${cover.model}`),
            h('h1', {}, 'Rapport de compte'),
            h('p', { class: 'report__sub' }, `Profil « ${cover.profile} »`))),
        // Sommaire
        h('nav', { class: 'report__toc', 'aria-label': 'Sommaire' },
          h('h2', {}, 'Sommaire'),
          h('ol', {}, report.sections.map((sec, i) => h('li', {},
            h('a', { href: `#report-ch-${i + 1}` },
              h('span', { class: 'toc-num' }, num(i)),
              h('span', { class: 'toc-text' }, h('strong', {}, sec.title), sec.summary ? h('small', {}, sec.summary) : null)))))),
        // Chapitres
        ...report.sections.map((sec, i) => h('section', { class: 'report__chapter', id: `report-ch-${i + 1}` },
          h('header', { class: 'report__chapter-head' },
            h('span', { class: 'report__chapter-num' }, `Chapitre ${num(i)}`),
            h('h2', {}, sec.title),
            sec.summary ? h('p', {}, sec.summary) : null),
          sec.blocks.flatMap(block)))
      );
    }

    function downloadFile(bytes, mime, filename) {
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      const link = h('a', { href: url, download: filename });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** Exporter sur mobile : sous MOBILE_QUERY, le formulaire passe dans une
        pop-up guidée, une étape par choix (Format, Modèle, Données du profil),
        comme « Nouvelle dépense » ; il revient dans la page au-delà. Un seul
        formulaire, donc une seule logique d'export. */
    function bindExportWizard(form, status) {
      const overlay = $('#exportWizardOverlay');
      const slot = $('#exportWizardSlot');
      if (!overlay || !slot) return;
      const steps = ['#exportStepFormat', '#exportStepModele', '#exportStepDonnees'];
      bindAddWizard({
        overlay: '#exportWizardOverlay',
        openBtn: '#btnOpenExportWizard',
        form: '#exportForm',
        closeBtn: '#exportWizardClose',
        backBtn: '#exportWizardBack',
        nextBtn: '#exportWizardNext',
        finishBtn: '#exportWizardFinish',
        stepLabel: '#exportWizardStepLabel',
        steps,
        stepsRoot: form,
        fields: ['input[name="format"]:checked', 'input[name="modele"]:checked', 'input[name="donnees"]:checked']
      });
      // Nouvelle pop-up : le message du dernier export est effacé.
      $('#btnOpenExportWizard').addEventListener('click', () => { status.textContent = ''; });
      const place = () => {
        if (MOBILE_QUERY.matches) {
          slot.append(form);
          return;
        }
        status.before(form);
        // En bureau, toutes les étapes sont visibles et la pop-up n'a plus lieu d'être.
        steps.forEach((sel) => { $(sel, form).hidden = false; });
        closeModal(overlay);
      };
      place();
      MOBILE_QUERY.addEventListener('change', place);
    }

    /** Pages Exporter et Imprimer : même formulaire, la page Imprimer fixe le
        format à « print » (champ caché) et ne propose que le choix du modèle. */
    function bindExportForm() {
      const form = $('#exportForm');
      if (!form) return;
      const status = $('#exportStatus');
      // Avant l'export : la pop-up mobile se ferme d'abord, pour ne pas être imprimée.
      bindExportWizard(form, status);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const format = form.elements.format.value;
        const modelKey = form.elements.modele.value;
        const report = buildReport(modelKey);
        // Données du profil jointes seulement sur demande : un rapport partagé
        // (modèle Simple, par exemple) ne doit pas emporter tout le budget.
        const data = form.elements.donnees.value === 'oui' ? Profiles.exportData(state) : null;
        if (format === 'print' || format === 'pdf') {
          // PDF : pas de bibliothèque ni de serveur, la fenêtre d'impression du
          // navigateur propose « Enregistrer au format PDF » comme destination.
          status.textContent = format === 'pdf' ? 'Dans la fenêtre d\'impression, choisissez « Enregistrer au format PDF » comme destination.' : '';
          renderReportHtml(report, $('#printReport'), { dataUrl: data && PdfLink.url(data) });
          window.print();
          return;
        }
        // Avec les données jointes, le fichier s'importe sur la page Profil.
        downloadFile(Docx.build(report, { data }), Docx.MIME, `gestion-budget-${modelKey}-${new Date().toISOString().slice(0, 10)}.docx`);
        // Google Docs : aucune connexion n'est possible depuis l'application,
        // le même fichier .docx s'importe dans Google Drive.
        status.textContent = format === 'gdocs'
          ? 'Fichier .docx téléchargé. Pour l\'ouvrir dans Google Docs : sur Google Drive, Nouveau → Importer un fichier, puis « Ouvrir avec Google Docs ».'
          : 'Fichier Word (.docx) téléchargé.';
      });
    }

    bindExportForm();
  }

  window.Report = { bindExport };
})();
