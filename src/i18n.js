// 🌍 Локалізація: КЛЮЧ СЛОВНИКА = український рядок (він і є типова мова).
// Перекладаються лише en/ru у src/i18n/en.js та src/i18n/ru.js.
// Зміна мови — перезавантаження сторінки: всі дані (магазин, скіни, місії)
// будуються при завантаженні модулів уже потрібною мовою.
import { EN } from './i18n/en.js';
import { RU } from './i18n/ru.js';

const DICTS = { en: EN, ru: RU };
export const LANGS = ['uk', 'en', 'ru'];
export const LANG_NAMES = { uk: 'Українська', en: 'English', ru: 'Русский' };

function detectLang() {
  const params = new URLSearchParams(location.search);
  // явний вибір через URL — найсильніший (для тестів і шерингу)
  const p = params.get('lang');
  if (p && LANGS.includes(p)) return p;
  try {
    const saved = localStorage.getItem('zr-lang');
    if (saved && LANGS.includes(saved)) return saved;
  } catch (e) { /* ignore */ }
  // тестовий режим без явного вибору — українська: тести написані нею
  if (params.has('test')) return 'uk';
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('ru')) return 'ru';
  if (nav.startsWith('uk')) return 'uk';
  if (nav.startsWith('en')) return 'en';
  return 'uk';
}

let lang = detectLang();

export function getLang() { return lang; }

export function setLang(l) {
  if (!LANGS.includes(l)) return;
  try { localStorage.setItem('zr-lang', l); } catch (e) { /* ignore */ }
  location.reload();
}

// 📱 Чи зараз сенсорне керування (телефон/планшет або ?touch).
// Читаємо ЖИВИЙ стан гри, бо словники й описи будуються при завантаженні
// модулів, коли input ще не існує — тому перевірка має бути у момент показу.
export function isTouchUI() {
  try {
    if (window.__game && window.__game.input) return !!window.__game.input.touchMode;
  } catch (e) { /* ignore */ }
  try {
    return document.body && document.body.classList.contains('touch-mode');
  } catch (e) { /* ignore */ }
  return false;
}

// 🎮 Підказка, що залежить від керування:
// на сенсорі показуємо екранну кнопку/жест, на ПК — назву клавіші.
// Обидва тексти проганяємо через t(), щоб переклад працював.
// keyHint('тягни джойстик до краю', 'Shift') → потрібний варіант уже перекладений.
export function keyHint(touchText, keyText, params) {
  return t(isTouchUI() ? touchText : keyText, params);
}

// t('Привіт, {name}!', {name}) → переклад за активною мовою + підстановка
export function t(key, params) {
  let s = key;
  if (lang !== 'uk') {
    const d = DICTS[lang];
    if (d && d[key] !== undefined) s = d[key];
  }
  if (params) {
    for (const k in params) s = s.split('{' + k + '}').join(params[k]);
  }
  return s;
}

// статичний HTML: обходимо текстові вузли і атрибути, перекладаємо за словником.
// Ключ — повний текст вузла без зайвих пробілів (так HTML лишається україномовним джерелом)
export function translateHtml(root = document.body) {
  if (lang === 'uk') return;
  const dict = DICTS[lang];
  if (!dict) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const raw = n.nodeValue;
    const key = raw.trim();
    if (!key || dict[key] === undefined) continue;
    n.nodeValue = raw.replace(key, dict[key]);
  }
  for (const el of root.querySelectorAll('[placeholder], [title]')) {
    for (const attr of ['placeholder', 'title']) {
      const v = el.getAttribute(attr);
      if (v && dict[v] !== undefined) el.setAttribute(attr, dict[v]);
    }
  }
}
