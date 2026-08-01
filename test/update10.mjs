// 🎮 Тест оновлення 10 (v14): нове головне меню (ГРАТИ / ГРАТИ РАЗОМ),
// соло-меню режимів, відкриття всього світу після України, червоні країни на глобусі.
import { openBrowserTest } from './_browser.mjs';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';

mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

const { BASE, page, closeTest } = await openBrowserTest({ launch: { args: ['--use-angle=swiftshader'] }, context: { viewport: { width: 1280, height: 800 } }, captureErrors: false });
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
  check('☰ меню: 14 кнопок прогресу, колекції та системи', menu.side === 14, `${menu.side}`);

  // ---------- соло-меню: локи на свіжому сейві ----------
  await page.click('#btn-solo');
  await page.waitForSelector('#overlay-solo.show');
  const fresh = await page.evaluate(() => {
    const paintedModes = () => [...document.querySelectorAll('.solo-mode')]
      .filter((m) => {
        const r = m.getBoundingClientRect();
        const css = getComputedStyle(m);
        return r.width > 0 && r.height > 0 && css.display !== 'none' && css.visibility !== 'hidden';
      })
      .map((m) => m.dataset.mode);
    return {
      modes: document.querySelectorAll('#solo-modes .solo-mode').length,
      stormLocked: document.querySelector('.solo-mode[data-mode="storm"]').classList.contains('locked'),
      arenaLocked: document.querySelector('.solo-mode[data-mode="arena"]').classList.contains('locked'),
      worldbossLocked: document.querySelector('.solo-mode[data-mode="worldboss"]').classList.contains('locked'),
      knockoutLocked: document.querySelector('.solo-mode[data-mode="knockout"]').classList.contains('locked'),
      zoneDefenseLocked: document.querySelector('.solo-mode[data-mode="zone-defense"]').classList.contains('locked'),
      defenseLocked: document.querySelector('.solo-mode[data-mode="defense"]').classList.contains('locked'),
      skulls: document.querySelectorAll('.sm-skull').length,
      bankLocked: document.querySelector('.solo-mode[data-mode="bank"]').classList.contains('locked'),
      portalLocked: document.querySelector('.solo-mode[data-mode="portal"]').classList.contains('locked'),
      mazeLocked: document.querySelector('.solo-mode[data-mode="maze"]').classList.contains('locked'),
      humansLocked: document.querySelector('.solo-mode[data-mode="humans"]').classList.contains('locked'),
      pvpLocked: document.querySelector('.solo-mode[data-mode="pvp"]').classList.contains('locked'),
      campLocked: document.querySelector('.solo-mode[data-mode="campaign"]').classList.contains('locked'),
      categories: [...document.querySelectorAll('.solo-category > summary')].map((t) => t.textContent.trim()),
      openCategories: document.querySelectorAll('.solo-category[open]').length,
      recommended: [...document.querySelectorAll('.solo-recommended .solo-mode')].map((m) => ({ id: m.dataset.mode, locked: m.classList.contains('locked') })),
      paintedModes: paintedModes(),
      sections: [...document.querySelectorAll('.solo-category .solo-section')].map((s) => ({
        title: s.parentElement.querySelector('summary').childNodes[0].textContent.trim(),
        modes: [...s.querySelectorAll('.solo-mode')].map((m) => m.dataset.mode),
      })),
    };
  });
  check('19 карток; кімнатні режими відкриті на фреші, тумблерів 💀 ще нема',
    fresh.modes === 19 && !fresh.stormLocked && !fresh.arenaLocked && !fresh.worldbossLocked
      && !fresh.knockoutLocked && !fresh.zoneDefenseLocked && !fresh.defenseLocked
      && !fresh.bankLocked && !fresh.portalLocked && !fresh.mazeLocked && !fresh.humansLocked && !fresh.pvpLocked && !fresh.campLocked
      && fresh.skulls === 0,
    JSON.stringify(fresh));
  // категорія показує свій склад МІНУС підбірка дня: жодної картки двічі на екрані.
  // Підбірка рахується від дати, тож очікування будуємо, а не прибиваємо цвяхами.
  const featuredIds = fresh.recommended.map((x) => x.id);
  const groupIds = {
    '⏱️ 5 ХВИЛИН': ['knockout', 'radiation', 'pvp', 'bank', 'maze', 'zone-defense', 'soul-collector', 'defense', 'portal', 'turretwar', 'humans'],
    '🌍 ДОВГА ОПЕРАЦІЯ': ['campaign', 'expedition', 'community', 'storm', 'arena', 'worldboss', 'infected', 'chapter3'],
  };
  const expectedSections = Object.entries(groupIds)
    .map(([title, modes]) => ({ title, modes: modes.filter((id) => !featuredIds.includes(id)) }));
  check('режими згруповані у дві згорнуті категорії за довжиною сесії',
    fresh.categories.length === 2
      && ['5 ХВИЛИН', 'ДОВГА ОПЕРАЦІЯ'].every((name) => fresh.categories.some((x) => x.includes(name)))
      && fresh.openCategories === 0
      && fresh.recommended.length === 4
      && new Set(fresh.recommended.map((x) => x.id)).size === fresh.recommended.length
      && fresh.recommended.every((x) => !x.locked)
      && JSON.stringify(fresh.sections) === JSON.stringify(expectedSections),
    JSON.stringify({ categories: fresh.categories, open: fresh.openCategories, recommended: fresh.recommended, sections: fresh.sections }));
  check('«СЬОГОДНІ» не дублює картки категорій',
    !featuredIds.some((id) => fresh.sections.some((s) => s.modes.includes(id)))
      && new Set([...featuredIds, ...fresh.sections.flatMap((s) => s.modes)]).size === 19,
    JSON.stringify({ featured: featuredIds, sections: fresh.sections }));
  await page.locator('.solo-category[data-category="quick"] > summary').click();
  const trialModes = await page.evaluate(() =>
    [...document.querySelectorAll('.solo-category[data-category="quick"] .solo-mode')].map((m) => m.dataset.mode));
  check('клік по категорії показує тільки її режими',
    JSON.stringify(trialModes) === JSON.stringify(expectedSections[0].modes),
    trialModes.join(','));
  await page.locator('.solo-category[data-category="long"] > summary').click();
  check('одночасно розгорнута лише одна категорія',
    await page.locator('.solo-category[open]').count() === 1);
  await page.screenshot({ path: 'shots/u10-solo-fresh.png' });

  await page.click('.solo-category[data-category="long"] .solo-mode[data-mode="campaign"]');
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
  check('Шторм і Арена лишаються відкритими', unlocked.storm && unlocked.arena, JSON.stringify(unlocked));

  await page.locator('.solo-category[data-category="long"] > summary').click();
  await page.click('.solo-category[data-category="long"] .solo-mode[data-mode="storm"]');
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
  await closeTest();
}

console.log(failures === 0 ? '\n🎉 ОНОВЛЕННЯ 10 (МЕНЮ + СВІТ) ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
