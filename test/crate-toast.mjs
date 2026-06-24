// Регресія: ящик зі складу (місія «зачисть склад») має показувати РЯДОК-тост, а не код.
// v53+: ESP/PRT/ITA більше НЕ дають зброю за склад — ящик дає МОНЕТИ (вогнемет/лазер тепер за
// зірковий рівень). Перевіряємо: (а) ящик ESP дає монети рядком-тостом без код-витоку;
// (б) ящик країни ЗІ зброєю (DEU → smg) усе ще видає зброю рядком-тостом без витоку.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m) => { console.log((c ? '✅' : '❌') + ' ' + m); if (!c) fail++; };

async function openCrate(country) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?test&fresh`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });
  // форсуємо набір місій із «зачисткою складу» (clear), щоб ящик зі зброєю/скарбом гарантовано був
  await page.evaluate((c) => {
    window.__game.save.liberated = { UKR: true };
    window.__game.test.forceMissions(['rescue', 'repair', 'clear']);
    window.__game.startLevel(c);
  }, country);
  await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const out = await page.evaluate(() => {
    const g = window.__game; const lvl = g.level;
    const reward = lvl.country.weaponReward || null;
    const coinsBefore = g.save.coins;
    const weaponsBefore = (g.save.weapons || []).slice();
    // ловимо РІВНО payload, що йде у bus 'toast' (саме там колись текла функція)
    const bus = [];
    const origEmit = lvl.bus.emit.bind(lvl.bus);
    lvl.bus.emit = (ev, ...a) => { if (ev === 'toast') bus.push({ type: typeof a[0], val: String(a[0]) }); return origEmit(ev, ...a); };
    const m = lvl.missions.missions.find((x) => x && x.type === 'clear');
    if (!m) return { error: 'no clear mission' };
    m.state = 'active';
    lvl.missions.crateReady = true;
    m.crateOpenedT = 0.85;
    lvl.missions._up_clear(m, 0.2, g.input, true); // 0.85+0.2 > 0.9 → видача
    return {
      reward, coinsBefore, coinsAfter: g.save.coins,
      gotWeapon: reward ? (g.save.weapons || []).includes(reward) && !weaponsBefore.includes(reward) : false,
      bus,
    };
  });
  await ctx.close();
  return out;
}

const noLeak = (bus) => !(bus || []).some((t) => t.type === 'function' || /=>|function\s*\(/.test(t.val));

// ── ESP: ящик складу дає МОНЕТИ (зброї немає), тост — рядок, без коду ──
console.log('▸ ESP: ящик складу дає монети (рядок, без коду)');
const esp = await openCrate('ESP');
check(!esp.error, `clear-місія знайдена (${esp.error || 'ok'})`);
check(esp.reward === null, 'ESP не має weaponReward (зброя — за зірковий рівень)');
check(esp.coinsAfter > esp.coinsBefore, `ящик дав монети (${esp.coinsBefore} → ${esp.coinsAfter})`);
check(noLeak(esp.bus), 'у тост НЕ потрапила функція/код');
const coinToast = (esp.bus || []).find((t) => /монет/.test(t.val));
check(coinToast && coinToast.type === 'string', `тост-нагорода — рядок: «${coinToast ? coinToast.val.slice(0, 50) : '—'}»`);

// ── DEU: країна ЗІ зброєю (smg) — ящик видає зброю рядком-тостом, без коду ──
console.log('▸ DEU: ящик складу видає зброю (рядок, без коду)');
const deu = await openCrate('DEU');
check(deu.reward === 'smg', 'DEU усе ще має weaponReward = smg', deu.reward);
check(deu.gotWeapon, 'швидкостріл видано при відкритті ящика');
check(noLeak(deu.bus), 'у тост НЕ потрапила функція/код');

await browser.close();
if (fail) { console.log(`\n❌ ${fail} перевірок впало`); process.exit(1); }
console.log('\n🎉 ЯЩИК ЗІ СКЛАДУ: тост коректний (рядок, без коду)');
