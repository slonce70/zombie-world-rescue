// Клавіатура, мишка та pointer lock

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDown = false;
    this.justClicked = false;
    this.rmbDown = false; // права кнопка — оптичний приціл
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.onLockChange = null;
    this.onUserGesture = null;
    // мобільний ввід (заповнює touch.js)
    this.touchMove = { x: 0, z: 0 };
    this.touchSprint = false;
    this.touchScope = false;
    this.touchMode = false;

    window.addEventListener('keydown', (e) => {
      // друкуємо в полі вводу (нік, код кімнати) — гра клавіші не чіпає
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (['Space', 'Tab', 'KeyE'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
      if (this.onUserGesture) this.onUserGesture();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.rmbDown = false;
    });

    dom.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.justClicked = true;
      }
      if (e.button === 2) this.rmbDown = true;
      if (this.onUserGesture) this.onUserGesture();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rmbDown = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.dx += e.movementX || 0;
        this.dy += e.movementY || 0;
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.locked = false;
    });
  }

  request() {
    if (document.pointerLockElement !== this.dom && this.dom.requestPointerLock) {
      try {
        const p = this.dom.requestPointerLock();
        // у нових Chrome повертає Promise — глушимо відмову (headless/швидкий Esc)
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) { /* ignore */ }
    }
  }

  exitLock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }

  consumeMouse() {
    const d = { dx: this.dx, dy: this.dy };
    this.dx = 0; this.dy = 0;
    return d;
  }

  postUpdate() {
    this.justPressed.clear();
    this.justClicked = false;
  }
}
