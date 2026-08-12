// 🎒 Загін: врятований друг іде в бій разом із гравцем.
// Чистий модуль без DOM, THREE і мережі — рантайм живе в extras.js, вибір у hqbase.js.
//
// Червона лінія (як у friends.js): напарник не помирає назавжди — падає і встає
// через 20 секунд, без штрафів і FOMO.
//
// v770: соло-замок знято, Загін працює й у коопі. Напарників ГОСТЯ веде хост —
// зомбі й шкода авторитарні саме там, тож локальний напарник гостя або не завдавав
// би шкоди взагалі, або вимагав би окремого каналу шкоди гість→хост. Гість лише
// оголошує склад при вході (`sanitizeSquadNet` нижче), решту робить хост.
import { t } from './i18n.js';
import { FRIENDS, rescuedFriendIds } from './friends.js';

export const SQUAD_ARCHETYPES = Object.freeze({
  heal: Object.freeze({
    icon: '🩹', name: () => t('Лікує'), radius: 4, healPerSec: 5,
  }),
  // пасивна: у радіусі SQUAD_LURE_RADIUS зомбі обирають ціллю напарника, а не гравця
  lure: Object.freeze({
    icon: '🎈', name: () => t('Відволікає'), radius: 8,
  }),
  fighter: Object.freeze({
    icon: '🔨', name: () => t("Б'ється"), damage: 10,
  }),
});

// у цьому радіусі напарник-приманка перехоплює увагу зомбі (zombies.js)
export const SQUAD_LURE_RADIUS = 8;
export const SQUAD_MAX_HP = 60;
export const SQUAD_DOWN_SECS = 20;
export const SQUAD_FOLLOW_DIST = 3;
// далі за це напарник кидає зомбі й повертається до гравця
export const SQUAD_LEASH_DIST = 16;

// 1 слот з першого врятованого друга, 2 — з шести
export function squadSlots(save) {
  const n = rescuedFriendIds(save).length;
  return n >= 6 ? 2 : n >= 1 ? 1 : 0;
}

export function squadArchetype(countryId) {
  const friend = FRIENDS[countryId];
  return (friend && SQUAD_ARCHETYPES[friend.squad]) ? friend.squad : null;
}

// Тільки врятовані друзі, без дублів, не більше за поточні слоти.
export function sanitizeSquad(save) {
  const rescued = new Set(rescuedFriendIds(save));
  const raw = Array.isArray(save && save.squad) ? save.squad : [];
  const clean = [];
  for (const id of raw) {
    if (typeof id !== 'string' || clean.includes(id)) continue;
    if (!rescued.has(id) || !squadArchetype(id)) continue;
    clean.push(id);
  }
  return clean.slice(0, squadSlots(save));
}

// 🌐 Стеля складу в мережі: та сама двійка, що й максимум слотів у соло (squadSlots).
export const SQUAD_NET_MAX = 2;

// 🤝 Оголошення складу Загону гостем (PROTO 27). ЧИСТА функція: ні сейва, ні DOM.
//
// ⚠️ МЕЖА ДОВІРИ, і вона тут навмисна — та сама, що в `sanitizeHypers` (net/coop.js).
// Сейв гостя живе у гостя, тож хост перевіряє ФОРМУ (чи існує такий друг і чи має він
// архетип), а не ВОЛОДІННЯ (чи справді гість його врятував і чи відкрив другий слот).
// Тому це НЕ `sanitizeSquad(save)`: та читає врятованих із сейва ГРАВЦЯ і лишається
// для соло. Ціна брехні — щонайбільше чужий напарник у дитячій кімнаті, з тими самими
// авторитарними в хоста лікуванням/шкодою; ціна недовіри — чесний гість не бачить
// свого друга взагалі.
export function sanitizeSquadNet(ids) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  for (const id of ids) {
    if (typeof id !== 'string' || out.includes(id) || !squadArchetype(id)) continue;
    out.push(id);
    if (out.length >= SQUAD_NET_MAX) break;
  }
  return out;
}

// Перемикач «йде зі мною / лишається в таборі». Повертає НОВИЙ масив.
export function toggleSquadMember(save, countryId) {
  const current = sanitizeSquad(save);
  if (current.includes(countryId)) return current.filter((id) => id !== countryId);
  const rescued = new Set(rescuedFriendIds(save));
  if (!rescued.has(countryId) || !squadArchetype(countryId)) return current;
  const slots = squadSlots(save);
  if (!slots) return current;
  // слоти заповнені — найстаріший поступається місцем, щоб клік завжди щось робив
  return [...current, countryId].slice(-slots);
}
