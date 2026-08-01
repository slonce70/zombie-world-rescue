// 🎖️ Пасивки країн: шість країн середини кампанії (Іспанія, Португалія, Італія,
// Швеція, Японія, Китай) давали лише монети — а монети на цьому місці вже нічого
// не вирішують, бо вся постійна прокачка викуплена. Тепер кожна з них дарує ще й
// невелику ПОСТІЙНУ силу у своєму дусі. Монетна нагорода лишається.
//
// Чистий модуль без DOM, THREE і мережі — як season.js, rotation.js, stars.js.
//
// Пасивка ВИВОДИТЬСЯ зі списку звільнених країн (`save.liberated`), а не зберігається
// окремим полем сейва. Тому гравець, який пройшов ці країни ДО оновлення, отримує свої
// сили одразу — жодної міграції сейва не треба, і подвійного обліку не з'являється.
//
// Кожна пасивка лягає в ТЕ САМЕ поле гравця, що й апгрейд магазину (maxHealth, maxArmor,
// speedMult, damageMult, helmetMult, healMult), тож другої паралельної системи немає.
//
// ⚖️ Сила: шість пасивок разом ≈ 2.4 покупки з 14 у гілках «Прокачування» + «Спорядження»
// (≈ 370 монет із 2100). Це приємна дрібниця за країну, а не другий комплект апгрейдів.
//
// Мапа «країна → пасивка» живе ТУТ і лише тут (поле `country`): якби countries.js теж
// тримав посилання, дві таблиці рано чи пізно розійшлися б.
import { t } from './i18n.js';
import { hasLiberated } from './net/cloudsave.js';

// stat — поле набору модифікаторів; рівно одне з `add` (доданок) або `mul` (множник).
export const COUNTRY_POWERS = [
  {
    id: 'toro', country: 'ESP', icon: '🐂', stat: 'speedMult', mul: 1.04,
    name: () => t('Порив кориди'),
    desc: () => t('+4% до швидкості бігу'),
  },
  {
    id: 'atlantic', country: 'PRT', icon: '🌊', stat: 'healMult', mul: 1.12,
    name: () => t('Атлантичний бриз'),
    desc: () => t('+12% до лікування'),
  },
  {
    id: 'gladiator', country: 'ITA', icon: '🛡️', stat: 'maxArmor', add: 25,
    name: () => t('Щит гладіатора'),
    desc: () => t('+25 максимальної броні'),
  },
  {
    id: 'northwind', country: 'SWE', icon: '❄️', stat: 'damageTakenMult', mul: 0.95,
    name: () => t('Північний гарт'),
    desc: () => t('-5% усієї вхідної шкоди'),
  },
  {
    id: 'samurai', country: 'JPN', icon: '🗡️', stat: 'damageMult', mul: 1.05,
    name: () => t('Клинок самурая'),
    desc: () => t('+5% до шкоди'),
  },
  {
    id: 'greatwall', country: 'CHN', icon: '🏯', stat: 'maxHealth', add: 20,
    name: () => t('Велика стіна'),
    desc: () => t('+20 макс. здоров’я'),
  },
];

// Нейтральний набір: рівно те, що має гравець без жодної звільненої країни.
export const neutralCountryMods = () => ({
  maxHealth: 0,        // доданок до максимального здоров'я
  maxArmor: 0,         // доданок до максимальної броні
  speedMult: 1,        // множник швидкості (як апгрейд «Швидкість»)
  damageMult: 1,       // множник шкоди (як апгрейд «Шкода»)
  damageTakenMult: 1,  // множник ВХІДНОЇ шкоди (як шолом: менше — краще)
  healMult: 1,         // множник лікування
});

export const countryPower = (countryId) => COUNTRY_POWERS.find((p) => p.country === countryId) || null;

// Пасивки, зароблені цим сейвом. Порядок — кампанійний (ESP → CHN).
// Невідомі/сміттєві ключі `liberated` просто не мають пасивки й ігноруються.
export function earnedCountryPowers(liberated) {
  return COUNTRY_POWERS.filter((p) => hasLiberated(liberated, p.country));
}

// Набір модифікаторів для гравця. Застосовує main.js/shop.js у тих самих місцях,
// де вже застосовуються куплені апгрейди.
export function countryPowerMods(liberated) {
  const mods = neutralCountryMods();
  for (const p of earnedCountryPowers(liberated)) {
    if (typeof p.add === 'number') mods[p.stat] += p.add;
    else mods[p.stat] *= p.mul;
  }
  return mods;
}

// Дані для екрана: уся таблиця з прапорцем «зароблено» — щоб UI показував і те,
// що вже є, і те, за яку країну лишилось.
export function countryPowerCards(liberated) {
  return COUNTRY_POWERS.map((p) => ({ ...p, earned: hasLiberated(liberated, p.country) }));
}
