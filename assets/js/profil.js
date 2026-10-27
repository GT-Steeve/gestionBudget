/* ==========================================================================
   Gestion budget — page Profil : créer, changer, renommer, supprimer un
   profil, et ouvrir le profil d'exemple. Le stockage est dans profiles.js.
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

  /** Le profil choisi devient actif, puis on ouvre la page indiquée. */
  const openProfile = (id, page) => {
    Profiles.setActive(id);
    location.href = page;
  };

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

  function render() {
    const profils = Profiles.list();
    const activeId = Profiles.activeId();
    list.replaceChildren();
    for (const p of profils) {
      const active = p.id === activeId;
      const item = h('li', { class: `profile-item${active ? ' is-active' : ''}` });
      const actions = h('div', { class: 'profile-item__actions' });
      // « Actif » prend la place du bouton « Utiliser », à la même taille :
      // les boutons ne bougent pas d'une ligne à l'autre.
      if (active) {
        actions.append(h('span', { class: 'btn btn--sm profile-active' }, 'Actif'));
      } else {
        // On reste sur la page Profil : seul le profil actif change.
        actions.append(h('button', {
          type: 'button', class: 'btn btn--sm',
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
        h('div', { class: 'profile-item__name' },
          h('strong', {}, p.nom),
          ...(p.exemple ? [h('span', { class: 'pill' }, 'Exemple')] : [])),
        actions
      );
      list.append(item);
    }
  }

  document.getElementById('profilForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const preRempli = document.getElementById('profilDepart').value === 'exemple';
    const profil = Profiles.create(document.getElementById('profilNom').value, { preRempli });
    // Profil vide : on commence par saisir ses revenus ; pré-rempli : on le découvre depuis la Synthèse.
    openProfile(profil.id, preRempli ? '../index.html' : 'revenus.html');
  });

  /** Ouvre le profil d'exemple ; le bouton « Fermer l'exemple » (nav.js) ramène ici. */
  const openExample = () => {
    Profiles.openExample();
    location.href = '../index.html';
  };
  document.getElementById('btnOpenExample').addEventListener('click', openExample);

  render();
})();
