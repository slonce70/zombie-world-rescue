// 🧼 Спільний фільтр ніків: ніки видно ВСЬОМУ світу (Ліга, Лобі), аудиторія
// дитяча — лайку ріжемо на сервері. Використовується і Cloudflare-воркером
// (wrangler бандлить цей файл), і dev-relay.
// Нормалізуємо типові підміни символів і шукаємо корені поганих слів.
export const BAD_ROOTS = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigg', 'whore', 'slut', 'dick', 'penis', 'porn',
  'hui', 'huy', 'xyi', 'pizd', 'blya', 'suka', 'mudak', 'pidor', 'pidar', 'pidr',
  'gandon', 'gondon', 'zalupa', 'eblan', 'dolboeb', 'nahui', 'ebat',
  'хуй', 'хуя', 'хуе', 'хуі', 'пизд', 'пізд', 'бля', 'сука', 'мудак', 'мудил',
  'підор', 'пидор', 'підар', 'пидар', 'гандон', 'гондон', 'залупа', 'шлюха',
  'говн', 'дерьм', 'ебат', 'ебал', 'ебан', 'ебл', 'уеб', 'наеб', 'заеб', 'йоб', 'нігер', 'нигер',
];

export function nickIsBad(s) {
  const flat = s.toLowerCase()
    .replace(/[@4]/g, 'a').replace(/0/g, 'o').replace(/3/g, 'e').replace(/[1!|]/g, 'i')
    .replace(/[$5]/g, 's').replace(/ё/g, 'е').replace(/[^a-zа-яіїєґ]/g, '');
  return BAD_ROOTS.some((w) => flat.includes(w));
}

// Єдина нормалізація сирого ніка для клієнта І сервера: контрольні символи,
// зайві пробіли, стеля 12. Клієнтський cleanNick (src/net/coop.js) і серверний
// cleanNickSrv нижче — тонкі обгортки над нею, щоб правила не розійшлися.
export function normNick(raw) {
  let s = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > 12) s = s.slice(0, 12);
  return s;
}

export function cleanNickSrv(raw) {
  const s = normNick(raw);
  if (!s || nickIsBad(s)) return 'Гравець';
  return s;
}

// 🌍 Код країни кімнати видно всьому лобі: лише латиниця 2–4 великих літер
// і без коренів лайки (СУКА/FUCK/XYI влазять у 4 літери) — інакше 'UKR'.
export function cleanCountrySrv(raw) {
  const c = String(raw || '').toUpperCase().slice(0, 4);
  if (!/^[A-Z]{2,4}$/.test(c) || nickIsBad(c)) return 'UKR';
  return c;
}

// 🏅 Титул профілю видно всьому лобі — фільтруємо як нік (мат → порожньо,
// клієнт просто не покаже бейдж), плюс зріз HTML і стеля 24.
export function cleanTitleSrv(raw) {
  const s = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/<[^>]*>/g, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!s || nickIsBad(s)) return '';
  return s;
}
