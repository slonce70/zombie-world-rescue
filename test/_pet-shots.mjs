// Контактний аркуш усіх улюбленців в одному PNG (для візуальної перевірки деталізації).
// node test/_pet-shots.mjs  → shots/pets-sheet.png
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 960 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

await page.evaluate(async () => {
  const THREE = await import('three');
  const { PETS } = await import('/src/characters.js');
  const ids = Object.keys(PETS);
  const COLS = 4, CELL = 300, ROWS = Math.ceil(ids.length / COLS);
  const W = COLS * CELL, H = ROWS * CELL;

  const gl = document.createElement('canvas'); gl.width = W; gl.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true });
  renderer.setSize(W, H, false);
  renderer.setScissorTest(true);
  const bg = [0xbfe3ff, 0xffe0c2, 0xd7f0c8, 0xf0d2ff];

  ids.forEach((id, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = col * CELL, y = H - (row + 1) * CELL; // WebGL y знизу-вгору
    renderer.setViewport(x, y, CELL, CELL);
    renderer.setScissor(x, y, CELL, CELL);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bg[i % bg.length]);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.15));
    const d = new THREE.DirectionalLight(0xffffff, 0.85); d.position.set(2, 4, 1.5); scene.add(d);
    const pet = PETS[id].make();
    pet.group.rotation.y = 0.5; // легкий 3/4 ракурс
    scene.add(pet.group);
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    cam.position.set(1.15, 0.75, -1.55); // -z бік = перед моделі (вони дивляться у -Z)
    cam.lookAt(0, 0.32, 0);
    renderer.render(scene, cam);
  });

  // підписуємо клітинки на 2D-полотні поверх рендера
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  out.id = 'petsheet'; out.style.cssText = 'position:fixed;left:0;top:0;z-index:99999';
  const ctx = out.getContext('2d');
  ctx.drawImage(gl, 0, 0);
  ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
  ids.forEach((id, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const cx = col * CELL + CELL / 2, cy = row * CELL + 28;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(col * CELL, row * CELL, CELL, 36);
    ctx.fillStyle = '#fff'; ctx.fillText(`${PETS[id].icon} ${id}`, cx, cy);
  });
  document.body.appendChild(out);
});

await page.locator('#petsheet').screenshot({ path: 'shots/pets-sheet.png' });
console.log('🐾 shots/pets-sheet.png готовий');
await browser.close();
