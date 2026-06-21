// Регресія: ящик зі зброєю (місія «зачисть склад») має показувати РЯДОК-тост, а не код.
// Баг: level.bus.emit('toast', country.weaponRewardToast) емітив саму ФУНКЦІЮ → у тост лазив код;
// + показував «Ти отримав…» навіть коли зброя вже була (тоді гравець отримує монети).
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m) => { console.log((c ? '✅' : '❌') + ' ' + m); if (!c) fail++; };

async function openCrate(giveFirst) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?test&fresh&country=ESP`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const out = await page.evaluate((give) => {
    const g = window.__game; const lvl = g.level;
    if (give) g.unlockWeapon('flamethrower'); // вже маємо вогнемет (магазин/повтор)
    const before = (g.save.weapons || []).includes('flamethrower');
    // ловимо РІВНО payload, що йде у bus 'toast' (саме там була функція)
    const bus = [];
    const origEmit = lvl.bus.emit.bind(lvl.bus);
    lvl.bus.emit = (ev, ...a) => { if (ev === 'toast') bus.push({ type: typeof a[0], val: String(a[0]) }); return origEmit(ev, ...a); };
    const m = lvl.missions.missions.find((x) => x && x.type === 'clear');
    if (!m) return { error: 'no clear mission' };
    m.state = 'active';
    lvl.missions.crateReady = true;
    m.crateOpenedT = 0.85;
    lvl.missions._up_clear(m, 0.2, g.input, true); // 0.85+0.2 > 0.9 → видача
    return { before, has: (g.save.weapons || []).includes('flamethrower'), bus };
  }, giveFirst);
  await ctx.close();
  return out;
}

// ── свіжа зброя: має бути РЯДОК-тост «ВОГНЕМЕТ», без коду ──
console.log('▸ Свіжа зброя: тост — рядок, не код');
const fresh = await openCrate(false);
check(!fresh.error, `clear-місія знайдена (${fresh.error || 'ok'})`);
check(fresh.has, 'вогнемет видано при відкритті ящика');
const fnLeak = (fresh.bus || []).some((t) => t.type === 'function' || /=>|function\s*\(/.test(t.val));
check(!fnLeak, 'у тост НЕ потрапила функція/код');
const weaponToast = (fresh.bus || []).find((t) => /ВОГНЕМЕТ/.test(t.val));
check(weaponToast && weaponToast.type === 'string', `тост-нагорода — рядок: «${weaponToast ? weaponToast.val.slice(0, 50) : '—'}»`);

// ── зброя вже є: НЕ показуємо «Ти отримав…», без коду ──
console.log('▸ Зброя вже є: без хибного «Ти отримав…» і без коду');
const owned = await openCrate(true);
const ownedFnLeak = (owned.bus || []).some((t) => t.type === 'function' || /=>|function\s*\(/.test(t.val));
check(!ownedFnLeak, 'у тост НЕ потрапила функція/код (коли зброя вже є)');
const ownedWeaponToast = (owned.bus || []).some((t) => /Ти отримав/.test(t.val));
check(!ownedWeaponToast, 'НЕ показуємо «Ти отримав…», коли зброя вже була (гравець отримує монети)');

await browser.close();
if (fail) { console.log(`\n❌ ${fail} перевірок впало`); process.exit(1); }
console.log('\n🎉 ЯЩИК ЗІ ЗБРОЄЮ: тост коректний (рядок, без коду)');
