// 🎮 Тест оновлення 10 (v14): нове головне меню (ГРАТИ / ГРАТИ РАЗОМ),
// соло-меню режимів, відкриття всього світу після України, червоні країни на глобусі.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';

const { base: BASE, close: closeServer } = await ensureWebServer();
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

try {
  page.setDefaultTimeout(60000);
  await page.goto(`${BASE}/?test&fresh`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

  // ---------- нове головне меню ----------
  const menu = await page.evaluate(() => ({
    solo: !!document.getElementById('btn-solo'),
    coop: !!document.getElementById('btn-coop'),
    oldStorm: !!document.getElementById('btn-storm'),
    oldArena: !!document.getElementById('btn-arena'),
    side: document.querySelectorAll('#overlay-menu .globe-act').length,
  }));
  check('дві головні кнопки, старі Шторм/Арена прибрані', menu.solo && menu.coop && !menu.oldStorm && !menu.oldArena, JSON.stringify(menu));
  check('☰ меню: 9 другорядних кнопок у висувному меню', menu.side === 9, `${menu.side}`);

  // ---------- соло-меню: локи на свіжому сейві ----------
  await page.click('#btn-solo');
  await page.waitForSelector('#overlay-solo.show');
  const fresh = await page.evaluate(() => ({
    modes: document.querySelectorAll('.solo-mode').length,
    stormLocked: document.querySelector('.solo-mode[data-mode="storm"]').classList.contains('locked'),
    arenaLocked: document.querySelector('.solo-mode[data-mode="arena"]').classList.contains('locked'),
    worldbossLocked: document.querySelector('.solo-mode[data-mode="worldboss"]').classList.contains('locked'),
    knockoutLocked: document.querySelector('.solo-mode[data-mode="knockout"]').classList.contains('locked'),
    overloadedKnockoutLocked: document.querySelector('.solo-mode[data-mode="overloaded-knockout"]').classList.contains('locked'),
    zoneDefenseLocked: document.querySelector('.solo-mode[data-mode="zone-defense"]').classList.contains('locked'),
    defenseLocked: document.querySelector('.solo-mode[data-mode="defense"]').classList.contains('locked'),
    overloadedDefenseLocked: document.querySelector('.solo-mode[data-mode="overloaded-defense"]').classList.contains('locked'),
    overloadedLocked: document.querySelector('.solo-mode[data-mode="overloaded-pvp"]').classList.contains('locked'),
    bankLocked: document.querySelector('.solo-mode[data-mode="bank"]').classList.contains('locked'),
    pvpLocked: document.querySelector('.solo-mode[data-mode="pvp"]').classList.contains('locked'),
    campLocked: document.querySelector('.solo-mode[data-mode="campaign"]').classList.contains('locked'),
  }));
  check('12 режимів; спецрежими замкнені, Кампанія відкрита',
    fresh.modes === 12 && fresh.stormLocked && fresh.arenaLocked && fresh.worldbossLocked
      && fresh.knockoutLocked && fresh.overloadedKnockoutLocked && fresh.zoneDefenseLocked && fresh.defenseLocked && fresh.overloadedDefenseLocked
      && fresh.overloadedLocked && fresh.bankLocked && fresh.pvpLocked && !fresh.campLocked,
    JSON.stringify(fresh));
  await page.screenshot({ path: 'shots/u10-solo-fresh.png' });

  await page.click('.solo-mode[data-mode="campaign"]');
  // новий флоу: країну обирають ІНЛАЙН у меню (не закриваючи його, не йдучи на глобус)
  await page.waitForSelector('#country-list .country-item', { timeout: 10000 });
  const campCountries = await page.evaluate(() =>
    document.querySelectorAll('#country-list .country-item').length);
  check('Кампанія → інлайн-список країн у меню', campCountries >= 8, `${campCountries}`);
  await page.evaluate(() => window.__game._hideOverlay('overlay-solo')); // закрити для наступних кроків

  // ---------- розблокування: після України відкритий ВЕСЬ світ ----------
  const openLogic = await page.evaluate(async () => {
    const m = await import('./src/countries.js');
    return {
      ukrFirst: m.isCountryOpen({}, 'UKR') === true,
      turClosed: m.isCountryOpen({}, 'TUR') === false,
      turOpenAfterUkr: m.isCountryOpen({ UKR: true }, 'TUR') === true,
      egyOpenAfterUkr: m.isCountryOpen({ UKR: true }, 'EGY') === true,
      unknownNever: m.isCountryOpen({ UKR: true }, 'BRA') === false,
    };
  });
  check('логіка відкриття: Україна перша, далі — весь світ', Object.values(openLogic).every(Boolean), JSON.stringify(openLogic));

  // ---------- глобус: кольори країн ----------
  const px = async () => page.evaluate(async () => {
    const m = await import('./src/countries.js');
    const g = window.__game.globe;
    const ctx = g.texCanvas.getContext('2d');
    const at = (lat, lon) => {
      const x = Math.round(((lon + 180) / 360) * g.texCanvas.width);
      const y = Math.round(((90 - lat) / 180) * g.texCanvas.height);
      return [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    };
    return {
      ukr: at(m.COUNTRIES.UKR.lat, m.COUNTRIES.UKR.lon),
      tur: at(m.COUNTRIES.TUR.lat, m.COUNTRIES.TUR.lon),
      bra: at(-10, -53),
    };
  });
  const isRed = (c) => c[0] > 170 && c[1] < 120 && c[2] < 110;
  const isGreen = (c) => c[1] > 140 && c[0] < 140;
  const isPurple = (c) => Math.abs(c[0] - 141) < 30 && Math.abs(c[2] - 163) < 30;

  let colors = await px();
  check('свіжий сейв: Україна ЧЕРВОНА (зомбі тут!)', isRed(colors.ukr), `rgb(${colors.ukr})`);
  check('свіжий сейв: Туреччина ще закрита (фіолетова)', isPurple(colors.tur), `rgb(${colors.tur})`);

  await page.evaluate(() => {
    window.__game.save.liberated = { UKR: true };
    window.__game.saveGame();
    window.__game.globe.setLiberated();
  });
  colors = await px();
  check('Україна звільнена → ЗЕЛЕНА', isGreen(colors.ukr), `rgb(${colors.ukr})`);
  check('Туреччина відкрилась → ЧЕРВОНА', isRed(colors.tur), `rgb(${colors.tur})`);
  check('Бразилія (не кампанія) — фіолетова', isPurple(colors.bra), `rgb(${colors.bra})`);
  await page.screenshot({ path: 'shots/u10-globe-red.png' });

  // ---------- соло-меню: Шторм із вибором країни ----------
  await page.evaluate(() => {
    window.__game.save.liberated = { UKR: true, POL: true };
    window.__game.saveGame();
  });
  await page.click('#btn-solo');
  await page.waitForSelector('#overlay-solo.show');
  const unlocked = await page.evaluate(() => ({
    storm: !document.querySelector('.solo-mode[data-mode="storm"]').classList.contains('locked'),
    arena: !document.querySelector('.solo-mode[data-mode="arena"]').classList.contains('locked'),
  }));
  check('2 країни звільнено → Шторм і Арена відкриті', unlocked.storm && unlocked.arena, JSON.stringify(unlocked));

  await page.click('.solo-mode[data-mode="storm"]');
  const ctys = await page.evaluate(() =>
    [...document.querySelectorAll('.solo-cty')].map((b) => b.dataset.id));
  check('Шторм пропонує звільнені країни', ctys.join(',') === 'UKR,POL', ctys.join(','));
  await page.screenshot({ path: 'shots/u10-solo-storm.png' });

  await page.click('.solo-cty[data-id="POL"]');
  await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.storm, null, { timeout: 40000 });
  const stormCty = await page.evaluate(() => window.__game.level.countryId);
  check('Шторм стартував у Польщі', stormCty === 'POL', stormCty);
  const chipHidden = await page.evaluate(() => document.getElementById('coop-room').style.display === 'none');
  check('чип кімнати у соло прихований', chipHidden);
  const mulSolo = await page.evaluate(() => window.__game.level.zombies.coopMul());
  check('соло: множник складності = 1', mulSolo === 1, `×${mulSolo}`);

  const realErrs = errs.filter((e) => !e.includes('favicon'));
  check('консоль чиста', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.error('❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
  await page.screenshot({ path: 'shots/u10-fail.png' }).catch(() => {});
} finally {
  await browser.close().catch(() => {});
closeServer();
}

console.log(failures === 0 ? '\n🎉 ОНОВЛЕННЯ 10 (МЕНЮ + СВІТ) ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
