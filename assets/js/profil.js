/* ==========================================================================
   Gestion budget — page Profil : créer, importer, changer, renommer, supprimer
   un profil, et ouvrir le profil d'exemple. Le stockage est dans profiles.js.
   ========================================================================== */
'use strict';

(() => {
  const list = document.getElementById('profilList');
  if (!list) return;

  const h = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    node.append(...children);
    return node;
  };

  /** Le nouveau profil devient actif, puis on ouvre la page où continuer ; elle
      affiche la confirmation dans une pop-up (Flash, nav.js). */
  const profileAdded = (id, page, message) => {
    Profiles.setActive(id);
    Flash.set(message);
    location.href = page;
  };

  /* Point de départ d'un nouveau profil : choix en pop-up plutôt que la liste
     native du navigateur. */
  const DEPARTS = { vide: 'Vide', exemple: 'Pré-rempli avec l\'exemple' };
  const departInput = document.getElementById('profilDepart');
  const departBtn = document.getElementById('profilDepartBtn');
  const departOverlay = document.getElementById('departPickerOverlay');
  const setDepart = (value) => {
    departInput.value = value;
    departBtn.textContent = DEPARTS[value];
  };
  const closeDepart = () => {
    departOverlay.hidden = true;
    document.removeEventListener('keydown', onDepartKey);
    departBtn.focus();
  };
  const onDepartKey = (e) => { if (e.key === 'Escape') closeDepart(); };
  departBtn.addEventListener('click', () => {
    const buttons = Object.entries(DEPARTS).map(([value, label]) => h('button', {
      type: 'button', class: 'cat-picker__opt', 'aria-pressed': String(value === departInput.value),
      onclick: () => { setDepart(value); closeDepart(); }
    }, label));
    document.getElementById('departPickerList').replaceChildren(...buttons);
    departOverlay.hidden = false;
    document.addEventListener('keydown', onDepartKey);
    buttons.find((b) => b.getAttribute('aria-pressed') === 'true').focus();
  });
  document.getElementById('departPickerClose').addEventListener('click', closeDepart);
  departOverlay.addEventListener('click', (e) => { if (e.target === departOverlay) closeDepart(); });

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

  /* Montants masqués profil par profil (bouton œil à droite du nom) : ids des
     profils masqués, retenus dans ce navigateur. */
  const HIDE_KEY = 'gestion-budget-montants-masques';
  let hidden = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(HIDE_KEY));
    if (Array.isArray(saved)) hidden = new Set(saved.filter((id) => typeof id === 'string'));
  } catch { /* stockage indisponible */ }
  const toggleHidden = (id) => {
    if (!hidden.delete(id)) hidden.add(id);
    try { localStorage.setItem(HIDE_KEY, JSON.stringify([...hidden])); } catch { /* stockage indisponible */ }
    render();
    // La liste est redessinée : le focus revient sur le bouton œil de ce profil.
    [...list.querySelectorAll('.eye-btn')].find((b) => b.dataset.id === id)?.focus();
  };

  function eyeButton(p) {
    const masked = hidden.has(p.id);
    const label = `${masked ? 'Afficher' : 'Masquer'} les montants de « ${p.nom} »`;
    const btn = h('button', {
      type: 'button', class: 'info-btn eye-btn', 'data-id': p.id, 'aria-pressed': String(masked), 'aria-label': label, title: label,
      onclick: () => toggleHidden(p.id)
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
          onclick: () => confirmDialog(`Supprimer le profil « ${p.nom} » ?`, [
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
          renderStats(summary, hidden.has(p.id))),
        actions
      );
      list.append(item);
    }
  }

  document.getElementById('profilForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const preRempli = departInput.value === 'exemple';
    const profil = Profiles.create(document.getElementById('profilNom').value, { preRempli });
    e.target.reset();
    setDepart('vide');
    // Profil vide : on commence par saisir ses revenus ; pré-rempli : on le découvre depuis la Synthèse.
    profileAdded(profil.id, preRempli ? '../index.html' : 'revenus.html', {
      title: 'Profil créé avec succès',
      text: preRempli
        ? 'Il est pré-rempli avec l\'exemple : vous pouvez maintenant remplacer ses valeurs par les vôtres.'
        : 'Vous pouvez maintenant saisir les valeurs du nouveau profil, en commençant par ses revenus.',
      action: 'Commencer'
    });
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
    const payload = read(new Uint8Array(await file.arrayBuffer()));
    return Profiles.exportName(payload) ? payload : null;
  }

  async function checkFile() {
    pending = null;
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
  const closeRename = () => {
    renameOverlay.hidden = true;
    document.removeEventListener('keydown', onRenameKey);
  };
  const onRenameKey = (e) => { if (e.key === 'Escape') closeRename(); };
  function openRename(nom) {
    renameInput.value = nom;
    renameError.textContent = '';
    renameOverlay.hidden = false;
    document.addEventListener('keydown', onRenameKey);
    renameInput.focus();
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
  renameOverlay.addEventListener('click', (e) => { if (e.target === renameOverlay) closeRename(); });

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
  const closeInfo = () => {
    infoOverlay.hidden = true;
    document.removeEventListener('keydown', onInfoKey);
  };
  const onInfoKey = (e) => { if (e.key === 'Escape') closeInfo(); };
  document.getElementById('importInfoBtn').addEventListener('click', () => {
    infoOverlay.hidden = false;
    document.addEventListener('keydown', onInfoKey);
    infoClose.focus();
  });
  infoClose.addEventListener('click', closeInfo);
  infoOverlay.addEventListener('click', (e) => { if (e.target === infoOverlay) closeInfo(); });

  render();
})();
