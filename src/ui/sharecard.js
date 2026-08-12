// 🖼️ Листівка: кадр гри + рамка + підписи → PNG 1080×1080 (влазить і в сторіс, і в чат).
// Малюється ПОВНІСТЮ на клієнті — жодних зовнішніх сервісів і мережевих запитів.
// Текст і малювання розділені навмисно: тут лише композиція, а хто саме хвалиться
// (перемога в країні / запрошення в кімнату) вирішує викликач через готові рядки.
import { t } from '../i18n.js';
import { shareImageFile } from './share.js';

export const CARD = 1080;
const FONT = "'Nunito', 'Segoe UI', system-ui, -apple-system, sans-serif";
const GOLD = '#ffd23f';

// ⏱️ M:SS — той самий формат, що на екрані перемоги
export function fmtTime(sec) {
  const total = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ✂️ довгий нік не має розсунути підпис — ріжемо з «…». Порожній нік → «Рятівник».
export function trimNick(raw, max = 14) {
  const s = String(raw || '').trim();
  if (!s) return t('Рятівник');
  return [...s].length > max ? [...s].slice(0, max - 1).join('') + '…' : s;
}

// 🧮 рядки листівки перемоги — чиста функція, тому вся композиція тестується без канваса
export function victoryCardText({ flag, country, nick, timeSec, stars, starMax = 3, kills }) {
  const got = Math.max(0, Math.min(starMax, stars | 0));
  return {
    flag: flag || '🏆',
    headline: String(country || '').toUpperCase(),
    sub: t('ЗВІЛЬНЕНО!'),
    stars: '⭐'.repeat(got) + '☆'.repeat(starMax - got),
    meta: `${trimNick(nick)} · ⏱ ${fmtTime(timeSec)} · 🧟 ${kills | 0}`,
    brand: t('Операція: Порятунок Світу'),
  };
}

// 📸 Знімок кадру. renderer.render() і drawImage у ОДНОМУ таску — WebGL-буфер ще живий,
// тож preserveDrawingBuffer не потрібен. Викликати РІВНО ОДИН раз у момент перемоги:
// це один зайвий рендер і один блит на GPU, без PNG-кодування (воно аж на тапі кнопки).
export function captureFrame(renderer, scene, camera) {
  try {
    if (!renderer || !scene || !camera) return null;
    renderer.render(scene, camera);
    const src = renderer.domElement;
    const side = Math.min(src.width, src.height);
    if (!(side > 0)) return null;
    const c = document.createElement('canvas');
    c.width = c.height = CARD;
    // центральний квадрат кадру — гравець завжди в центрі екрана
    c.getContext('2d').drawImage(src, (src.width - side) / 2, (src.height - side) / 2,
      side, side, 0, 0, CARD, CARD);
    return c;
  } catch (e) {
    return null; // WebGL міг загубити контекст — листівка не критична
  }
}

// підбираємо кегль, доки рядок не влізе в ширину (довгі назви країн і ніки)
function fit(g, text, px, max, weight) {
  let size = px;
  g.font = `${weight} ${size}px ${FONT}`;
  while (size > 22 && g.measureText(text).width > max) {
    size -= 4;
    g.font = `${weight} ${size}px ${FONT}`;
  }
  return size;
}

function line(g, text, y, px, color, weight = '800') {
  if (!text) return;
  fit(g, text, px, CARD - 140, weight);
  g.fillStyle = color;
  g.fillText(text, CARD / 2, y);
}

// 🎨 Малює листівку. `frame` — канвас-знімок (може бути null: тоді просто градієнт).
export function drawCard({ frame, flag, headline, sub, stars, meta, brand }) {
  const c = document.createElement('canvas');
  c.width = c.height = CARD;
  const g = c.getContext('2d');
  if (frame) {
    g.drawImage(frame, 0, 0, CARD, CARD);
  } else {
    const bg = g.createLinearGradient(0, 0, 0, CARD);
    bg.addColorStop(0, '#1b2a4a');
    bg.addColorStop(1, '#0a1020');
    g.fillStyle = bg;
    g.fillRect(0, 0, CARD, CARD);
  }
  // затемнення згори і знизу — текст мусить читатись на будь-якому кадрі
  const top = g.createLinearGradient(0, 0, 0, 430);
  top.addColorStop(0, 'rgba(6,10,22,0.88)');
  top.addColorStop(1, 'rgba(6,10,22,0)');
  g.fillStyle = top;
  g.fillRect(0, 0, CARD, 430);
  const bot = g.createLinearGradient(0, CARD, 0, CARD - 430);
  bot.addColorStop(0, 'rgba(6,10,22,0.92)');
  bot.addColorStop(1, 'rgba(6,10,22,0)');
  g.fillStyle = bot;
  g.fillRect(0, CARD - 430, CARD, 430);
  // рамка
  g.lineWidth = 14;
  g.strokeStyle = GOLD;
  g.strokeRect(26, 26, CARD - 52, CARD - 52);

  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.shadowColor = 'rgba(0,0,0,0.8)';
  g.shadowBlur = 18;
  line(g, flag, 178, 132, '#ffffff');
  line(g, headline, 300, 104, GOLD);          // назва країни — найбільша, читається мініатюрою
  line(g, sub, 372, 50, '#cfe6ff', '700');
  line(g, stars, 838, 92, '#ffffff', '700');
  line(g, meta, 936, 48, '#ffffff', '700');
  line(g, brand, 1012, 34, 'rgba(255,255,255,0.75)', '600');
  g.shadowBlur = 0;
  return c;
}

function cardBlob(canvas) {
  return new Promise((resolve) => {
    try { canvas.toBlob(resolve, 'image/png'); } catch (e) { resolve(null); }
  });
}

// 📤 Намалювати й віддати: navigator.share({files}) → фолбек «завантажити файл» (у share.js).
// `card` — те саме, що приймає drawCard, плюс filename/text.
export async function shareCard(game, card) {
  if (!card) return 'failed';
  const blob = await cardBlob(drawCard(card));
  return shareImageFile(game, blob, { filename: card.filename, text: card.text });
}
