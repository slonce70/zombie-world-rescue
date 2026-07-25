// 🏕️🥚 Тижневий квест табору (v299 «Табір кличе»): детермінований від номера тижня
// (той самий _weekIndex(), що й ціль тижня/кооп-тиждень). Прогрес рахується з ЛОКАЛЬНИХ
// подій гравця у БУДЬ-ЯКОМУ режимі (соло І кооп). Нагорода — 🥚 яйце + 🍖×2 корм.
//
// БЕЗ FOMO (червона лінія): квест НЕ згорає. Якщо тиждень змінився, а виконаний квест
// не заклеймлено — нагорода лишається доступною, а НОВИЙ квест стартує лише ПІСЛЯ клейму.
// Невиконаний квест минулого тижня просто замінюється новим без покарання.
//
// Чистий модуль: без DOM/THREE/мережі. Працює на об'єкті save + номер тижня (weekIndex),
// щоб тести могли підмінити тиждень тест-хуком (g._weekIndex = () => N).
import { t } from './i18n.js';

const WEEKLY_CAMP_EGGS = 1;
const WEEKLY_CAMP_FOOD = 2;

// Пул із 3 квестів; вибір за (номер тижня % 3). Числа зважені під ~2-3 дитячі сесії.
// metric — тег локальної події гравця, яким тікає прогрес (див. bumpWeeklyCamp).
export const WEEKLY_CAMP_QUESTS = [
  {
    id: 'elite', metric: 'elite', goal: 15, emoji: '👹',
    title: () => t('Здолай 15 елітних зомбі'),
    desc: () => t('Знаходь золотих елітних зомбі у будь-якому режимі і перемагай їх.'),
  },
  {
    // хлів рятунку = 3 людини, клітка друга = 1 людина; ~4 хліви/друзі за 2-3 сесії
    id: 'rescue', metric: 'rescue', goal: 12, emoji: '🚁',
    title: () => t('Врятуй 12 людей'),
    desc: () => t('Рятуй людей у забігах — кожен врятований наближає нагороду.'),
  },
  {
    id: 'victory', metric: 'victory', goal: 3, emoji: '🏁',
    title: () => t('Переможи у 3 країнах'),
    desc: () => t('Звільняй країни від зомбі — потрібно 3 перемоги.'),
  },
];

export function weeklyCampQuestFor(weekIndex) {
  const n = WEEKLY_CAMP_QUESTS.length;
  const wk = Number.isFinite(weekIndex) ? Math.floor(weekIndex) : 0;
  return WEEKLY_CAMP_QUESTS[((wk % n) + n) % n];
}

function weeklyCampQuestById(id) {
  return WEEKLY_CAMP_QUESTS.find((q) => q.id === id) || null;
}

function freshCamp(weekIndex) {
  const wk = Number.isFinite(weekIndex) ? Math.floor(weekIndex) : 0;
  return { wk, q: weeklyCampQuestFor(wk).id, p: 0, claimed: false };
}

// Приводить поля до безпечних типів. Ретро-безпека: відсутність/сміття → чистий старт.
function sanitizeWeeklyCamp(wc, weekIndex) {
  if (!wc || typeof wc !== 'object') return freshCamp(weekIndex);
  const wk = Number.isFinite(wc.wk) ? Math.floor(wc.wk) : (Number.isFinite(weekIndex) ? Math.floor(weekIndex) : 0);
  const known = weeklyCampQuestById(wc.q);
  // v300: невідомий id квесту (сейв з новішої версії) → чистий старт квесту тижня.
  // Прогрес НЕ переносимо: p чужого квесту робив би підмінений миттєво «виконаним».
  if (!known) return freshCamp(wk);
  return {
    wk,
    q: wc.q,
    p: Number.isFinite(wc.p) ? Math.max(0, Math.floor(wc.p)) : 0,
    claimed: !!wc.claimed,
  };
}

// Приводить save.weeklyCamp до актуального тижня БЕЗ FOMO. Мутує save і повертає об'єкт.
//  - той самий тиждень → без змін;
//  - годинник переведено НАЗАД → фриз (не карати; квест лишається);
//  - тиждень уперед: якщо квест ВИКОНАНО й НЕ взято — лишаємо (нагорода чекає на клейм);
//    інакше — стартуємо новий квест поточного тижня.
export function ensureWeeklyCamp(save, weekIndex) {
  let wc = sanitizeWeeklyCamp(save.weeklyCamp, weekIndex);
  save.weeklyCamp = wc;
  const wk = Number.isFinite(weekIndex) ? Math.floor(weekIndex) : 0;
  if (wc.wk === wk) return wc;
  // v300: сейв «з майбутнього» більш ніж на тиждень (збитий годинник/чужий пристрій) —
  // це сміття, а не фриз: без скидання табір мовчав би, поки реальний час не наздожене.
  if (wc.wk > wk + 1) {
    wc = freshCamp(wk);
    save.weeklyCamp = wc;
    return wc;
  }
  if (wc.wk > wk) return wc; // тиждень уперед у межах толерансу (часовий пояс) — фриз, без покарання
  // тиждень змінився вперед:
  const def = weeklyCampQuestById(wc.q);
  const doneUnclaimed = def && wc.p >= def.goal && !wc.claimed;
  if (doneUnclaimed) return wc; // виконана нагорода не згорає — чекає на клейм
  wc = freshCamp(wk);
  save.weeklyCamp = wc;
  return wc;
}

// Тік прогресу від локальної події гравця. Повертає true, якщо квест САМЕ ЗАРАЗ виконано
// (для банера/чипа-нагадування). Не тікає вже заклеймлений або виконаний квест.
export function bumpWeeklyCamp(save, weekIndex, metric, amount = 1) {
  const wc = ensureWeeklyCamp(save, weekIndex);
  const def = weeklyCampQuestById(wc.q);
  if (!def || def.metric !== metric) return false;
  if (wc.claimed) return false;
  if (wc.p >= def.goal) return false;
  const before = wc.p;
  wc.p = Math.min(def.goal, wc.p + (amount > 0 ? Math.floor(amount) : 0));
  return before < def.goal && wc.p >= def.goal;
}

// Стан для UI (дошка/панель/чип). Не мутує прогрес (лише ленивий ролловер тижня).
export function weeklyCampState(save, weekIndex) {
  const wc = ensureWeeklyCamp(save, weekIndex);
  const def = weeklyCampQuestById(wc.q);
  const goal = def ? def.goal : 0;
  const p = Math.min(goal, wc.p);
  const done = goal > 0 && p >= goal;
  return { def, id: wc.q, wk: wc.wk, p, goal, done, claimed: wc.claimed, claimable: done && !wc.claimed };
}

// true, коли на глобусі треба показати чип-нагадування «📌 Квест табору».
export function weeklyCampReminder(save, weekIndex) {
  return weeklyCampState(save, weekIndex).claimable;
}

// Позначає нагороду взятою і НАРАХОВУЄ 🥚+🍖 у сейв. Повертає {eggs, food} або null.
// Після клейму лениво переходить на новий квест, ЯКЩО тиждень уже змінився (тримали
// стару нагороду) — «новий квест стартує ПІСЛЯ клейму». Церемонію/сейв робить викликач.
export function claimWeeklyCamp(save, weekIndex) {
  const st = weeklyCampState(save, weekIndex);
  if (!st.claimable) return null;
  save.weeklyCamp.claimed = true;
  save.eggs = (save.eggs || 0) + WEEKLY_CAMP_EGGS;
  save.petFood = (save.petFood || 0) + WEEKLY_CAMP_FOOD;
  ensureWeeklyCamp(save, weekIndex); // якщо квест був із минулого тижня — тепер стартує новий
  return { eggs: WEEKLY_CAMP_EGGS, food: WEEKLY_CAMP_FOOD };
}
