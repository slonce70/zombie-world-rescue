// 🛒 ⭐2 «Не купуй нічого в магазині» (v751) у ЖИВІЙ грі.
// До v751 ціль тримався монетний лічильник забігу, тож уся кристалово-радіаційна вітрина
// (бокси, скіни, гаджети, обмін валют, контракт) її не ламала — гравець купував пів магазину
// і все одно отримував зірку. Тепер прапорець забігу level.shopUsed ставиться після БУДЬ-ЯКОЇ
// успішної покупки. Перевіряємо всі чотири валютні шляхи, «чистий» забіг, невдалі спроби
// (включно з першим тапом підтвердження другого ярусу) і те, що прапорець не переживає забіг.
import { openBrowserTest, makeCheck } from './_browser.mjs';

let fail = 0;
const check = makeCheck(() => fail++);
const { BASE, page, errors, closeTest } = await openBrowserTest();

const FULL_BASE = { maxhp: 4, speed: 3, damage: 3, vest: 2, helmet: 1, sneakers: 1 };

await page.goto(`${BASE}/?test&fresh&seed=1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

// Свіжий соло-забіг UKR із форсованою ціллю «не купуй нічого».
// victoryShown вмикаємо ПІСЛЯ старту (його скидає сам _buildLevel) — каскад перемоги
// нам не потрібен, перевіряємо саму ціль.
async function startRun() {
  await page.evaluate(() => {
    const g = window.__game;
    if (g.level) g.endLevel();
    g._forceSecondary = 'noshop';
    g.victoryShown = false;
    g.startLevel('UKR');
  });
  await page.waitForFunction(
    () => window.__game.state === 'level' && window.__game.level
      && !!window.__game.level.player && !!window.__game.level.secondaryObjective,
    null, { timeout: 30000 },
  );
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const g = window.__game;
    g.victoryShown = true;
    return { id: g.test.secondaryState().id, shopUsed: g.level.shopUsed };
  });
}

// Закриваємо магазин, валимо боса і читаємо стан цілі.
// _onBossDied планує _showVictory через 2.4с — даємо таймеру згоріти під victoryShown=true,
// щоб він не сплив уже в наступному забігу (той самий гард, що в test/stars.mjs).
async function bossDied() {
  const res = await page.evaluate(() => {
    const g = window.__game;
    g.shop.close();
    g.level.bus.emit('bossDied', null);
    return { shopUsed: !!g.level.shopUsed, done: g.test.secondaryState().done };
  });
  await page.waitForTimeout(2600);
  return res;
}

// Готує гаманець і купує один товар «як з магазину».
const buy = (id, wallet) => page.evaluate(([wanted, w]) => {
  const g = window.__game;
  g.save.coins = w.coins;
  g.save.crystals = w.crystals;
  g.save.radiationCoins = w.radiation;
  if (w.upgrades) g.save.upgrades = { ...w.upgrades };
  g.shop.open();
  const spentBefore = (g.save.stats && g.save.stats.coinsSpent) | 0;
  g.test.shopBuy(wanted);
  return {
    coins: g.save.coins,
    crystals: g.save.crystals,
    radiation: g.save.radiationCoins || 0,
    shopUsed: !!g.level.shopUsed,
    spentBefore,
    spent: (g.save.stats && g.save.stats.coinsSpent) | 0,
  };
}, [id, wallet]);

// ---------- «чистий» забіг ----------
console.log('▸ Забіг без жодної покупки — ціль виконується');
const clean0 = await startRun();
check(clean0.id === 'noshop', `ціль забігу — саме «не купуй нічого»: ${clean0.id}`);
check(clean0.shopUsed === false, 'свіжий забіг починає з чистим прапорцем', JSON.stringify(clean0));
const clean = await bossDied();
check(!clean.shopUsed && clean.done, 'нічого не купували — ціль зарахована', JSON.stringify(clean));

// ---------- покупка САМЕ за кристали (регресія тікета) ----------
// 🎲 Свідомо НЕ бокс: bigbox/smallbox/mediumbox/megabox/skinbox — лутбокси, і частина
// роллів повертає кристали (у bigbox 27% дають +15 💎, тобто після покупки за 10 💎
// баланс іде ВГОРУ). Такий кейс флакав би 1 прогін із чотирьох. Берем скін Жабка —
// фіксовані 15 💎, нуль монет, нуль радіації і жодного випадкового повернення валюти.
console.log('▸ Покупка тільки за кристали (скін Жабка — 15 💎) ламає ціль');
await startRun();
const skin = await buy('frogskin', { coins: 0, crystals: 15, radiation: 0, upgrades: {} });
check(skin.crystals === 0, `кристали списані рівно за прайсом: 15 → ${skin.crystals}`);
check(skin.coins === 0 && skin.radiation === 0, 'інші валюти не зачеплені', JSON.stringify(skin));
check(skin.shopUsed, 'прапорець забігу піднявся після покупки за кристали', JSON.stringify(skin));
check(skin.spent === skin.spentBefore, 'сумарний coinsSpent сейва не зачеплено — він про монети', JSON.stringify(skin));
const afterSkin = await bossDied();
check(!afterSkin.done, 'ціль НЕ зараховується після покупки за кристали', JSON.stringify(afterSkin));

// ---------- і окремо сам лутбокс: тут перевіряємо лише те, що НЕ залежить від ролла ----------
console.log('▸ Лутбокс за кристали (Великий бокс — 10 💎) ламає ціль за будь-якого ролла');
await startRun();
const box = await buy('bigbox', { coins: 0, crystals: 10, radiation: 0, upgrades: {} });
check(box.shopUsed, 'прапорець піднявся незалежно від того, що випало з бокса', JSON.stringify(box));
const afterBox = await bossDied();
check(!afterBox.done, 'ціль НЕ зараховується після коробки за кристали', JSON.stringify(afterBox));

// ---------- покупка за радіаційні монети ----------
console.log('▸ Покупка за радіаційні монети (контракт — 150 ☢️) ламає ціль');
await startRun();
const contract = await buy('radiationcontract', { coins: 0, crystals: 0, radiation: 150, upgrades: {} });
check(contract.radiation === 0 && contract.crystals === 25, `контракт зданий: 150 ☢️ → 25 💎 (${contract.crystals})`);
check(contract.shopUsed, 'прапорець піднявся після радіаційної покупки', JSON.stringify(contract));
const afterContract = await bossDied();
check(!afterContract.done, 'ціль НЕ зараховується після контракту', JSON.stringify(afterContract));

// ---------- змішана ціна: кристали + радіація ----------
console.log('▸ Покупка за змішану ціну (Набір радіації — 50 💎 + 50 ☢️) ламає ціль');
await startRun();
const mixed = await buy('radiationturretpack', { coins: 0, crystals: 50, radiation: 50, upgrades: {} });
check(mixed.crystals === 0 && mixed.radiation === 0, `списані обидві валюти: ${JSON.stringify(mixed)}`);
check(mixed.shopUsed, 'прапорець піднявся після змішаної покупки', JSON.stringify(mixed));
const afterMixed = await bossDied();
check(!afterMixed.done, 'ціль НЕ зараховується після покупки за дві валюти', JSON.stringify(afterMixed));

// ---------- покупка за монети (як і до v751) ----------
console.log('▸ Покупка за монети ламає ціль, а сумарний coinsSpent сейва живе своїм життям');
await startRun();
const coins = await buy('grenade', { coins: 100, crystals: 0, radiation: 0, upgrades: {} });
check(coins.coins === 65, `35 монет списано: 100 → ${coins.coins}`);
check(coins.spent === coins.spentBefore + 35, `статистика сейва зросла на 35: ${coins.spentBefore} → ${coins.spent}`);
check(coins.shopUsed, 'прапорець піднявся після покупки за монети', JSON.stringify(coins));
const afterCoins = await bossDied();
check(!afterCoins.done, 'ціль НЕ зараховується після покупки за монети', JSON.stringify(afterCoins));

// ---------- усе, що НЕ є покупкою ----------
console.log('▸ Невдалі спроби й перший тап підтвердження ярусу 2 ціль НЕ ламають');
await startRun();
const denied = await page.evaluate((base) => {
  const g = window.__game;
  const steps = [];
  const push = (label) => steps.push({ label, shopUsed: !!g.level.shopUsed });
  g.shop.open();

  g.save.upgrades = {};
  g.save.coins = 0; g.save.crystals = 4; g.save.radiationCoins = 0;
  g.test.shopBuy('smallbox'); push('кристалів 4 із 5');

  // тижневий слот контракту звільняємо — інакше першим спрацював би МАКС, а не гаманець
  g.save.weekly = {};
  g.save.radiationCoins = 149;
  g.test.shopBuy('radiationcontract'); push('радіації 149 зі 150');

  g.save.coins = 199;
  g.test.shopBuy('vest'); push('монет 199 із 200');

  g.save.coins = 50000; g.save.upgrades = { helmet: 1 };
  g.test.shopBuy('helmet'); push('шолом уже МАКС');

  g.save.gadgetsOwned = [];
  g.test.shopBuy('shield-hyper'); push('гіперзаряд без базового гаджета');

  g.test.shopBuy('mapeditorplus'); push('Створювач карт+ без першої країни');

  g.save.crystals = 500; g.save.skins = [];
  g.test.shopBuy('radiationupgrade'); push('радіаційне покращення без скіна');

  const p = g.level.player;
  p.maxArmor = 100; p.armor = 100;
  g.test.shopBuy('armorplate'); push('броня вже повна');

  // ⚠️ ярус 2: перший тап лише переводить картку в «Точно? Тисни ще раз»
  g.save.upgrades = { ...base };
  g.test.shopBuy('t2-carapace'); push('перший тап підтвердження ярусу 2');
  const armed = g.shop._confirmId === 't2-carapace' && !g.save.upgrades['t2-carapace'];

  // напарник по парі закритий назавжди
  g.save.upgrades = { ...base, 't2-carapace': 1 };
  g.shop._confirmId = null;
  g.test.shopBuy('t2-nanoplates'); push('закритий напарник по парі');

  return { steps, armed, coins: g.save.coins };
}, FULL_BASE);
for (const step of denied.steps) check(!step.shopUsed, `${step.label} — прапорець не піднявся`);
check(denied.armed, 'перший тап справді лише озброїв підтвердження, а не купив', JSON.stringify(denied.armed));
check(denied.coins === 50000, `монети за жодну відмову не списані: ${denied.coins}`);
const afterDenied = await bossDied();
check(!afterDenied.shopUsed && afterDenied.done, 'після самих лише відмов ціль зарахована', JSON.stringify(afterDenied));

// ---------- другий тап ярусу 2 — це вже покупка ----------
console.log('▸ Другий тап підтвердження ярусу 2 — це покупка, ціль ламається');
await startRun();
const tier2 = await page.evaluate((base) => {
  const g = window.__game;
  g.save.upgrades = { ...base };
  g.save.coins = 50000;
  g.shop.open();
  g.test.shopBuy('t2-carapace');
  const first = !!g.level.shopUsed;
  g.test.shopBuy('t2-carapace');
  return { first, second: !!g.level.shopUsed, owned: g.save.upgrades['t2-carapace'] || 0, coins: g.save.coins };
}, FULL_BASE);
check(!tier2.first && tier2.second, 'прапорець ставить саме другий тап', JSON.stringify(tier2));
check(tier2.owned === 1 && tier2.coins === 50000 - 3200, `покупка справді відбулась: ${JSON.stringify(tier2)}`);
const afterTier2 = await bossDied();
check(!afterTier2.done, 'ціль НЕ зараховується після покупки другого ярусу', JSON.stringify(afterTier2));

// ---------- прапорець не переживає забіг ----------
console.log('▸ Наступний забіг після «магазинного» починається з чистого аркуша');
const nextRun = await startRun();
check(nextRun.shopUsed === false, 'новий забіг не успадкував прапорець', JSON.stringify(nextRun));
const nextClean = await bossDied();
check(nextClean.done, 'у новому забігу без покупок ціль знову зараховується', JSON.stringify(nextClean));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  fail += errors.length;
}
console.log(fail === 0 ? '🎉 «НЕ КУПУЙ НІЧОГО» ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${fail}`);
await closeTest();
process.exit(fail === 0 ? 0 : 1);
