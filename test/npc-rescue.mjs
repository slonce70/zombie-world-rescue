// 🤝 R4 (v290) «Врятовані друзі»: схований НПС у клітці в соло-кампанії.
// Перевіряємо: спавн біля storySites-якоря (не арена), сторожі блокують звільнення,
// вбив сторожів → ~2с звільнення → save.friends, хінт-тост після місій + вейпоінт,
// реплей після порятунку → клітки нема, не-сторі рівень → клітки нема (кооп/гість гейт).
import { openBrowserTest } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 800 } }, pageErrorPrefix: '' });

let failed = 0;
const check = (ok, msg, d = '') => { console.log(ok ? '  ✅' : '  ❌', msg, d); if (!ok) failed++; };

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

// 1) клітка спавниться у соло-кампанії біля storySites-якоря (не арена), 3–5 сторожів
await page.evaluate(async () => { window.__game.save.friends = {}; await window.__game.startLevel('UKR'); });
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
let st = await page.evaluate(() => {
  const c = window.__game.level.rescueCage;
  const arena = window.__game.level.country.map.storySites.arena;
  return {
    exists: !!c, active: !!(c && c.active), net: window.__game.level.net,
    guards: c ? c.guards.length : 0,
    distArena: c ? Math.hypot(c.cageX - arena.x, c.cageZ - arena.z) : 0,
    friend: c && c.friend && c.friend.id,
  };
});
check(st.exists && st.active && st.net === null, 'клітка спавниться у соло-кампанії UKR', JSON.stringify(st));
check(st.guards >= 3 && st.guards <= 5, 'клітку стережуть 3–5 зомбі', JSON.stringify(st));
check(st.distArena > 5, 'клітка НЕ на арені боса', JSON.stringify(st));
check(st.friend === 'UKR', 'друг країни підвʼязаний до клітки', JSON.stringify(st));

// 2) живі сторожі → друга звільнити не можна (навіть тримаючи взаємодію біля клітки)
st = await page.evaluate(() => {
  const c = window.__game.level.rescueCage;
  window.__game.test.teleport(c.cageX, c.cageZ);
  const fake = { down: () => true };
  for (let i = 0; i < 40; i++) c.update(0.1, fake, true);
  return { rescued: c.rescued, saved: !!(window.__game.save.friends && window.__game.save.friends.UKR) };
});
check(!st.rescued && !st.saved, 'зі живими сторожами друга не звільнити', JSON.stringify(st));

// 3) вбий сторожів → підійди ≤2.5м → ~2с звільнення → save.friends.UKR
st = await page.evaluate(() => {
  const c = window.__game.level.rescueCage;
  c.guards.forEach((z) => z.damage && z.damage(99999, null, false));
  window.__game.test.teleport(c.cageX, c.cageZ);
  const fake = { down: () => true };
  let firstRescueIter = -1;
  for (let i = 0; i < 40; i++) { c.update(0.1, fake, true); if (c.rescued && firstRescueIter < 0) firstRescueIter = i; }
  return { rescued: c.rescued, saved: !!window.__game.save.friends.UKR, firstRescueIter };
});
check(st.rescued && st.saved, 'вбив сторожів → звільнив друга → save.friends.UKR=true', JSON.stringify(st));
check(st.firstRescueIter >= 18 && st.firstRescueIter <= 24, 'звільнення триває ~2с (dt=0.1 → ~20 кадрів)', JSON.stringify(st));

// 4) після завершення основних місій — одноразовий хінт-тост + вейпоінт-промінь на клітку
st = await page.evaluate(async () => {
  window.__game.endLevel();
  window.__game.save.friends = {};
  await window.__game.startLevel('UKR');
  const c = window.__game.level.rescueCage;
  const toasts = [];
  const orig = window.__game.hud.toast.bind(window.__game.hud);
  window.__game.hud.toast = (txt) => { toasts.push(txt); return orig(txt); };
  window.__game.level.missions.bossUnlocked = true; // всі основні місії зроблено
  window.__game.test.teleport(c.cageX + 120, c.cageZ + 120); // гравець далеко
  c.update(0.1, { down: () => false }, true);
  window.__game.hud.toast = orig;
  return { hintShown: c.hintShown, beam: !!c.beam, toastHint: toasts.some((tx) => /схован|hidden|спрятан/i.test(tx)) };
});
check(st.hintShown && st.toastHint, 'після місій — одноразовий хінт-тост про схованого друга', JSON.stringify(st));
check(st.beam, 'вейпоінт-промінь наведено на клітку', JSON.stringify(st));

// 5) реплей після порятунку → клітка не спавниться (друг уже в таборі)
st = await page.evaluate(async () => {
  window.__game.endLevel();
  window.__game.save.friends = { UKR: true };
  await window.__game.startLevel('UKR');
  const c = window.__game.level.rescueCage;
  return { exists: !!c, active: !!(c && c.active) };
});
check(st.exists && !st.active, 'реплей після порятунку → клітки нема (друг у таборі)', JSON.stringify(st));

// 6) не-сторі / не-кампанія (LOST) → клітки нема. Це той самий useStory-гейт, що
//    виключає кооп/гостя (shouldUseStoryMissions вимагає campaign && !coop && !guest).
st = await page.evaluate(async () => {
  window.__game.endLevel();
  window.__game.save.friends = {};
  await window.__game.startLevel('LOST');
  return { cageUndefined: window.__game.level.rescueCage === undefined, kind: window.__game.test.missionKind() };
});
check(st.cageUndefined && st.kind === 'DynamicMissions', 'не-сторі рівень (LOST) → клітки нема (гейт useStory)', JSON.stringify(st));

// 7) 🤝 v294: промінь-вейпоінт МУСИТЬ зникнути після порятунку. makeBeam() повертає ХЕНДЛ
//    {group, remove()}, а не Object3D — старий scene.remove(handle) був silent no-op і промінь
//    світився над порожньою кліткою весь рівень. Тепер _rescue() кличе this.beam.remove().
st = await page.evaluate(async () => {
  window.__game.endLevel();
  window.__game.save.friends = {};
  await window.__game.startLevel('UKR');
  const g = window.__game;
  const c = g.level.rescueCage;
  const scene = g.level.scene;
  // створюємо промінь (як у грі — після зачистки основних місій, гравець далеко)
  c.guards.forEach((z) => z.damage && z.damage(99999, null, false));
  g.level.missions.bossUnlocked = true;
  g.test.teleport(c.cageX + 120, c.cageZ + 120);
  c.update(0.1, { down: () => false }, true); // → beam створено
  const beamMade = !!c.beam;
  const beamGroup = c.beam ? c.beam.group : null;
  const inSceneBefore = beamGroup ? scene.children.includes(beamGroup) : false;
  // рятуємо друга (підходимо + тримаємо взаємодію)
  g.test.teleport(c.cageX, c.cageZ);
  const fake = { down: () => true };
  for (let i = 0; i < 40; i++) c.update(0.1, fake, true);
  return {
    beamMade, inSceneBefore,
    rescued: c.rescued,
    beamNulled: c.beam === null,
    inSceneAfter: beamGroup ? scene.children.includes(beamGroup) : false,
    groupParentNull: beamGroup ? beamGroup.parent === null : false,
  };
});
check(st.beamMade && st.inSceneBefore, 'промінь створено й доданий у сцену перед порятунком', JSON.stringify(st));
check(st.rescued && st.beamNulled, 'після порятунку c.beam === null (remove() викликано)', JSON.stringify(st));
check(!st.inSceneAfter && st.groupParentNull, 'group променя ЗНИКЛА зі сцени (не silent no-op)', JSON.stringify(st));

check(errors.length === 0, `без JS-помилок (${errors.slice(0, 2).join(' | ')})`);
console.log(failed === 0 ? '🎉 NPC-RESCUE OK' : `❌ ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
