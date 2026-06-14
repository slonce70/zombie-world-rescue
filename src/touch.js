// Мобільне керування: віртуальний джойстик + огляд свайпом + кнопки
import { WEAPONS } from './player.js';

export function isTouchDevice() {
  return ('ontouchstart' in window && navigator.maxTouchPoints > 0)
    || new URLSearchParams(location.search).has('touch');
}

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.input.touchMode = true;
    this.lookId = null;
    this.lookX = 0;
    this.lookY = 0;
    this.joyId = null;
    this.joyCX = 0;
    this.joyCY = 0;
    this.wheelOpen = false;        // 🔫 чи відкрите колесо зброї
    this._wheelTimer = null;       // таймер довгого утримання
    this._wheelLongPressed = false;// чи спрацювало довге натискання (тоді короткий цикл не робимо)

    this.root = document.getElementById('touch-ui');
    // видимість #touch-ui керується CSS (body.touch-mode.in-level) — лише в бою, не в меню
    document.body.classList.add('touch-mode');
    this.joyBase = document.getElementById('joy-base');
    this.joyKnob = document.getElementById('joy-knob');
    this.wheelEl = document.getElementById('weapon-wheel');
    this.wheelGrid = document.getElementById('weapon-wheel-grid');
    // тап повз іконки (по тлу колеса) — закриває його
    if (this.wheelEl) {
      const closeBg = (e) => {
        if (e.target === this.wheelEl) { e.preventDefault(); e.stopPropagation(); this._closeWheel(); }
      };
      this.wheelEl.addEventListener('touchstart', closeBg, { passive: false });
      this.wheelEl.addEventListener('mousedown', closeBg);
    }

    const canvas = game.renderer.domElement;
    // джойстик і огляд — по половинах екрана, поверх канви
    canvas.addEventListener('touchstart', (e) => this._onStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this._onMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this._onEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', (e) => this._onEnd(e), { passive: false });

    // кнопки
    this._bindButton('tb-fire', () => { this.input.mouseDown = true; this.input.justClicked = true; this._vibe(15); }, () => { this.input.mouseDown = false; });
    this._bindButton('tb-jump', () => this._press('Space'));
    this._bindButton('tb-reload', () => this._press('KeyR'));
    this._bindButton('tb-interact', () => this._press('KeyE'), () => this.input.keys.delete('KeyE'), true);
    this._bindWeaponButton();
    this._bindButton('tb-grenade', () => this._press('KeyG'));
    this._bindButton('tb-camera', () => this._press('KeyV'));
    this._bindButton('tb-dance', () => this._press('KeyN'));
    this._bindButton('tb-scope', () => { this.input.touchScope = !this.input.touchScope; });
    this._bindButton('tb-gadget', () => this._press('KeyF'));
    this._bindButton('tb-shop', () => {
      if (this.game.state === 'level') this.game.shop.toggle();
    });
    this._bindButton('tb-mute', () => {
      const a = this.game.audio;
      a.setMuted(!a.muted);
      this._syncMute();
    });
    this._syncMute();
    this._bindButton('tb-pause', () => {
      const g = this.game;
      if (g.state === 'level' && !g.paused && g.deathT < 0 && !g.victoryShown && !g.shop.isOpen) {
        g.showPause();
      }
    });
  }

  _press(code) {
    this.input.keys.add(code);
    this.input.justPressed.add(code);
    if (this.input.onUserGesture) this.input.onUserGesture();
    // короткі натискання знімаємо самі (E — утримується окремо)
    if (code !== 'KeyE') setTimeout(() => this.input.keys.delete(code), 90);
  }

  _bindButton(id, onDown, onUp = null, hold = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('active');
      this._vibe(8); // тактильний «клік» — дитина відчуває натискання
      onDown();
    }, { passive: false });
    const up = (e) => {
      e.preventDefault();
      el.classList.remove('active');
      if (onUp) onUp();
    };
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    // підтримка миші для тестів
    el.addEventListener('mousedown', (e) => { e.stopPropagation(); el.classList.add('active'); onDown(); });
    el.addEventListener('mouseup', (e) => { e.stopPropagation(); el.classList.remove('active'); if (onUp) onUp(); });
  }

  // 🔫 Кнопка зміни зброї: короткий тап — цикл (KeyQ), довге утримання — колесо зброї
  _bindWeaponButton() {
    const el = document.getElementById('tb-weapon');
    if (!el) return;
    const down = (e) => {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      el.classList.add('active');
      this._vibe(8);
      this._wheelLongPressed = false;
      clearTimeout(this._wheelTimer);
      this._wheelTimer = setTimeout(() => {
        this._wheelLongPressed = true;
        this._vibe(20);
        this._openWheel();
      }, 320);
    };
    const up = (e) => {
      if (e.cancelable) e.preventDefault();
      el.classList.remove('active');
      clearTimeout(this._wheelTimer);
      this._wheelTimer = null;
      // якщо колесо НЕ відкрилось довгим утриманням — це короткий тап → старий цикл зброї
      if (!this._wheelLongPressed) this._press('KeyQ');
      this._wheelLongPressed = false;
    };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    el.addEventListener('mousedown', (e) => { e.stopPropagation(); down(e); });
    el.addEventListener('mouseup', (e) => { e.stopPropagation(); up(e); });
  }

  _openWheel() {
    const player = this.game.level && this.game.level.player;
    if (!player || this.game.state !== 'level') return;
    const grid = this.wheelGrid;
    grid.innerHTML = '';
    for (const id of player.weapons) {
      const w = WEAPONS[id];
      if (!w) continue;
      const btn = document.createElement('button');
      btn.className = 'ww-item' + (id === player.cur ? ' ww-current' : '');
      btn.dataset.weapon = id;
      const am = player.ammo[id];
      let ammoText = '∞';
      if (am && am.reserve !== Infinity) ammoText = (am.mag | 0) + ' / ' + (am.reserve | 0);
      btn.innerHTML = `<span class="ww-icon">${w.icon}</span>`
        + `<span class="ww-name">${w.name}</span>`
        + `<span class="ww-ammo">${ammoText}</span>`;
      const pick = (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        player.switchWeapon(id);
        this._vibe(12);
        this._closeWheel();
      };
      btn.addEventListener('touchstart', pick, { passive: false });
      btn.addEventListener('mousedown', pick);
      grid.appendChild(btn);
    }
    this.wheelOpen = true;
    this.wheelEl.classList.add('show');
    this.wheelEl.setAttribute('aria-hidden', 'false');
    // поки колесо відкрите — зупиняємо рух/огляд
    this.input.touchMove.x = 0;
    this.input.touchMove.z = 0;
    this.input.touchSprint = false;
  }

  _closeWheel() {
    this.wheelOpen = false;
    if (this.wheelEl) {
      this.wheelEl.classList.remove('show');
      this.wheelEl.setAttribute('aria-hidden', 'true');
    }
  }

  _onStart(e) {
    if (this.wheelOpen) { e.preventDefault(); return; } // тапи йдуть у колесо, не в канву
    if (this.game.state !== 'level') return;
    e.preventDefault();
    if (this.input.onUserGesture) this.input.onUserGesture();
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && this.joyId === null) {
        this.joyId = t.identifier;
        this.joyCX = t.clientX;
        this.joyCY = t.clientY;
        this.joyBase.style.display = 'block';
        this.joyBase.style.left = (t.clientX - 60) + 'px';
        this.joyBase.style.top = (t.clientY - 60) + 'px';
        this._setKnob(0, 0);
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lookX = t.clientX;
        this.lookY = t.clientY;
      }
    }
  }

  _onMove(e) {
    if (this.wheelOpen) { e.preventDefault(); return; }
    if (this.game.state !== 'level') return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joyId) {
        const dx = t.clientX - this.joyCX;
        const dy = t.clientY - this.joyCY;
        const d = Math.hypot(dx, dy);
        const max = 55;
        const k = d > max ? max / d : 1;
        this._setKnob(dx * k, dy * k);
        const nx = (dx * k) / max;
        const ny = (dy * k) / max;
        this.input.touchMove.x = nx;
        this.input.touchMove.z = ny;
        this.input.touchSprint = d > max * 0.92;
      } else if (t.identifier === this.lookId) {
        this.input.dx += (t.clientX - this.lookX) * 2.4;
        this.input.dy += (t.clientY - this.lookY) * 2.4;
        this.lookX = t.clientX;
        this.lookY = t.clientY;
      }
    }
  }

  _onEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.joyId) {
        this.joyId = null;
        this.input.touchMove.x = 0;
        this.input.touchMove.z = 0;
        this.input.touchSprint = false;
        this.joyBase.style.display = 'none';
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
      }
    }
  }

  _setKnob(dx, dy) {
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // тактильний відгук (вібро) — лише якщо пристрій підтримує і звук не вимкнено
  _vibe(ms) {
    if (this.game.audio && this.game.audio.muted) return;
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }
  }

  // іконка кнопки звуку віддзеркалює стан mute
  _syncMute() {
    const el = document.getElementById('tb-mute');
    if (el) el.textContent = (this.game.audio && this.game.audio.muted) ? '🔇' : '🔊';
  }
}
