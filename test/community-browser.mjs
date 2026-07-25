// 🏘️ v700: повний браузерний цикл операцій спільноти проти живого dev-relay.
// Перевірка → публікація → каталог → чужий гравець → проходження → реакція →
// нагорода тижня → точне посилання. Кожен крок б'є по реальному API.
import { openBrowserTest, makeCheck, waitForPage } from './_browser.mjs';
import { spawnRelay } from './_relay.mjs';

const RELAY_PORT = 8779;
const relay = await spawnRelay(RELAY_PORT);
const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);
const URL_BASE = `${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`;

const MAP = {
  biome: 'summer',
  objects: [
    { type: 'task', quest: 'rescue', x: -60, z: -60, ry: 0 },
    { type: 'tree', x: 20, z: -60, ry: 0 },
    { type: 'house', x: -20, z: 30, ry: 0 },
  ],
};

async function beatCurrentMap() {
  await page.evaluate(() => {
    const g = window.__game;
    const mode = g.level.customMap;
    const task = mode.tasks[0];
    g.level.player.pos.set(task.action.x, g.level.player.pos.y, task.action.z);
    g.input.justPressed.add('KeyE');
    mode.update(0.1, g.input, true);
    g.input.justPressed.clear();
  });
  return waitForPage(page, () => document.getElementById('overlay-community-result').classList.contains('show'),
    15000, 'екран результату');
}

await page.goto(URL_BASE, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });

// ---------- каталог: порожній стан і доступність ----------
await page.evaluate(() => window.__game.community.open('new'));
await waitForPage(page, () => window.__game.community.state !== 'loading', 15000, 'завантаження каталогу');
const emptyState = await page.evaluate(() => {
  const overlay = document.getElementById('overlay-community');
  const status = document.getElementById('community-status');
  return {
    state: window.__game.community.state,
    shown: overlay.classList.contains('show'),
    hidden: overlay.getAttribute('aria-hidden'),
    modal: overlay.getAttribute('aria-modal'),
    live: status.getAttribute('aria-live'),
    text: status.textContent,
    focused: document.activeElement?.id,
    tabSelected: document.querySelector('[data-community-tab="new"]').getAttribute('aria-selected'),
    items: document.querySelectorAll('#community-list .community-item').length,
  };
});
check(emptyState.state === 'empty' && emptyState.items === 0 && !!emptyState.text,
  'порожній каталог показує пояснення, а не помилку', JSON.stringify(emptyState));
check(emptyState.shown && emptyState.hidden === 'false' && emptyState.modal === 'true'
  && emptyState.live === 'polite' && emptyState.focused === 'btn-community-close'
  && emptyState.tabSelected === 'true',
  'діалог каталогу доступний: aria-modal, live-region, фокус і вкладка', JSON.stringify(emptyState));

await page.keyboard.press('Escape');
const escaped = await page.evaluate(() => ({
  shown: document.getElementById('overlay-community').classList.contains('show'),
  hidden: document.getElementById('overlay-community').getAttribute('aria-hidden'),
}));
check(!escaped.shown && escaped.hidden === 'true', 'Escape закриває каталог', JSON.stringify(escaped));

// ---------- редактор → строга перевірка → публікація ----------
await page.evaluate(async (map) => {
  const g = window.__game;
  g.save.upgrades.mapeditor = 1;
  g.save.customMap = map;
  g.saveGame();
  await g.startLevel('CUSTOM', { customMap: 'edit', customMapSlot: 0 });
}, MAP);
await page.waitForFunction(() => window.__game?.level?.customMap?.editor, null, { timeout: 30000 });

// порожня карта не проходить строгу перевірку і не створює доказу
const emptyVerify = await page.evaluate(() => {
  const g = window.__game;
  const level = g.level;
  const saved = g.save.customMap;
  g.save.customMap = { biome: 'summer', objects: [] };
  level.customMap.data = { biome: 'summer', objects: [] };
  const started = g.community.startVerify(level);
  g.save.customMap = saved;
  return { started, pending: !!g.community.pending };
});
check(emptyVerify.started === false && !emptyVerify.pending,
  'карту без завдань не можна перевірити й опублікувати', JSON.stringify(emptyVerify));

await page.evaluate(async (map) => {
  const g = window.__game;
  g.endLevel();
  g.save.customMap = map;
  g.saveGame();
  await g.startLevel('CUSTOM', { customMap: 'edit', customMapSlot: 0 });
}, MAP);
await page.waitForFunction(() => window.__game?.level?.customMap?.editor, null, { timeout: 30000 });
await page.evaluate(() => window.__game.community.startVerify(window.__game.level));
await page.waitForFunction(() => window.__game?.level?.customVerify, null, { timeout: 30000 });
const verifyStart = await page.evaluate(() => ({
  verify: !!window.__game.level.customVerify,
  noProgress: !!window.__game.level.noProgress,
  pending: !!window.__game.community.pending,
  verified: !!window.__game.community.pending?.verified,
  publishHidden: document.getElementById('btn-community-result-publish').hidden,
}));
check(verifyStart.verify && verifyStart.noProgress && verifyStart.pending && !verifyStart.verified
  && verifyStart.publishHidden,
  'перевірочний забіг стартує без прогресу і без кнопки публікації', JSON.stringify(verifyStart));

await beatCurrentMap();
const verified = await page.evaluate(() => ({
  verified: !!window.__game.community.pending?.verified,
  publishHidden: document.getElementById('btn-community-result-publish').hidden,
  note: document.getElementById('community-result-note').textContent,
}));
check(verified.verified && !verified.publishHidden && !!verified.note,
  'перемога у перевірці відкриває кнопку публікації', JSON.stringify(verified));

const published = await page.evaluate(async () => {
  await window.__game.community.publishPending();
  return {
    published: window.__game.community.published,
    pending: window.__game.community.pending,
    shareHidden: document.getElementById('btn-community-result-share').hidden,
  };
});
check(!!published.published?.mapId && published.published.revision === 1 && !published.pending
  && !published.shareHidden,
  'публікація дає стабільний mapId, ревізію 1 і точне посилання', JSON.stringify(published.published));
check(/\?community=[A-HJ-NP-Z2-9]{8}&r=1$/.test(published.published?.url || ''),
  'посилання містить лише ID карти й ревізію', published.published?.url);
const mapId = published.published.mapId;

// доказ публікації не переживає вихід із рівня
const afterExit = await page.evaluate(() => {
  window.__game._hideOverlay('overlay-community-result');
  window.__game.endLevel();
  return { pending: window.__game.community.pending, run: window.__game.community.run };
});
check(!afterExit.pending && !afterExit.run, 'вихід із рівня стирає доказ перевірки', JSON.stringify(afterExit));

// ---------- каталог автора ----------
await page.evaluate(() => window.__game.community.open('my'));
await waitForPage(page, () => window.__game.community.state !== 'loading', 15000, 'вкладка «Мої»');
const mine = await page.evaluate(() => {
  const item = window.__game.community.items[0];
  const card = document.querySelector('#community-list .community-item');
  return {
    count: window.__game.community.items.length,
    owned: item?.owned,
    revision: item?.revision,
    status: item?.status,
    cid: JSON.stringify(item).includes('cid'),
    tag: card?.tagName,
    buttons: card ? [...card.querySelectorAll('button')].map((b) => b.dataset.communityAct) : [],
    nestedButtons: card ? card.querySelectorAll('button button').length : -1,
  };
});
check(mine.count === 1 && mine.owned === true && mine.revision === 1 && mine.status === 'active' && !mine.cid,
  'вкладка «Мої» показує власну карту без ідентичності', JSON.stringify(mine));
check(mine.tag === 'ARTICLE' && mine.nestedButtons === 0 && mine.buttons.includes('unpublish'),
  'картка каталогу — article з окремими кнопками', JSON.stringify(mine.buttons));

// ---------- інший гравець: тижневий каталог, забіг, реакція, нагорода ----------
await page.evaluate(() => {
  const g = window.__game;
  g._hideOverlay('overlay-community');
  g.save.cid = 'viewer-cid-000001'; // інша анонімна ідентичність — карта стає чужою
  g.save.crystals = 0;
  // чужі карти проходяться БЕЗ редактора: знімаємо обидва апгрейди
  g.save.upgrades.mapeditor = 0;
  g.save.upgrades.mapeditorplus = 0;
  g.saveGame();
});
await page.evaluate(() => window.__game.community.open('weekly'));
await waitForPage(page, () => window.__game.community.state !== 'loading', 15000, 'тижневий каталог');
const weekly = await page.evaluate(() => ({
  state: window.__game.community.state,
  items: window.__game.community.items.map((row) => ({ mapId: row.mapId, owned: row.owned })),
}));
check(weekly.items.length === 1 && weekly.items[0].mapId === mapId && weekly.items[0].owned === false,
  'карта потрапляє у заморожену підбірку тижня як чужа', JSON.stringify(weekly));

const localBefore = await page.evaluate(() => JSON.stringify(window.__game.save.customMap));
await page.evaluate((id) => window.__game.community.playMap(id, 1), mapId);
await page.waitForFunction(() => window.__game?.level?.communityMap, null, { timeout: 30000 });
const remoteRun = await page.evaluate(() => {
  const g = window.__game;
  return {
    snapshotId: g.level.customMapContext.snapshot.id,
    revision: g.level.customMapContext.snapshot.revision,
    runId: g.level.customMapContext.runId,
    noProgress: !!g.level.noProgress,
    editor: g.save.upgrades.mapeditor,
    editorPlus: g.save.upgrades.mapeditorplus,
    localMap: JSON.stringify(g.save.customMap),
    stored: Object.keys(localStorage).some((key) => (localStorage.getItem(key) || '').includes(g.level.customMapContext.snapshot.id)),
  };
});
check(remoteRun.snapshotId === mapId && remoteRun.revision === 1 && !!remoteRun.runId && remoteRun.noProgress,
  'чужа карта стартує з точного знімка і без прогресу', JSON.stringify({ ...remoteRun, localMap: undefined }));
check(remoteRun.editor === 0 && remoteRun.editorPlus === 0,
  'гравець без Створювача карт проходить опубліковану карту', JSON.stringify(remoteRun.editor));
check(remoteRun.localMap === localBefore && !remoteRun.stored,
  'чужа карта не потрапляє ні в сейв, ні в localStorage');

await beatCurrentMap();
await waitForPage(page, () => window.__game.community.run?.completed, 15000, 'підтвердження проходження');
const finished = await page.evaluate(() => ({
  completed: window.__game.community.run?.completed,
  crystals: window.__game.save.crystals,
  weekly: Object.keys(window.__game.save.weekly).filter((key) => key.startsWith('community:')),
  reactionsShown: !document.getElementById('community-result-community').hidden,
  note: document.getElementById('community-result-note').textContent,
}));
check(finished.completed && finished.crystals === 25 && finished.weekly.length === 1,
  'перша перемога на чужій карті тижня дає 25 кристалів один раз', JSON.stringify(finished));
check(finished.reactionsShown && !!finished.note,
  'після проходження зʼявляються реакції й пояснення', JSON.stringify(finished.note));

const reacted = await page.evaluate(async () => {
  await window.__game.community.react('fun');
  const button = document.querySelector('[data-reaction="fun"]');
  return { pressed: button.getAttribute('aria-pressed'), reaction: window.__game.community.run?.reaction };
});
check(reacted.pressed === 'true' && reacted.reaction === 'fun',
  'реакція доступна після проходження і відмічена aria-pressed', JSON.stringify(reacted));

const reactedOff = await page.evaluate(async () => {
  await window.__game.community.react('fun');
  return {
    pressed: document.querySelector('[data-reaction="fun"]').getAttribute('aria-pressed'),
    reaction: window.__game.community.run?.reaction,
  };
});
check(reactedOff.pressed === 'false' && reactedOff.reaction === null,
  'повторний тап знімає реакцію', JSON.stringify(reactedOff));

// ---------- точне посилання ----------
await page.goto(`${URL_BASE}&community=${mapId}&r=1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game?.level?.communityMap, null, { timeout: 40000 });
const deepLink = await page.evaluate(() => ({
  id: window.__game.level.customMapContext.snapshot.id,
  revision: window.__game.level.customMapContext.snapshot.revision,
  pending: window.__game.community.pending,
}));
check(deepLink.id === mapId && deepLink.revision === 1 && !deepLink.pending,
  'точне посилання відкриває саме ту ревізію, доказ публікації не відроджується', JSON.stringify(deepLink));

// ---------- недоступна спільнота: керована помилка і повтор ----------
await page.goto(`${BASE}/?test&fresh&relay=ws://localhost:1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });
await page.evaluate(() => window.__game.community.open('new'));
await waitForPage(page, () => window.__game.community.state === 'error', 20000, 'стан помилки');
const offline = await page.evaluate(() => ({
  state: window.__game.community.state,
  error: window.__game.community.errorCode,
  text: document.getElementById('community-status').textContent,
  retry: !document.getElementById('btn-community-retry').hidden,
  globe: window.__game.state,
}));
check(offline.state === 'error' && offline.error === 'net' && !!offline.text && offline.retry
  && offline.globe === 'globe',
  'офлайн дає керовану помилку з кнопкою повтору, а не падіння', JSON.stringify(offline));

// мережевий шум від навмисно недоступного relay — очікуваний
const noise = /Failed to (load resource|fetch)|ERR_CONNECTION|WebSocket|net::/i;
for (const error of errors) {
  if (noise.test(error)) continue;
  console.log('  ❌', error);
  failed++;
}
console.log(failed
  ? `💥 Провалено: ${failed}`
  : '✅ Community browser: каталог, перевірка, публікація, забіг, реакція, нагорода, deep link');
await closeTest();
relay.kill();
process.exit(failed ? 1 : 0);
