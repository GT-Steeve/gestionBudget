/* Démo CoinStory (animation-pieces/index.html) : lecture, pause, navigation
   entre les étapes, thème clair / sombre et bascule version 1 / version 2. */
'use strict';
{
  const el = document.getElementById('coins');
  const dots = document.getElementById('dots');
  const label = document.getElementById('label');
  const toggle = document.getElementById('toggle');

  el.addEventListener('coinstory:scene', (e) => {
    label.textContent = e.detail.label;
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === e.detail.index));
  });

  // version 2 par défaut (sans « Les pièces tombent ») ; le bouton bascule en version 1
  let version = 2, story;
  const sync = () => { if (story) toggle.textContent = story.playing ? 'Pause' : 'Lecture'; };
  const start = () => {
    if (story) story.destroy();
    story = new CoinStory(el, { loop: true, version });
    dots.replaceChildren(...story.labels.map((l, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', l);
      b.dataset.i = i;
      return b;
    }));
    dots.children[story.index]?.classList.add('on');
    label.textContent = story.labels[story.index];
    document.getElementById('version').textContent = `Version ${version}`;
    sync();
  };
  start();
  document.getElementById('version').addEventListener('click', () => { version = version === 2 ? 1 : 2; start(); });

  dots.addEventListener('click', (e) => { if (e.target.dataset.i) story.goTo(+e.target.dataset.i); });
  toggle.addEventListener('click', () => { if (story.playing) story.pause(); else story.play(); sync(); });
  document.getElementById('prev').addEventListener('click', () => story.prev());
  document.getElementById('next').addEventListener('click', () => story.next());
  document.getElementById('restart').addEventListener('click', () => { story.restart(); sync(); });
  document.getElementById('theme').addEventListener('click', () => {
    const r = document.documentElement;
    const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    r.dataset.theme = dark ? 'light' : 'dark';
  });
}
