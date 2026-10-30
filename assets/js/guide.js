/* ==========================================================================
   Gestion budget — guide de démarrage
   - Page Guide : bienvenue, puis « Simuler un budget » (budget fictif chargé
     dans le profil, à modifier pour apprendre) ou « Suivre le guide ».
   - Premier usage : un profil sans aucune donnée (premier lancement, profil
     créé vide) est envoyé sur la page Guide, une seule fois.
   - Guide en cours : un encart en haut de chaque page indique l'étape
     (Revenus → Charges → Dépenses → Économie → Placement) et ouvre l'ajout.
   L'avancement est gardé par profil (Profiles.setGuide). Inclus par la page
   Guide et les pages du tableau de bord, avant script.js.
   ========================================================================== */
'use strict';

(() => {
  const { h } = UI;
  const STEPS = [
    { key: 'revenus', page: 'revenus.html', title: 'Vos revenus', btn: 'btnOpenRevenuWizard', action: 'Ajouter un revenu',
      text: 'Ajoutez ce que vous gagnez chaque mois : salaire, aides, pension… Passez à l\'étape suivante une fois terminé.' },
    { key: 'charges', page: 'charges.html', title: 'Vos charges', btn: 'btnOpenChargeWizard', action: 'Ajouter une charge',
      text: 'Ajoutez vos charges fixes : loyer, factures, abonnements, assurances… Revenus moins charges donnent votre solde du mois.' },
    { key: 'depenses', page: 'depenses.html', title: 'Vos dépenses', btn: 'btnOpenDepenseWizard', action: 'Nouvelle dépense',
      text: 'Au fil du mois, notez vos dépenses du quotidien : courses, sorties, imprévus… Chaque mois est ensuite archivé dans l\'historique.' },
    { key: 'economie', page: 'economie.html', title: 'Vos économies', btn: 'btnOpenScenarioWizard', action: 'Ajouter une comparaison',
      text: 'Comparez une charge à une offre concurrente pour calculer l\'économie possible : du cashflow en plus, à garder ou à investir.' },
    { key: 'placement', page: 'placement.html', title: 'Votre plan d\'épargne', btn: 'btnOpenYieldWizard', action: 'Simuler un placement',
      text: 'Prévoyez un plan d\'épargne avec l\'argent mis de côté et voyez votre capital grandir année après année.' }
  ];

  const inPages = location.pathname.includes('/pages/');
  /** Lien vers une page du site, depuis l'accueil ou depuis /pages/. */
  const url = (page) => (page === 'index.html' ? (inPages ? '../index.html' : 'index.html') : (inPages ? page : `pages/${page}`));
  const profil = Profiles.active();

  /** Fin du guide (terminé ou budget simulé) : retour à la Synthèse, avec un message. */
  const finish = (message) => {
    Profiles.setGuide(profil.id, 'fini');
    Flash.set(message);
    location.href = url('index.html');
  };

  /* ---------- Page Guide ---------- */

  const simulate = document.getElementById('btnGuideSimulate');
  if (simulate) {
    const start = () => {
      Profiles.setGuide(profil.id, STEPS[0].key);
      location.href = url(STEPS[0].page);
    };
    // Profil encore vide : le budget fictif y est enregistré, à modifier pour apprendre.
    const fill = () => {
      try { localStorage.setItem(Profiles.dataKey(profil.id), JSON.stringify(BudgetState.exampleState())); } catch { /* stockage indisponible */ }
      finish({
        title: 'Budget simulé',
        text: 'Ce profil contient maintenant un budget fictif complet : modifiez ses valeurs pour apprendre, puis remplacez-les par les vôtres.',
        action: 'Découvrir la synthèse'
      });
    };
    // Profil déjà rempli : rien n'est remplacé, on ouvre le profil d'exemple à
    // part, comme « Visualiser » sur la page Profil (profil.js).
    const openExample = () => {
      Profiles.openExample();
      location.href = url('index.html');
    };
    simulate.addEventListener('click', () => (Profiles.hasData(profil.id) ? openExample() : fill()));
    document.getElementById('btnGuideStart').addEventListener('click', start);
    return;
  }

  /* ---------- Premier usage : direction la page Guide ---------- */

  // Un profil « pré-rempli » n'échappe au guide que tant qu'il n'a jamais été
  // ouvert (script.js y charge alors l'exemple) ; une fois vidé, il y a droit.
  const neverOpened = (() => {
    try { return localStorage.getItem(Profiles.dataKey(profil.id)) === null; } catch { return false; }
  })();
  if (!profil.exemple && !(profil.preRempli && neverOpened) && !profil.guide && !Profiles.hasData(profil.id)) {
    location.replace(url('guide.html'));
    return;
  }

  /* ---------- Guide en cours : encart de l'étape ---------- */

  const index = STEPS.findIndex((s) => s.key === profil.guide);
  const main = document.querySelector('main');
  if (index < 0 || !main) return;
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const onPage = location.pathname.endsWith(`/${step.page}`);
  const goTo = (i) => {
    Profiles.setGuide(profil.id, STEPS[i].key);
    location.href = url(STEPS[i].page);
  };
  const quit = () => {
    Profiles.setGuide(profil.id, 'fini');
    box.remove();
  };

  const opener = document.getElementById(step.btn);
  const action = onPage && opener
    ? h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => opener.click() }, step.action)
    : h('a', { class: 'btn btn--ghost', href: url(step.page) }, `Aller à l'étape : ${step.title.toLowerCase()}`);
  const note = h('p', { class: 'guide-step__note', hidden: true });
  const box = h('section', { class: 'card guide-step', 'aria-labelledby': 'guideStepTitle' },
    h('p', { class: 'guide-step__count' }, `Guide · étape ${index + 1} sur ${STEPS.length}`),
    h('h2', { id: 'guideStepTitle', class: 'guide-step__title' }, step.title),
    h('p', { class: 'guide-step__text' }, step.text),
    h('div', { class: 'guide-step__actions' },
      index > 0 ? h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => goTo(index - 1) }, 'Étape précédente') : null,
      // Sur la page de l'étape : le bouton ouvre l'ajout ; ailleurs, il y ramène.
      action,
      h('button', {
        type: 'button', class: 'btn',
        onclick: () => (last
          ? finish({ title: 'Guide terminé', text: 'Votre budget est en place. Le guide reste disponible à tout moment dans le menu (Guide).', action: 'Voir la synthèse' })
          : goTo(index + 1))
      }, last ? 'Terminer le guide' : `Étape suivante : ${STEPS[index + 1].title.toLowerCase()}`)),
    note,
    h('button', { type: 'button', class: 'link-btn guide-step__quit', onclick: quit }, 'Quitter le guide'));
  main.prepend(box);
  // Une fois la page prête (DOMContentLoaded : après script.js, même s'il se
  // charge lentement) : si son bouton d'ajout est désactivé (ex. comparaison
  // sans aucune charge), celui du guide l'est aussi, avec la raison.
  document.addEventListener('DOMContentLoaded', () => {
    if (!(onPage && opener?.disabled)) return;
    action.disabled = true;
    note.textContent = opener.title || 'Cette étape n\'est pas encore disponible.';
    note.hidden = false;
  });
})();
