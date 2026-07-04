const t = (key) => key;

const STORY_COUNTRY_IDS = ['UKR', 'POL', 'EGY'];

const STORIES = {
  UKR: {
    id: 'UKR',
    title: () => t('Село Сонячне'),
    npc: {
      id: 'ukr-medic',
      kind: 'medic',
      site: 'village',
      name: () => t('Медик Олена'),
      intro: () => t('Село тримається, але людям потрібен герой. Почни з порятунку біля хліва.'),
    },
    objectives: [
      {
        id: 'ukr-rescue',
        kind: 'rescue',
        icon: '🆘',
        site: 'barn',
        title: () => t('Врятуй людей із хліва'),
        start: () => t('Люди сховалися в хліві. Відкрий двері й виведи їх.'),
        done: () => t('Люди врятовані. Медик допоможе біля села.'),
        reward: 90,
        horde: 10,
      },
      {
        id: 'ukr-signal',
        kind: 'hold',
        icon: '📡',
        site: 'tower',
        title: () => t('Віднови сигнал села'),
        prompt: () => t('Тримай E — запусти сигнал'),
        start: () => t('Без сигналу інші рятівники не знайдуть село.'),
        done: () => t('Сигнал пішов! Тепер захисти площу.'),
        hold: 2.4,
        reward: 110,
        horde: 14,
      },
      {
        id: 'ukr-defense',
        kind: 'defense',
        icon: '🛡️',
        site: 'village',
        title: () => t('Оборони сільську площу'),
        start: () => t('Зомбі почули сигнал. Тримай площу до кінця атаки.'),
        done: () => t('Село в безпеці. Арена боса відкрита.'),
        seconds: 22,
        reward: 130,
        horde: 0,
      },
    ],
  },
  POL: {
    id: 'POL',
    title: () => t('Крижане депо'),
    npc: {
      id: 'pol-keeper',
      kind: 'granny',
      site: 'townSquare',
      name: () => t('Доглядачка депо'),
      intro: () => t('Місто замерзає, а поїзд стоїть. Запали вогнища й відкрий шлях до депо.'),
    },
    objectives: [
      {
        id: 'pol-bonfires',
        kind: 'activate',
        icon: '🔥',
        site: 'bonfires',
        title: () => t('Запали 3 вогнища'),
        prompt: () => t('Тримай E — запали вогнище'),
        start: () => t('Без тепла люди не дійдуть до евакуації.'),
        done: () => t('Вогнища горять. Тепер запускай поїзд.'),
        count: 3,
        hold: 1.8,
        reward: 110,
        horde: 10,
      },
      {
        id: 'pol-train',
        kind: 'hold',
        icon: '🚂',
        site: 'railDepot',
        title: () => t('Запусти рятувальний поїзд'),
        prompt: () => t('Тримай E — заведи поїзд'),
        start: () => t('Депо поруч. Якщо поїзд рушить, люди матимуть шанс.'),
        done: () => t('Поїзд готовий. Але біля замку засідка.'),
        hold: 2.8,
        reward: 130,
        horde: 16,
      },
      {
        id: 'pol-castle',
        kind: 'survive',
        icon: '🏰',
        site: 'castleRuin',
        title: () => t('Зачисть засідку в руїнах'),
        start: () => t('Зомбі перекрили шлях біля замку. Вибий їх.'),
        done: () => t('Шлях відкритий. Бос чекає на арені.'),
        count: 8,
        reward: 150,
        horde: 0,
      },
    ],
  },
  EGY: {
    id: 'EGY',
    title: () => t('Таємниця піраміди'),
    npc: {
      id: 'egy-guide',
      kind: 'kid',
      site: 'oasis',
      name: () => t('Юний археолог'),
      intro: () => t('Печатки гробниці зламані. Знайди їх біля сфінкса й піраміди, поки фараон не прокинувся.'),
    },
    objectives: [
      {
        id: 'egy-seals',
        kind: 'fetch',
        icon: '🪬',
        site: 'seals',
        deliverSite: 'tombDoor',
        title: () => t('Знайди 2 печатки гробниці'),
        prompt: () => t('Натисни E — взяти печатку'),
        deliverPrompt: () => t('Тримай E — встав печатки у двері'),
        start: () => t('Перша печатка біля сфінкса, друга на шляху до піраміди.'),
        done: () => t('Двері відкрились. Мумії вже поруч!'),
        count: 2,
        hold: 2.4,
        reward: 140,
        horde: 12,
      },
      {
        id: 'egy-ambush',
        kind: 'survive',
        icon: '⚱️',
        site: 'tombDoor',
        title: () => t('Переживи напад мумій'),
        start: () => t('Гробниця прокинулась. Не дай муміям вийти назовні.'),
        done: () => t('Прокляття ослабло. Фараон вийде на бій.'),
        count: 10,
        reward: 160,
        horde: 0,
        zombieTypes: ['mummy', 'walker', 'runner'],
      },
    ],
  },
};

function getCountryStory(countryId) {
  return STORIES[countryId] || null;
}

function storyPreview(countryId) {
  const story = getCountryStory(countryId);
  return story ? story.objectives.map((o) => o.icon) : null;
}

function shouldUseStoryMissions({ countryId, modeId, isGuest, isCoop, isPlayground }) {
  return modeId === 'campaign'
    && !isGuest
    && !isCoop
    && !isPlayground
    && !!getCountryStory(countryId);
}

exports.STORY_COUNTRY_IDS = STORY_COUNTRY_IDS;
exports.getCountryStory = getCountryStory;
exports.storyPreview = storyPreview;
exports.shouldUseStoryMissions = shouldUseStoryMissions;
