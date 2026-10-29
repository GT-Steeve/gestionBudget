/* ==========================================================================
   Gestion budget — page Profil : créer, importer, changer, renommer, supprimer
   un profil, et ouvrir le profil d'exemple. Le stockage est dans profiles.js.
   ========================================================================== */
'use strict';

(() => {
  const list = document.getElementById('profilList');
  if (!list) return;

  const { h, openModal, closeModal } = UI;

  /** Le nouveau profil devient actif, puis on ouvre la page où continuer ; elle
      affiche la confirmation dans une pop-up (Flash, nav.js). */
  const profileAdded = (id, page, message) => {
    Profiles.setActive(id);
    Flash.set(message);
    location.href = page;
  };

  /* Point de départ d'un nouveau profil : choix en pop-up plutôt que la liste
     native du navigateur. Deux couples bouton + champ caché l'utilisent : le
     formulaire de la page et la pop-up guidée (mobile). */
  const DEPARTS = { vide: 'Vide', exemple: 'Pré-rempli avec l\'exemple' };
  const departOverlay = document.getElementById('departPickerOverlay');
  const setDepart = ({ btn, input }, value) => {
    input.value = value;
    btn.textContent = DEPARTS[value];
  };
  // Le focus revient tout seul sur le bouton qui a ouvert le choix (openModal).
  const closeDepart = () => closeModal(departOverlay);
  const bindDepart = (target) => target.btn.addEventListener('click', () => {
    const buttons = Object.entries(DEPARTS).map(([value, label]) => h('button', {
      type: 'button', class: 'cat-picker__opt', 'aria-pressed': String(value === target.input.value),
      onclick: () => { setDepart(target, value); closeDepart(); }
    }, label));
    document.getElementById('departPickerList').replaceChildren(...buttons);
    openModal(departOverlay, { focus: buttons.find((b) => b.getAttribute('aria-pressed') === 'true') });
  });
  document.getElementById('departPickerClose').addEventListener('click', closeDepart);

  const pageDepart = { btn: document.getElementById('profilDepartBtn'), input: document.getElementById('profilDepart') };
  const wizardDepart = { btn: document.getElementById('wProfilDepartBtn'), input: document.getElementById('wProfilDepart') };
  bindDepart(pageDepart);
  bindDepart(wizardDepart);

  function renderNameEditor(item, p) {
    const input = h('input', { type: 'text', maxlength: Profiles.MAX_NAME, value: p.nom, 'aria-label': 'Nouveau nom du profil' });
    const saveName = () => { Profiles.rename(p.id, input.value); render(); };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveName();
      if (e.key === 'Escape') render();
    });
    item.replaceChildren(
      h('div', { class: 'profile-item__name' }, input),
      h('div', { class: 'profile-item__actions' },
        h('button', { type: 'button', class: 'btn btn--sm', onclick: saveName }, 'Enregistrer'),
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: render }, 'Annuler'))
    );
    input.focus();
    input.select();
  }

  const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

  /* Montants masqués profil par profil (bouton œil à droite du nom), retenus
     dans le registre des profils (profiles.js) : supprimés avec le profil. */
  (() => {
    // Reprise de l'ancien réglage (v1.14.0 à v1.14.4), gardé à part dans localStorage.
    const OLD_KEY = 'gestion-budget-montants-masques';
    try {
      const old = JSON.parse(localStorage.getItem(OLD_KEY));
      if (Array.isArray(old)) old.forEach((id) => Profiles.setMasked(id, true));
      localStorage.removeItem(OLD_KEY);
    } catch { /* stockage indisponible */ }
  })();
  const toggleHidden = (p) => {
    Profiles.setMasked(p.id, !p.masque);
    render();
    // La liste est redessinée : le focus revient sur le bouton œil de ce profil.
    [...list.querySelectorAll('.eye-btn')].find((b) => b.dataset.id === p.id)?.focus();
  };

  function eyeButton(p) {
    const masked = !!p.masque;
    const label = `${masked ? 'Afficher' : 'Masquer'} les montants de « ${p.nom} »`;
    const btn = h('button', {
      type: 'button', class: 'info-btn eye-btn', 'data-id': p.id, 'aria-pressed': String(masked), 'aria-label': label, title: label,
      onclick: () => toggleHidden(p)
    });
    btn.append(document.getElementById('eyeIcons').content.cloneNode(true));
    return btn;
  }

  /** Revenus, charges, dépenses et solde du mois sous le nom du profil. */
  function renderStats(s, hideAmounts) {
    if (!s) return h('p', { class: 'profile-stats profile-stats--empty' }, 'Valeurs affichées après la première ouverture du profil.');
    const stat = (key, label, value, cls = '') => h('div', { class: `profile-stat profile-stat--${key}${cls}` },
      h('dt', {}, label), h('dd', {}, hideAmounts ? '•••• €' : value));
    const tone = hideAmounts ? '' : s.solde > 0.004 ? ' is-good' : s.solde < -0.004 ? ' is-bad' : '';
    return h('dl', { class: 'profile-stats' },
      stat('revenus', 'Revenus', eur.format(s.revenus)),
      stat('charges', 'Charges', eur.format(s.charges)),
      stat('depenses', 'Dépenses', eur.format(s.depenses)),
      stat('solde', 'Solde', eur.format(s.solde), tone));
  }

  function render() {
    const profils = Profiles.list();
    const activeId = Profiles.activeId();
    list.replaceChildren();
    for (const p of profils) {
      const active = p.id === activeId;
      const item = h('li', { class: `profile-item${active ? ' is-active' : ''}` });
      const actions = h('div', { class: 'profile-item__actions' });
      const summary = Profiles.summary(p.id);
      // « Actif » prend la place du bouton « Utiliser », à la même taille :
      // les boutons ne bougent pas d'une ligne à l'autre.
      if (active) {
        actions.append(h('span', { class: 'btn btn--sm profile-active' }, 'Actif'));
      } else {
        // On reste sur la page Profil : seul le profil actif change.
        actions.append(h('button', {
          type: 'button', class: 'btn btn--sm profile-use',
          onclick: () => { Profiles.setActive(p.id); render(); }
        }, 'Utiliser'));
      }
      actions.append(h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => renderNameEditor(item, p) }, 'Renommer'));
      if (profils.length > 1) {
        actions.append(h('button', {
          type: 'button', class: 'btn btn--ghost btn--sm',
          onclick: () => UI.confirmDialog(`Supprimer le profil « ${p.nom} » ?`, [
            ['Êtes-vous sûr ?', '']
          ], () => { Profiles.remove(p.id); render(); }, { center: true })
        }, 'Supprimer'));
      }
      item.append(
        h('div', { class: 'profile-item__main' },
          h('div', { class: 'profile-item__name' },
            h('strong', {}, p.nom),
            ...(p.exemple ? [h('span', { class: 'pill' }, 'Exemple')] : []),
            // Œil à droite du nom : masque / affiche les montants du profil.
            ...(summary ? [eyeButton(p)] : [])),
          renderStats(summary, !!p.masque)),
        actions
      );
      list.append(item);
    }
  }

  /** Crée le profil, puis ouvre la page où continuer. */
  function createProfile(nom, depart) {
    const preRempli = depart === 'exemple';
    const profil = Profiles.create(nom, { preRempli });
    // Profil vide : on commence par saisir ses revenus ; pré-rempli : on le découvre depuis la Synthèse.
    profileAdded(profil.id, preRempli ? '../index.html' : 'revenus.html', {
      title: 'Profil créé avec succès',
      text: preRempli
        ? 'Il est pré-rempli avec l\'exemple : vous pouvez maintenant remplacer ses valeurs par les vôtres.'
        : 'Vous pouvez maintenant saisir les valeurs du nouveau profil, en commençant par ses revenus.',
      action: 'Commencer'
    });
  }

  document.getElementById('profilForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const depart = pageDepart.input.value;
    const nom = document.getElementById('profilNom').value;
    e.target.reset();
    setDepart(pageDepart, 'vide');
    createProfile(nom, depart);
  });

  /* ---------- Créer un profil sur mobile : pop-up guidée ----------
     Une étape à la fois (Nom, puis Point de départ), avec Retour/Suivant,
     comme « Ajouter un revenu » (bindAddWizard, script.js). */
  const wizard = document.getElementById('profilWizardOverlay');
  const wizardForm = document.getElementById('profilWizardForm');
  const wizardSteps = [...wizard.querySelectorAll('.wizard__step')];
  const wizardFields = [document.getElementById('wProfilNom'), wizardDepart.btn];
  const wizardBack = document.getElementById('profilWizardBack');
  const wizardNext = document.getElementById('profilWizardNext');
  const wizardFinish = document.getElementById('profilWizardFinish');
  let wizardStep = 0;
  const showWizardStep = (i) => {
    wizardStep = i;
    wizardSteps.forEach((el, idx) => { el.hidden = idx !== i; });
    wizardBack.hidden = i === 0;
    wizardNext.hidden = i === wizardSteps.length - 1;
    wizardFinish.hidden = i !== wizardSteps.length - 1;
    document.getElementById('profilWizardStepLabel').textContent = `Étape ${i + 1} / ${wizardSteps.length}`;
    wizardFields[i].focus();
  };
  const closeWizard = () => closeModal(wizard);
  const wizardGoNext = () => {
    if (!wizardFields[wizardStep].reportValidity()) return;
    showWizardStep(Math.min(wizardStep + 1, wizardSteps.length - 1));
  };
  document.getElementById('btnOpenProfilWizard').addEventListener('click', () => {
    wizardForm.reset();
    setDepart(wizardDepart, 'vide');
    openModal(wizard);
    showWizardStep(0);
  });
  document.getElementById('profilWizardClose').addEventListener('click', closeWizard);
  wizardNext.addEventListener('click', wizardGoNext);
  wizardBack.addEventListener('click', () => showWizardStep(Math.max(wizardStep - 1, 0)));
  // Entrée dans le champ Nom = Suivant, comme la touche « suivant » d'un clavier mobile.
  wizardForm.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    (wizardStep === wizardSteps.length - 1 ? wizardFinish : wizardNext).click();
  });
  wizardForm.addEventListener('submit', (e) => {
    e.preventDefault();
    closeWizard();
    createProfile(document.getElementById('wProfilNom').value, wizardDepart.input.value);
  });

  /** Ouvre le profil d'exemple ; le bouton « Fermer l'exemple » (nav.js) ramène ici. */
  const openExample = () => {
    Profiles.openExample();
    location.href = '../index.html';
  };
  document.getElementById('btnOpenExample').addEventListener('click', openExample);

  /* ---------- Importer un profil ----------
     Seul un .docx ou un PDF exporté par l'application (page Exporter ou
     Imprimer) est accepté : données embarquées par docx.js ou pdflink.js et
     marquées par profiles.js. */

  const MAX_IMPORT_SIZE = 10 * 1024 * 1024;
  const REFUSED = 'Fichier refusé : seul un fichier Word (.docx) ou PDF exporté par Gestion budget peut être importé.';
  const READERS = { docx: Docx.readData, pdf: PdfLink.readData };
  const importForm = document.getElementById('importForm');
  const fileInput = document.getElementById('importFichier');
  const fileName = document.getElementById('importFileName');
  const drop = document.getElementById('importDrop');
  const status = document.getElementById('importStatus');
  let pending = null; // { file, payload } du dernier fichier reconnu

  const setStatus = (text, tone) => {
    status.textContent = text;
    status.className = `note import-status${tone ? ` is-${tone}` : ''}`;
  };

  /** Données du fichier, ou null s'il n'est pas un export de l'application. */
  async function readExport(file) {
    const read = READERS[file.name.split('.').pop().toLowerCase()];
    if (!read || file.size > MAX_IMPORT_SIZE) return null;
    const payload = await read(new Uint8Array(await file.arrayBuffer()));
    return Profiles.exportName(payload) ? payload : null;
  }

  async function checkFile() {
    pending = null;
    importForm.classList.remove('is-ready');
    const file = fileInput.files[0];
    fileName.textContent = '';
    setStatus('');
    if (!file) return;
    const payload = await readExport(file);
    if (fileInput.files[0] !== file) return; // un autre fichier a été choisi entre-temps
    if (!payload) {
      fileInput.value = '';
      setStatus(REFUSED, 'error');
      return;
    }
    pending = { file, payload };
    fileName.textContent = `Fichier reconnu : ${file.name}`;
    // Pop-up mobile : « Sélectionner le fichier » laisse la place à « Valider ».
    importForm.classList.add('is-ready');
  }

  fileInput.addEventListener('change', checkFile);

  importForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!fileInput.files[0]) { setStatus('Sélectionnez d\'abord le fichier à importer.', 'error'); return; }
    if (!pending || pending.file !== fileInput.files[0]) await checkFile();
    if (!pending) return;
    // Le profil importé garde le nom enregistré dans le fichier, sauf s'il est déjà pris.
    const nom = Profiles.exportName(pending.payload);
    if (Profiles.nameExists(nom)) openRename(nom);
    else importAs(nom);
  });

  function importAs(nom) {
    const profil = Profiles.importProfile(pending.payload, nom);
    if (!profil) { setStatus(REFUSED, 'error'); return; }
    profileAdded(profil.id, '../index.html', {
      title: 'Profil importé avec succès',
      text: `Le profil « ${profil.nom} » est maintenant actif.`,
      action: 'Voici sa synthèse'
    });
  }

  // Pop-up « Un profil du même nom existe déjà » : un nouveau nom libre est demandé.
  const renameOverlay = document.getElementById('importRenameOverlay');
  const renameForm = document.getElementById('importRenameForm');
  const renameInput = document.getElementById('importRenameInput');
  const renameError = document.getElementById('importRenameError');
  const closeRename = () => closeModal(renameOverlay);
  function openRename(nom) {
    renameInput.value = nom;
    renameError.textContent = '';
    openModal(renameOverlay, { focus: renameInput });
    renameInput.select();
  }
  renameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nom = renameInput.value.trim();
    renameError.textContent = !nom ? 'Saisissez un nom pour le profil importé.'
      : Profiles.nameExists(nom) ? `Le nom « ${nom} » est déjà utilisé : choisissez-en un autre.` : '';
    if (renameError.textContent) { renameInput.focus(); return; }
    closeRename();
    importAs(nom);
  });
  renameInput.addEventListener('input', () => { renameError.textContent = ''; });
  document.getElementById('importRenameCancel').addEventListener('click', closeRename);

  // Glisser-déposer (zone visible sur bureau) : le fichier déposé remplit le champ.
  const hasFile = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  drop.addEventListener('dragover', (e) => {
    if (!hasFile(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    drop.classList.add('is-over');
  });
  drop.addEventListener('dragleave', (e) => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('is-over'); });
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    if (e.dataTransfer.files.length !== 1) { setStatus('Déposez un seul fichier.', 'error'); return; }
    fileInput.files = e.dataTransfer.files;
    checkFile();
  });
  // Un fichier lâché à côté de la zone ne doit pas ouvrir le fichier à la place de la page.
  document.addEventListener('dragover', (e) => { if (hasFile(e)) e.preventDefault(); });
  document.addEventListener('drop', (e) => { if (hasFile(e)) e.preventDefault(); });

  // Pop-up « Quels fichiers peut-on importer ? »
  const infoOverlay = document.getElementById('importInfoOverlay');
  const infoClose = document.getElementById('importInfoClose');
  document.getElementById('importInfoBtn').addEventListener('click', () => openModal(infoOverlay, { focus: infoClose }));
  infoClose.addEventListener('click', () => closeModal(infoOverlay));

  /* ---------- Importer un profil sur mobile : pop-up ----------
     Sous 640px, le formulaire d'import de la page (et son message) est déplacé
     dans une pop-up, sous l'avertissement de la bulle d'info ; il revient dans
     la page au-delà. Un seul formulaire, donc une seule logique d'import. */
  const MOBILE_QUERY = window.matchMedia('(max-width: 640px)');
  const importOverlay = document.getElementById('importOverlay');
  const importSlot = document.getElementById('importModalSlot');
  const importHome = document.querySelector('.profil-import');
  importSlot.append(infoOverlay.querySelector('.modal__text').cloneNode(true));
  const closeImport = () => closeModal(importOverlay);
  // Dans la pop-up, le message (refus en rouge) passe au-dessus du bouton, et
  // le bouton d'envoi, affiché une fois le fichier reconnu, devient « Valider ».
  const importSubmit = importForm.querySelector('button[type="submit"]');
  const placeImport = () => {
    if (MOBILE_QUERY.matches) {
      importSlot.append(status, importForm);
      importSubmit.textContent = 'Valider';
    } else {
      importHome.append(importForm, status);
      importSubmit.textContent = 'Importer';
      closeImport();
    }
  };
  placeImport();
  MOBILE_QUERY.addEventListener('change', placeImport);

  document.getElementById('btnOpenImport').addEventListener('click', () => {
    fileInput.value = '';
    checkFile(); // repart d'un choix vide : message et « Valider » effacés
    openModal(importOverlay, { focus: '#importClose' });
  });
  // Annuler (fichier reconnu) : retour au texte et à « Sélectionner le fichier ».
  document.getElementById('importCancel').addEventListener('click', () => {
    fileInput.value = '';
    checkFile();
    fileInput.focus();
  });
  document.getElementById('importClose').addEventListener('click', closeImport);

  render();
})();
