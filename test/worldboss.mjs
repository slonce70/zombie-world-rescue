import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game, null, { timeout: 30000 });

console.log('▸ Світові боси: моделі');
const expectedSkins = { radiation: 0x78c957, iceGeneral: 0xa8e8ff, mechTitan: 0x9aa3ad };
const modelInfo = await page.evaluate(async () => {
  const mod = await import('/src/characters.js');
  return ['radiation', 'iceGeneral', 'mechTitan'].map((style) => {
    const rig = mod.makeBoss(style);
    return {
      style,
      ok: !!(rig && rig.group && rig.parts && rig.parts.head && rig.parts.torso),
      ztype: rig && rig.ztype,
      scale: rig && rig.spec && rig.spec.scale,
      skin: rig && rig.spec && rig.spec.skin,
      children: rig && rig.group ? rig.group.children.length : 0,
    };
  });
});

for (const m of modelInfo) {
  check(m.ok && m.ztype === 'boss' && m.scale >= 2.7 && m.skin === expectedSkins[m.style],
    `модель ${m.style} створюється саме як новий стиль`, JSON.stringify(m));
}

console.log('▸ Світові боси: конфіг');
const cfgInfo = await page.evaluate(async () => {
  const mod = await import('/src/worldboss.js');
  return {
    ids: mod.WORLD_BOSSES.map((b) => b.id),
    unlocks: Object.fromEntries(mod.WORLD_BOSSES.map((b) => [b.id, b.unlockCountries])),
    rewards: Object.fromEntries(mod.WORLD_BOSSES.map((b) => [b.id, b.reward])),
  };
});
check(JSON.stringify(cfgInfo.ids) === JSON.stringify(['radiation', 'ice', 'titan']),
  'є рівно три світові боси у правильному порядку', JSON.stringify(cfgInfo.ids));
check(cfgInfo.unlocks.radiation === 4 && cfgInfo.unlocks.ice === 8 && cfgInfo.unlocks.titan === 12,
  'відкриття босів: 4 / 8 / 12 країн', JSON.stringify(cfgInfo.unlocks));
check(cfgInfo.rewards.titan.crystals === 25 && cfgInfo.rewards.titan.xp === 900,
  'нагорода Титана задана в конфігу', JSON.stringify(cfgInfo.rewards.titan));

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  failed += errors.length;
}
if (failed) process.exit(1);
