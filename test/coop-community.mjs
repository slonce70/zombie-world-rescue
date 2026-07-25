// 🏘️🤝 v700: карта спільноти в коопі. Хост тягне точний знімок і веде кімнату,
// гість будує ТОЙ САМИЙ знімок, але не створює динаміку місії; взаємодії гостя
// проходять через один kind 'cmap' із перевіркою індексів і відстані в хоста.
import { openCoopTest, makeCheck } from './_browser.mjs';

const RELAY_PORT = 8781;
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const { BASE, RELAY, A, B, errors, closeTest } = await openCoopTest({ relayPort: RELAY_PORT });
let failed = 0;
const check = makeCheck(() => failed++);
const API = `http://localhost:${RELAY_PORT}`;
const HOST_CID = 'host-cid-000001';

const MAP = {
  biome: 'summer',
  objects: [
    { type: 'task', quest: 'rescue', x: -60, z: -60, ry: 0 },
    { type: 'task', quest: 'collect', x: 60, z: -60, ry: 0 },
    { type: 'airdrop', x: 0, z: -90, ry: 0 },
    { type: 'tree', x: 20, z: 0, ry: 0 },
  ],
};

async function publish() {
  const response = await fetch(`${API}/community/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid: HOST_CID, slot: 0, map: MAP, mapSize: 'standard', mapStyle: 'classic' }),
  });
  const text = await response.text();
  if (response.status !== 200) throw new Error(`publish ${response.status}: ${text}`);
  return JSON.parse(text);
}

try {
  console.log('▸ Публікація карти і кооп-кімната');
  const { mapId, revision, tier } = await publish();
  check(!!mapId && revision === 1 && tier === 'plus',
    'карта з аірдропом публікується як Plus', JSON.stringify({ mapId, revision, tier }));

  await A.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await B.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await A.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });
  await B.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });
  // хост — автор карти, гість лишається стороннім гравцем
  await A.evaluate((cid) => { window.__game.save.cid = cid; window.__game.saveGame(); }, HOST_CID);
  await B.evaluate(() => { window.__game.save.cid = 'guest-cid-00001'; window.__game.saveGame(); });

  const code = await A.evaluate(() => window.__game.test.coopCreate('Тато'));
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await A.waitForFunction(() => window.__game.coop.session.roster.size === 2, null, { timeout: 20000 * SLOW });

  console.log('▸ Хост веде кімнату в карту спільноти');
  await A.evaluate(({ id, r }) => window.__game.test.coopStartCommunity(id, r), { id: mapId, r: revision });
  await A.waitForFunction(() => window.__game.level?.communityMap && window.__game.level.net, null, { timeout: 45000 * SLOW });
  await B.waitForFunction(() => window.__game.level?.communityMap && window.__game.level.net, null, { timeout: 45000 * SLOW });

  const shape = (side) => side.evaluate(() => {
    const g = window.__game;
    const level = g.level;
    const context = level.customMapContext;
    return {
      id: context.snapshot.id,
      revision: context.snapshot.revision,
      tier: level.customMap.tier,
      plus: level.customMap.plus,
      mapSize: level.mapSize,
      mapStyle: level.mapStyle,
      runId: context.runId,
      mirror: !!level.mirror,
      authority: level.customMap.authority,
      tasks: level.customMap.tasks.length,
      placedZombies: level.zombies.list.filter((zombie) => zombie.customPlaced).length,
      objects: level.customMap.data.objects.length,
      editorPlus: level.customMap.editorPlus,
      noProgress: !!level.noProgress,
      localMap: JSON.stringify(g.save.customMap),
    };
  });
  const host = await shape(A);
  const guest = await shape(B);
  check(host.id === guest.id && host.revision === guest.revision && host.tier === guest.tier
    && host.mapSize === guest.mapSize && host.mapStyle === guest.mapStyle && host.runId === guest.runId,
    'хост і гість дістали однаковий знімок, tier, розмір і runId', JSON.stringify({ host, guest }));
  check(guest.mirror && guest.authority === false && host.authority === true && guest.tasks === host.tasks
    && guest.objects === host.objects,
    'гість — дзеркало з тим самим статичним світом', JSON.stringify({ hostTasks: host.tasks, guestTasks: guest.tasks }));
  check(guest.placedZombies === 0 && guest.plus === true && guest.editorPlus === false,
    'гість не створює динаміку місії, але Plus-правила знімка діють', JSON.stringify(guest));
  check(guest.noProgress && guest.localMap === JSON.stringify({ biome: 'summer', objects: [] }),
    'кооп-забіг не чіпає прогрес і локальний слот гостя', JSON.stringify({ noProgress: guest.noProgress }));

  console.log('▸ Взаємодія гостя: hostʼу вирішувати');
  // задалеку намір гостя не діє — хост звіряє відстань за СВОЇМ снапшотом позиції
  await B.evaluate(() => {
    const g = window.__game;
    g.level.player.pos.set(0, g.level.player.pos.y, 120);
    g.level.net.sendUse('cmap', { a: 'rescue', i: 0 });
  });
  await new Promise((resolve) => setTimeout(resolve, 1200 * SLOW));
  const farAway = await A.evaluate(() => window.__game.level.customMap.tasks[0].done);
  check(farAway === false, 'намір гостя здалеку хост відкидає', `done=${farAway}`);

  // біля цілі — та сама кнопка спрацьовує, і стан приїжджає гостю снапшотом
  await B.evaluate(() => {
    const g = window.__game;
    const task = g.level.customMap.tasks[0];
    g.level.player.pos.set(task.action.x, g.level.player.pos.y, task.action.z);
  });
  await new Promise((resolve) => setTimeout(resolve, 900 * SLOW));
  await B.evaluate(() => {
    const g = window.__game;
    g.input.justPressed.add('KeyE');
    g.level.customMap.update(0.1, g.input, true);
    g.input.justPressed.clear();
  });
  const hostDone = await A.waitForFunction(() => window.__game.level.customMap.tasks[0].done, null, { timeout: 15000 * SLOW })
    .then(() => true).catch(() => false);
  check(hostDone, 'взаємодія гостя поруч із ціллю виконує завдання в хоста');
  const guestDone = await B.waitForFunction(() => window.__game.level.customMap.tasks[0].done, null, { timeout: 15000 * SLOW })
    .then(() => true).catch(() => false);
  check(guestDone, 'стан завдання приїжджає гостю снапшотом місії');

  // підроблені індекси не ламають хост
  await B.evaluate(() => {
    const net = window.__game.level.net;
    net.sendUse('cmap', { a: 'collect', i: 99, s: 99 });
    net.sendUse('cmap', { a: 'lights', i: -1, s: 1.5 });
    net.sendUse('cmap', { a: 'airdrop', i: 4242 });
  });
  await new Promise((resolve) => setTimeout(resolve, 1000 * SLOW));
  const alive = await A.evaluate(() => ({
    level: window.__game.state === 'level',
    tasks: window.__game.level.customMap.tasks.map((task) => task.done),
    airdrops: window.__game.level.customMap.airdrops.map((drop) => drop.opened),
  }));
  check(alive.level && alive.tasks[1] === false && alive.airdrops.every((open) => !open),
    'підроблені індекси гостя нічого не міняють', JSON.stringify(alive));

  // підроблений start «від сусіда» не має ані будувати рівень, ані завершувати його
  const forged = await B.evaluate(async () => {
    const g = window.__game;
    const session = g.coop.session;
    const before = g.level;
    session._onMessage(3, { t: 'start', countryId: 'UKR', seed: 1, runIndex: 0, rid: 'forged-run-000' });
    session._onMessage(3, { t: 'lvlend' });
    session._onMessage(3, { t: 'end', why: 'closed' });
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { same: g.level === before, state: g.state, room: !!session.room };
  });
  check(forged.same && forged.state === 'level' && forged.room,
    'сесійні команди від іншого гостя ігноруються', JSON.stringify(forged));

  console.log('▸ Реконект: той самий rid не перебудовує рівень');
  const sameRun = await B.evaluate(async () => {
    const g = window.__game;
    const session = g.coop.session;
    const before = g.level;
    session._onMessage(1, { t: 'start', ...session.net.spec });
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { same: g.level === before, id: g.level?.customMapContext?.snapshot?.id };
  });
  check(sameRun.same, 'повторний start із тим самим rid не перебудовує рівень', JSON.stringify(sameRun));

  console.log('▸ Mid-join: гість повертається і бачить актуальний стан місії');
  await B.evaluate(() => {
    const g = window.__game;
    g.coop.session.leave();
    if (g.state === 'level') g.endLevel();
  });
  await A.waitForFunction(() => window.__game.coop.session.roster.size === 1, null, { timeout: 20000 * SLOW });
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await B.waitForFunction(() => window.__game.level?.communityMap && window.__game.level.net, null, { timeout: 45000 * SLOW });
  const rejoined = await B.waitForFunction(() => window.__game.level.customMap.tasks[0].done, null, { timeout: 20000 * SLOW })
    .then(() => true).catch(() => false);
  check(rejoined, 'гість після повернення отримує точний стан завдань');
  const rejoinShape = await B.evaluate(() => ({
    id: window.__game.level.customMapContext.snapshot.id,
    tier: window.__game.level.customMap.tier,
    authority: window.__game.level.customMap.authority,
  }));
  check(rejoinShape.id === mapId && rejoinShape.tier === 'plus' && rejoinShape.authority === false,
    'після mid-join гість лишається дзеркалом тієї самої ревізії', JSON.stringify(rejoinShape));

  console.log('▸ Кожен учасник зараховує проходження сам');
  await A.evaluate(() => {
    const g = window.__game;
    const mode = g.level.customMap;
    for (const task of mode.tasks) {
      if (task.done) continue;
      if (task.quest === 'collect') {
        for (const crate of task.targets) { crate.done = true; task.progress++; }
      }
      mode._finishTask(task);
    }
    mode.update(0.1, g.input, false);
  });
  // Plus-карта завершується лише зі смертю фінального боса — чекаємо його і валимо
  await A.waitForFunction(() => window.__game.level.customMap.boss, null, { timeout: 20000 * SLOW });
  await A.evaluate(() => window.__game.level.customMap.boss.damage(999999, null, false));
  const hostResult = await A.waitForFunction(() => document.getElementById('overlay-community-result').classList.contains('show'),
    null, { timeout: 20000 * SLOW }).then(() => true).catch(() => false);
  check(hostResult, 'хост бачить окремий результат карти спільноти');
  const guestResult = await B.waitForFunction(() => document.getElementById('overlay-community-result').classList.contains('show'),
    null, { timeout: 20000 * SLOW }).then(() => true).catch(() => false);
  check(guestResult, 'гість бачить той самий фінал через снапшот місії');

  const guestRun = await B.evaluate(async () => {
    for (let i = 0; i < 40 && !window.__game.community.run?.completed; i++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return {
      completed: window.__game.community.run?.completed,
      coop: window.__game.community.run?.coop,
      note: document.getElementById('community-result-note').textContent,
      reactions: !document.getElementById('community-result-community').hidden,
      victory: document.getElementById('overlay-victory').classList.contains('show'),
    };
  });
  check(guestRun.completed && guestRun.coop === true && guestRun.reactions && !guestRun.victory,
    'гість отримує власне зарахування і реакції, а не перемогу кампанії', JSON.stringify(guestRun));

  const hostRun = await A.evaluate(() => ({
    completed: window.__game.community.run?.completed,
    note: document.getElementById('community-result-note').textContent,
    reactions: !document.getElementById('community-result-community').hidden,
  }));
  check(hostRun.completed && !hostRun.reactions,
    'автор карти не отримує реакцій за власне проходження', JSON.stringify(hostRun));

  const lobby = await fetch(`${API}/lobby/state`).then((response) => response.json()).catch(() => null);
  const rooms = JSON.stringify(lobby || {});
  check(!rooms.includes(HOST_CID) && !rooms.includes('objects') && !rooms.includes('"cm"'),
    'публічне Лобі не містить ані CID, ані карти', rooms.slice(0, 160));
} finally {
  for (const error of errors) { console.log('  ❌', error); failed++; }
  console.log(failed
    ? `💥 Провалено: ${failed}`
    : '✅ Coop community: спільний знімок, host authority, реконект, окремі зарахування');
  await closeTest();
}
process.exit(failed ? 1 : 0);
