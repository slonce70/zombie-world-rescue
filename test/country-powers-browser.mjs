// 🎖️ Пасивки країн у живій грі: звільнена країна реально міняє поля гравця,
// незвільнена — ні; режим із фіксованим лоадаутом лишається поза системою;
// покупка в магазині посеред забігу пасивку не стирає; профіль «Герой» їх показує.
import { openBrowserTest, makeCheck } from './_browser.mjs';

let fail = 0;
const check = makeCheck(() => fail++);
const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 900 } }, captureConsole: false, pageErrorPrefix: '' });

const ALL_SIX = { ESP: true, PRT: true, ITA: true, SWE: true, JPN: true, CHN: true };

await page.goto(`${BASE}/?test&fresh`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

// Готуємо сейв, запускаємо забіг і чекаємо САМЕ новий рівень (старий помічаємо __stale,
// інакше waitForFunction відповість одразу попереднім рівнем) — далі знімаємо поля гравця.
async function runStats({ liberated = {}, upgrades = {}, start = 'g.startLevel("UKR")' }) {
  await page.evaluate(([lib, up, startCode]) => {
    const g = window.__game;
    g.save.liberated = { ...lib };
    g.save.upgrades = { ...up };
    g.victoryShown = false;
    if (g.level) g.level.__stale = true;
    // eslint-disable-next-line no-new-func
    new Function('g', startCode)(g);
  }, [liberated, upgrades, start]);
  await page.waitForFunction(
    () => window.__game.state === 'level' && window.__game.level && !window.__game.level.__stale && !!window.__game.level.player,
    null, { timeout: 30000 },
  );
  return page.evaluate(() => {
    const g = window.__game;
    const p = g.level.player;
    return {
      maxHealth: p.maxHealth, health: p.health, maxArmor: p.maxArmor,
      speedMult: Math.round(p.speedMult * 1000) / 1000,
      damageMult: Math.round(p.damageMult * 1000) / 1000,
      helmetMult: Math.round(p.helmetMult * 1000) / 1000,
      healMult: Math.round(p.healMult * 1000) / 1000,
      knockout: !!g.level.knockout,
      powers: g.level.countryPowers,
    };
  });
}
const statsWith = (liberated) => runStats({ liberated });

console.log('▸ Жодної з шести країн не звільнено — герой рівно такий, як був');
const none = await statsWith({ UKR: true, POL: true, DEU: true, FRA: true, TUR: true, EGY: true });
check(none.maxHealth === 100 && none.maxArmor === 50, 'база: 100 HP і 50 броні', JSON.stringify(none));
check(none.speedMult === 1 && none.damageMult === 1 && none.helmetMult === 1 && none.healMult === 1,
  'база: жодного множника (країни зі зброєю пасивок не дають)', JSON.stringify(none));

console.log('▸ Одна країна (Китай) — рівно її ефект');
const chn = await statsWith({ CHN: true });
check(chn.maxHealth === 120 && chn.health === 120, '🏯 Велика стіна: +20 макс. HP і повне здоровʼя', JSON.stringify(chn));
check(chn.maxArmor === 50 && chn.speedMult === 1 && chn.damageMult === 1, 'Китай не чіпає нічого іншого', JSON.stringify(chn));

console.log('▸ Усі шість країн — усі шість пасивок на гравці');
const all = await statsWith(ALL_SIX);
check(all.maxHealth === 120, '🏯 +20 макс. HP', all.maxHealth);
check(all.maxArmor === 75, '🛡️ +25 макс. броні', all.maxArmor);
check(all.speedMult === 1.04, '🐂 +4% швидкості', all.speedMult);
check(all.damageMult === 1.05, '🗡️ +5% шкоди', all.damageMult);
check(all.helmetMult === 0.95, '❄️ -5% вхідної шкоди', all.helmetMult);
check(all.healMult === 1.12, '🌊 +12% лікування', all.healMult);

console.log('▸ Пасивки складаються з магазином у ті самі поля, а не поруч');
const withShop = await runStats({ liberated: ALL_SIX, upgrades: { maxhp: 4, speed: 3, damage: 3, vest: 2, helmet: 1 } });
check(withShop.maxHealth === 220 && withShop.maxArmor === 175,
  'повна гілка + пасивки: 220 HP і 175 броні', JSON.stringify(withShop));
check(withShop.damageMult === 1.523 && withShop.helmetMult === 0.808,
  'шкода 1.45×1.05 і шолом 0.85×0.95 — одні поля, а не другий комплект', JSON.stringify(withShop));

console.log('▸ Покупка в магазині посеред забігу пасивку не стирає');
const afterBuy = await page.evaluate(() => {
  const g = window.__game;
  g.save.upgrades = {};
  const p = g.level.player;
  p.speedMult = 1.04; p.damageMult = 1.05;
  g.save.coins = 5000;
  g.shop.buy('speed');   // перераховує speedMult з нуля
  g.shop.buy('damage');  // перераховує damageMult з нуля
  g.shop.buy('vest');    // перераховує maxArmor і helmetMult через applyGear
  return {
    speedMult: Math.round(p.speedMult * 1000) / 1000,
    damageMult: Math.round(p.damageMult * 1000) / 1000,
    maxArmor: p.maxArmor,
    helmetMult: Math.round(p.helmetMult * 1000) / 1000,
  };
});
check(afterBuy.speedMult === 1.144, 'після покупки «Швидкість»: 1.1 × 1.04', afterBuy.speedMult);
check(afterBuy.damageMult === 1.208, 'після покупки «Шкода»: 1.15 × 1.05', afterBuy.damageMult);
check(afterBuy.maxArmor === 125 && afterBuy.helmetMult === 0.95,
  'після покупки «Бронежилет»: 50+50+25 броні, шолом-пасивка на місці', JSON.stringify(afterBuy));

console.log('▸ Режим із фіксованим лоадаутом (Нокаут) лишається поза пасивками');
const knockout = await runStats({ liberated: ALL_SIX, start: 'g.startKnockout()' });
check(knockout.knockout, 'Нокаут запустився', JSON.stringify(knockout));
check(knockout.powers === null, 'набір пасивок для кімнатного режиму не збирається', String(knockout.powers));
check(knockout.maxHealth === 100 && knockout.maxArmor === 50, 'Нокаут: HP і броня без пасивок', JSON.stringify(knockout));
check(knockout.speedMult === 1 && knockout.damageMult === 1 && knockout.helmetMult === 1 && knockout.healMult === 1,
  'Нокаут: жодного множника пасивок', JSON.stringify(knockout));

console.log('▸ Профіль «Герой» показує здобуті сили й підказує, за що решта');
const album = await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated = { ESP: true, JPN: true };
  g._albumTab = 'hero';
  g.renderAlbum();
  const pane = document.querySelector('#album-content .album-pane[data-tab="hero"]');
  const cards = [...pane.querySelectorAll('.album-card[data-power]')];
  return {
    total: cards.length,
    revealed: cards.filter((c) => c.classList.contains('revealed')).map((c) => c.dataset.power),
    locked: cards.filter((c) => c.classList.contains('locked')).length,
    hints: cards.filter((c) => c.classList.contains('locked')).every((c) => (c.querySelector('.album-hint')?.textContent || '').length > 0),
    numbers: cards.filter((c) => c.classList.contains('revealed'))
      .every((c) => /[0-9]/.test(c.querySelector('.album-role')?.textContent || '')),
    text: pane.textContent.replace(/\s+/g, ' '),
  };
});
check(album.total === 6, 'у профілі всі шість карток сил країн', album.total);
check(album.revealed.join(',') === 'toro,samurai', 'здобуті — Іспанія й Японія', album.revealed.join(','));
check(album.locked === 4 && album.hints, 'нездобуті — силует + чесна підказка яку країну звільнити', JSON.stringify({ locked: album.locked, hints: album.hints }));
check(album.numbers, 'здобута картка показує ЧИСЛО ефекту, а не лише назву');
check(/2\/6/.test(album.text), 'лічильник 🎖️ 2/6 у профілі');

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 2).join(' | '));
console.log(fail === 0 ? '\n🎉 COUNTRY-POWERS OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await closeTest();
process.exit(fail ? 1 : 0);
