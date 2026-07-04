import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failed = 0;
const check = (ok, msg, detail = '') => {
  console.log(ok ? '  ✅' : '  ❌', msg, detail);
  if (!ok) failed++;
};

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });
await page.click('#btn-solo');
await page.waitForSelector('#overlay-solo.show', { timeout: 10000 });
await page.click('.solo-mode[data-mode="campaign"]');
await page.waitForSelector('#country-list .country-item[data-id="UKR"] .mission-preview span', { timeout: 10000 });

const preview = await page.evaluate(() => [...document.querySelectorAll('#country-list .country-item[data-id="UKR"] .mission-preview span')].map((el) => el.textContent));
check(preview.join('') === '🆘📡🛡️', 'UKR preview uses story icons', preview.join(''));

await page.evaluate(() => window.__game.startLevel('UKR'));
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
let st = await page.evaluate(() => ({
  kind: window.__game.test.missionKind(),
  ids: window.__game.test.storyObjectiveIds(),
}));
check(st.kind === 'StoryMissions', 'UKR solo campaign uses StoryMissions', JSON.stringify(st));
check(st.ids.join(',') === 'ukr-rescue,ukr-signal,ukr-defense', 'UKR story objective IDs are present', JSON.stringify(st.ids));

await page.evaluate(() => { window.__game.endLevel(); window.__game.startLevel('DEU'); });
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
st = await page.evaluate(() => ({ kind: window.__game.test.missionKind() }));
check(st.kind === 'DynamicMissions', 'DEU keeps DynamicMissions fallback', JSON.stringify(st));

check(errors.length === 0, `no JS errors (${errors.slice(0, 2).join('|')})`);
console.log(failed === 0 ? '✅ story campaign 2 browser selector pass' : `❌ story campaign 2 browser selector failed: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
