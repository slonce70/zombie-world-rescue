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

export function cleanNickSrv(raw) {
  let s = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > 12) s = s.slice(0, 12);
  if (!s || nickIsBad(s)) return 'Гравець';
  return s;
}
