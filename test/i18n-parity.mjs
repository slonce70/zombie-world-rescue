// 🌍 i18n-гейт (v299): статично збирає всі літерали t('…') / t("…") з src/**/*.js та
// index.html і звіряє, що КОЖЕН ключ присутній у словниках en.js і ru.js. Падає зі списком
// пропущених по файлу. Без браузера — миттєвий. Регістр: ключ — перший аргумент-літерал
// (шаблон t('… {x} …', {...}) → ключ = сам літерал; підстановки {x} лишаються в ключі).
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));

// словники (src/i18n/en.js, ru.js) — під Node .js це CJS, тож НЕ імпортуємо, а читаємо
// ключі текстом (як version-sync.mjs). Ключ словника — квотований рядок перед двокрапкою.
const DICT_KEY_RE = /^\s*(['"])((?:\\.|(?!\1).)*?)\1\s*:/gm;
function dictKeys(path) {
  const src = readFileSync(path, 'utf8');
  const set = new Set();
  let m;
  while ((m = DICT_KEY_RE.exec(src)) !== null) set.add(m[2].replace(/\\(['"\\])/g, '$1'));
  return set;
}
const EN = dictKeys(root + 'src/i18n/en.js');
const RU = dictKeys(root + 'src/i18n/ru.js');

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = dir + name;
    const st = statSync(full);
    if (st.isDirectory()) walk(full + '/', out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

// t( '…' | "…" ) — перший рядковий літерал; підтримка екранованих лапок усередині.
const T_RE = /\bt\(\s*(['"])((?:\\.|(?!\1).)*?)\1/g;

// прибираємо коментарі, щоб приклади t('…') у поясненнях не рахувались за ключі.
// Захист від '://' (URL/ws) — лінійний коментар стрипаємо лише коли перед // не двокрапка.
function stripComments(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, ' ')     // HTML-коментарі (index.html)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')     // блокові /* */
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // лінійні //
}

function extractKeys(rawSrc) {
  const src = stripComments(rawSrc);
  const keys = [];
  let m;
  while ((m = T_RE.exec(src)) !== null) {
    // відновлюємо екрановані лапки/бекслеші у справжній ключ (як його бачить t())
    const raw = m[2].replace(/\\(['"\\])/g, '$1');
    keys.push(raw);
  }
  return keys;
}

// index.html статичні тексти теж локалізуються — але НЕ через t(), а через translateHtml()
// (обхід текстових вузлів + атрибути placeholder/title/aria-label; ключ = обрізаний текст).
// Тож меню/категорії/підказки мусять мати запис у словниках, інакше в en/ru лишиться
// українською (саме це бачив користувач). Збираємо кандидати з україномовним текстом.
function htmlTranslatableStrings(html) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const set = new Set();
  const hasUk = (s) => /[А-Яа-яЇїІіЄєҐґ]/.test(s);
  let m;
  const reText = />([^<>]+)</g;
  while ((m = reText.exec(cleaned)) !== null) {
    const s = m[1].replace(/\s+/g, ' ').trim();
    if (s && hasUk(s)) set.add(s);
  }
  const reAttr = /(?:placeholder|title|aria-label)\s*=\s*"([^"]+)"/g;
  while ((m = reAttr.exec(cleaned)) !== null) {
    const s = m[1].trim();
    if (s && hasUk(s)) set.add(s);
  }
  return [...set];
}

const files = walk(root + 'src/', []);
files.push(root + 'index.html');

let missingEn = 0;
let missingRu = 0;
const perFile = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const keys = extractKeys(src);
  // index.html: додаємо статичні translateHtml-рядки (меню/категорії/атрибути)
  if (file.endsWith('index.html')) keys.push(...htmlTranslatableStrings(src));
  const rel = file.slice(root.length);
  const misEn = [];
  const misRu = [];
  for (const k of keys) {
    if (!EN.has(k)) misEn.push(k);
    if (!RU.has(k)) misRu.push(k);
  }
  if (misEn.length || misRu.length) {
    perFile.push({ rel, misEn: [...new Set(misEn)], misRu: [...new Set(misRu)] });
    missingEn += new Set(misEn).size;
    missingRu += new Set(misRu).size;
  }
}

if (perFile.length === 0) {
  console.log('  ✅ i18n-parity: усі ключі t() і статичні тексти index.html присутні в en.js і ru.js');
  process.exit(0);
}

console.log('  ❌ i18n-parity: знайдено пропущені переклади');
for (const f of perFile) {
  console.log(`\n— ${f.rel}`);
  if (f.misEn.length) for (const k of f.misEn) console.log(`    [en] ${JSON.stringify(k)}`);
  if (f.misRu.length) for (const k of f.misRu) console.log(`    [ru] ${JSON.stringify(k)}`);
}
console.log(`\n  Разом: ${missingEn} без en, ${missingRu} без ru`);
process.exit(1);
