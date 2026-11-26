/* ==========================================================================
   Gestion budget — animation CoinStory (pièces), source unique : chargée
   dans le <head> de chaque page juste avant loader.js (écran de chargement)
   et par la démo animation-pieces/index.html.

   Deux versions :
   - version 2 (par défaut) : joli tas → trois piles → pyramide ;
   - version 1 ({ version: 1 }) : précédée de l'étape « Les pièces tombent »
     (pluie de pièces).
   La pyramide de piles de 3 se monte pièce par pièce, puis l'étoile sort de
   derrière et brille. Monnaies (€ $ £ ¥ ₱ ₩) tirées au hasard à chaque boucle.
   Couleurs : variables --coin-* de style.css.

   const story = new CoinStory(el, { loop: true, version: 2 });
   story.play() / pause() / next() / prev() / goTo(n) / restart() / destroy()
   story.settle() : fin naturelle (écran de chargement), voir plus bas.
   Événements sur el : 'coinstory:scene' (detail.index, detail.label),
   'coinstory:end' (sans boucle).
   ========================================================================== */
'use strict';

class CoinStory {
  constructor(el, opts = {}) {
    this.el = el;
    this.opts = {
      loop: true, autoplay: true, speed: 1,
      // version 2 (par défaut) : commence au joli tas ; version 1 : avec l'étape « Les pièces tombent »
      version: 2,
      // monnaies mélangées : euro, dollar, livre, yen, peso, won
      symbols: ['€', '$', '£', '¥', '₱', '₩'],
      ...opts,
    };
    this.N = 30;
    this.G = 272;      // ligne du sol (centre des pièces posées)
    this.STEP = 8;     // écart vertical entre deux pièces d'une pile
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // aléatoire déterministe : même rendu à chaque cycle
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    this.rain = Array.from({ length: this.N }, () => ({
      x: 34 + rnd() * 252, v: 0.34 + rnd() * 0.14, ph: rnd() * 440,
      w: 0.003 + rnd() * 0.004, tilt: (rnd() - 0.5) * 50, jx: (rnd() - 0.5) * 50,
    }));

    this._build();
    this._shuffleSymbols();
    this.heap = this._heapSlots(rnd);
    this.scenes = this._scenes();
    this.labels = CoinStory.LABELS.slice();
    if (this.opts.version !== 1) {
      // sans la pluie : le joli tas devient la 1re étape et apparaît en fondu
      this.scenes.shift();
      this.labels.shift();
      this.scenes[0] = { ...this.scenes[0], blend: 'fade', dur: 1000 };
      // passage du tas aux trois piles plus court (≈ 0,8 s au lieu de ≈ 1,3 s)
      this.scenes[1] = { ...this.scenes[1], moveDur: 500, stagger: 10, dur: 1300 }; // piles visibles 0,5 s une fois en place
    }
    this.cur = Array.from({ length: this.N }, () => ({ x: 160, y: -60, sy: 1, r: 0, o: 0, z: 0 }));
    this.index = -1;
    this.playing = false;
    this._frame = this._frame.bind(this);

    this.goTo(this.reduced ? this.scenes.length - 1 : 0);
    if (this.opts.autoplay && !this.reduced) this.play();
    else this._renderStatic();
  }

  /* ---------- DOM ---------- */
  _build() {
    this.el.classList.add('coin-story');
    this.el.setAttribute('role', 'img');
    this.el.innerHTML = '';
    this.world = document.createElement('div');
    this.world.className = 'cs-world';
    this.floor = document.createElement('div');
    this.floor.className = 'cs-floor';
    this.world.appendChild(this.floor);
    this.coins = Array.from({ length: this.N }, () => {
      const c = document.createElement('span');
      c.className = 'cs-coin';
      this.world.appendChild(c);
      return c;
    });
    this.star = document.createElement('div');
    this.star.className = 'cs-star';
    this.star.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">
      <defs><radialGradient id="csStarGrad" cx="38%" cy="32%" r="70%">
        <stop offset="0" class="cs-stop1"/><stop offset=".55" class="cs-stop2"/><stop offset="1" class="cs-stop3"/>
      </radialGradient></defs>
      <g class="cs-rays">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
        const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
        return `<line x1="${50 + c * 50}" y1="${50 + s * 50}" x2="${50 + c * 64}" y2="${50 + s * 64}"/>`;
      }).join('')}</g>
      <path class="cs-star-shape" fill="url(#csStarGrad)" d="M50 8 L61.8 35.5 L91.4 37.6 L68.6 56.8 L75.7 85.6 L50 70 L24.3 85.6 L31.4 56.8 L8.6 37.6 L38.2 35.5 Z"/>
    </svg>`;
    this.world.appendChild(this.star);
    this.el.appendChild(this.world);

    const fit = () => { this.world.style.transform = `scale(${this.el.clientWidth / 320})`; };
    fit();
    this._ro = new ResizeObserver(fit);
    this._ro.observe(this.el);
  }

  // chaque monnaie autant de fois, mélangées au hasard (Fisher-Yates)
  _shuffleSymbols() {
    const list = this.opts.symbols;
    const sym = Array.from({ length: this.N }, (_, i) => list[i % list.length]);
    for (let i = sym.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sym[i], sym[j]] = [sym[j], sym[i]];
    }
    this.coins.forEach((c, i) => { c.dataset.sym = sym[i]; });
  }

  /* ---------- Positions ---------- */
  _heapSlots(rnd) {
    const rows = [8, 7, 6, 4, 3, 2], slots = [];
    rows.forEach((n, r) => {
      for (let c = 0; c < n; c++) {
        slots.push({
          x: 160 + (c - (n - 1) / 2) * 28 + (rnd() - 0.5) * 6,
          y: this.G - r * 10 + (rnd() - 0.5) * 3,
          sy: 0.3, r: (rnd() - 0.5) * 8, o: 1, z: r * 20 + c,
        });
      }
    });
    return slots;
  }

  _stacks(defs) {
    const out = [];
    defs.forEach((s) => {
      for (let l = 0; l < s.h; l++) {
        out.push({ x: s.x, y: s.base - l * this.STEP, sy: 0.3, r: 0, o: 1, z: (s.row || 0) * 100 + l });
      }
    });
    return out;
  }

  _scenes() {
    const G = this.G;
    const rainState = (i, t) => {
      const p = this.rain[i];
      if (i >= 14) return null;
      const y = ((p.ph + p.v * t) % 440) - 60;
      return { x: p.x, y, sy: 0.16 + 0.84 * Math.abs(Math.cos(t * p.w + p.ph)), r: p.tilt, o: 1, z: i };
    };

    const heap = this.heap;
    // 5 pièces inclinées (vues de biais, jamais de face) : [rotation, aplatissement]
    const standing = { 9: [-32, 0.5], 13: [28, 0.55], 17: [-18, 0.6], 22: [34, 0.48], 26: [-26, 0.56] };
    const heapFull = heap.map((s, i) => standing[i] !== undefined
      ? { ...s, sy: standing[i][1], r: standing[i][0], y: s.y - 3, z: s.z + 60 }
      : s);

    const piles3 = this._stacks([{ x: 102, base: G, h: 12 }, { x: 160, base: G, h: 10 }, { x: 218, base: G, h: 8 }]);
    // objectif : pyramide de piles de 3 pièces, montée pièce par pièce
    // (4 + 3 + 2 + 1 = 10 piles × 3 = 30 pièces)
    const DX = 46, H = 3, castle = [];
    [4, 3, 2, 1].forEach((n, r) => {
      for (let c = 0; c < n; c++) {
        for (let l = 0; l < H; l++) {
          castle.push({ x: 160 + (c - (n - 1) / 2) * DX, y: G - r * H * this.STEP - l * this.STEP, sy: 0.3, k: 1, r: 0, o: 1, z: r * 10 + l });
        }
      }
    });
    // on prend les pièces par le haut des piles : la plus haute part en premier
    const pick = piles3.map((p, i) => i).sort((a, b) => piles3[a].y - piles3[b].y || piles3[a].x - piles3[b].x);
    const castleOf = [], orderOf = [];
    pick.forEach((coin, k) => {
      castleOf[coin] = k < castle.length ? castle[k] : { ...piles3[coin], o: 0 };
      orderOf[coin] = k < castle.length ? k : 0; // les pièces en trop s'effacent dès le début
    });

    return [
      { dur: 2400, blend: 'fade', state: rainState, floor: 0 },
      { dur: 2400, blend: 'move', arc: 0, floor: 1, state: (i) => {
        return heapFull[i];
      } },
      { dur: 2000, blend: 'move', floor: 1, state: (i) => piles3[i] },
      { dur: 6800, blend: 'move', floor: 1, star: true, starDelay: 3500, stagger: 100, moveDur: 480, arc: 46,
        order: orderOf, state: (i) => castleOf[i] },
    ];
  }

  /* ---------- Rendu ---------- */
  _apply(i, s) {
    const c = this.coins[i];
    const edge = Math.max(0, Math.min(1, (1 - s.sy) / 0.7)) * 12;
    c.style.transform = `translate(${s.x - 22}px, ${s.y - 22}px) rotate(${s.r}deg) scale(${s.k ?? 1}) scaleY(${s.sy})`;
    c.style.opacity = s.o;
    c.style.zIndex = Math.round(s.z);
    c.style.boxShadow = `inset 0 0 0 3px var(--coin-rim, rgba(140,95,10,.35)), 0 ${edge.toFixed(1)}px 0 var(--coin-edge, #9c6f12)`;
    this.cur[i] = s;
  }

  _stateAt(i, t) {
    const sc = this.scenes[this.index], s0 = this.s0[i];
    const target = sc.state(i, t, s0) || { ...s0, o: 0 };
    if (sc.blend === 'fade') {
      // fondu de sortie seulement si des pièces sont visibles (pas au tout premier démarrage)
      const F = this._fadeOut;
      if (t < F) return { ...s0, o: s0.o * (1 - t / F) };
      return { ...target, o: target.o * Math.min(1, (t - F) / 200) };
    }
    if (sc.blend === 'move') {
      const M = sc.moveDur ?? 750, st = sc.stagger ?? 18, rank = sc.order ? sc.order[i] : i;
      const p = Math.max(0, Math.min(1, (t - rank * st) / M));
      if (p >= 1) return target;
      const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
      const L = (a, b) => a + (b - a) * e;
      return {
        x: L(s0.x, target.x), y: L(s0.y, target.y) - Math.sin(Math.PI * e) * (sc.arc ?? 36),
        sy: L(s0.sy, target.sy), k: L(s0.k ?? 1, target.k ?? 1), r: L(s0.r, target.r), o: L(s0.o, target.o),
        z: p > 0 ? 300 + target.z : s0.z,
      };
    }
    return target;
  }

  _frame(now) {
    if (!this.playing) return;
    const dt = Math.min(64, now - (this._last ?? now)) * this.opts.speed;
    this._last = now;
    this.t += dt;
    const sc = this.scenes[this.index];
    // Fin demandée par settle() : l'étape visée est allée au bout de son message.
    if (this._settle && this.index === this._settle.target && this.t >= this._holdOf(sc)) {
      for (let i = 0; i < this.N; i++) this._apply(i, this._stateAt(i, this.t));
      this._endSettle();
      return;
    }
    if (this.t >= sc.dur) {
      if (this.index === this.scenes.length - 1 && !this.opts.loop) {
        this.pause();
        this.el.dispatchEvent(new CustomEvent('coinstory:end'));
        return;
      }
      this.goTo(this.index + 1);
    }
    // nouveau tirage des monnaies à chaque boucle, quand les pièces sont invisibles
    if (this.index === 0 && !this._shuffled && this.t >= this._fadeOut) { this._shuffleSymbols(); this._shuffled = true; }
    for (let i = 0; i < this.N; i++) this._apply(i, this._stateAt(i, this.t));
    this._raf = requestAnimationFrame(this._frame);
  }

  _renderStatic() {
    const end = this.scenes[this.index].dur;
    for (let i = 0; i < this.N; i++) this._apply(i, this._stateAt(i, this.index === 0 ? this.t : end));
  }

  /* ---------- API ---------- */
  goTo(n) {
    const len = this.scenes.length;
    n = ((n % len) + len) % len;
    this.s0 = this.cur.map(s => ({ ...s }));
    this._fadeOut = this.cur.some(s => s.o > 0.01) ? 350 : 0;
    this.index = n;
    this.t = 0;
    this._shuffled = false;
    const sc = this.scenes[n];
    this.floor.style.opacity = sc.floor;
    this.star.style.setProperty('--cs-star-delay', (sc.starDelay ?? 900) + 'ms');
    this.star.classList.toggle('is-on', !!sc.star);
    this.star.classList.toggle('is-off', !sc.star && this.star.classList.contains('is-on-was'));
    this.star.classList.toggle('is-on-was', !!sc.star);
    this.el.setAttribute('aria-label', this.labels[n]);
    this.el.dispatchEvent(new CustomEvent('coinstory:scene', { detail: { index: n, label: this.labels[n] } }));
    if (!this.playing) this._renderStatic();
  }

  /** Moment (ms dans l'étape) où son message est complet : pour l'étape
      finale, l'étoile sortie et qui commence à briller ; sinon, la fin de
      l'étape (les trois piles restent visibles un instant). */
  _holdOf(sc) {
    return sc.star ? (sc.starDelay ?? 900) + CoinStory.STAR_SHOW : sc.dur;
  }

  _endSettle() {
    const { resolve, target, restore } = this._settle;
    this._settle = null;
    if (restore) this.scenes[target] = restore;
    this.pause();
    resolve();
  }

  /** Fin naturelle, pour ne pas couper le message (trier → bâtir → faire
      fructifier) au milieu : l'animation continue jusqu'au bout de l'étape
      suivante, puis se fige. Déjà à la dernière étape (« Objectif atteint »),
      elle va au bout de celle-ci (pyramide montée, étoile sortie), à son
      rythme normal. À l'arrêt (animations réduites), ou étape finale déjà
      au bout, elle se fige tout de suite. Renvoie une promesse résolue une
      fois l'animation figée. */
  settle() {
    if (this._settle) return this._settle.promise;
    const last = this.scenes.length - 1;
    if (!this.playing || (this.index === last && this.t >= this._holdOf(this.scenes[last]))) {
      this.pause();
      return Promise.resolve();
    }
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    // Étape finale en cours : on la termine telle quelle (l'accélérer en route
    // ferait sauter les pièces) ; sinon, l'étape suivante.
    const target = this.index === last ? last : this.index + 1;
    this._settle = { target, resolve, promise };
    // Vers l'étape finale : la page attend déjà, la pyramide se monte plus
    // vite (≈ 1,3 s au lieu de ≈ 3,5 s) et l'étoile sort plus tôt. L'étape
    // d'origine revient une fois l'animation figée.
    const sc = this.scenes[target];
    if (sc.star && target !== this.index) {
      this._settle.restore = sc;
      this.scenes[target] = { ...sc, ...CoinStory.FAST_FINAL };
    }
    return promise;
  }

  next() { this.goTo(this.index + 1); }
  prev() { this.goTo(this.index - 1); }

  play() {
    if (this.playing) return;
    this.playing = true;
    this._last = undefined;
    this._raf = requestAnimationFrame(this._frame);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this._raf);
  }

  restart() { this.goTo(0); this.play(); }

  destroy() {
    if (this._settle) this._endSettle();
    this.pause();
    this._ro.disconnect();
    this.el.innerHTML = '';
  }
}

CoinStory.LABELS = ['Les pièces tombent', 'Un joli tas', 'On organise', 'Objectif atteint'];
// Étape finale arrêtée par settle() : temps laissé à l'étoile après son
// délai (1 s de montée, cs-star-rise dans style.css, puis un début d'éclat).
CoinStory.STAR_SHOW = 1400;
// Étape finale accélérée par settle() : 30 pièces × 35 ms + 300 ms de trajet
// ≈ 1,35 s pour monter la pyramide, puis l'étoile.
CoinStory.FAST_FINAL = { stagger: 35, moveDur: 300, starDelay: 1400 };
window.CoinStory = CoinStory;
