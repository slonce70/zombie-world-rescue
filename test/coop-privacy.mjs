import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let failed = 0;
const check = (ok, msg, x = '') => { console.log(ok ? '  ✅' : '  ❌', msg, x); if (!ok) failed++; };

await page.goto('http://localhost:8741/?test&fresh');
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
await page.click('#btn-coop');
await page.waitForSelector('#overlay-coop.show');
await page.fill('#coop-nick', 'TATO');
await page.click('#btn-coop-nick');

let state = await page.evaluate(() => {
  const c = window.__game.coop;
  c.session.role = 'host';
  c.session.room = 'ABC123';
  return {
    main: document.getElementById('coop-public').checked,
    lobby: document.getElementById('lobby-public').checked,
    announce: c._roomAnnounce(),
  };
});
check(!state.main && !state.lobby, 'fresh coop public checkboxes are off', JSON.stringify(state));
check(state.announce === null, 'fresh host room is not announced publicly', JSON.stringify(state.announce));

await page.check('#coop-public');
state = await page.evaluate(() => {
  const c = window.__game.coop;
  return {
    saved: localStorage.getItem('zr-public'),
    announce: c._roomAnnounce(),
  };
});
check(state.saved === '1' && state.announce?.code === 'ABC123', 'opt-in announces public room', JSON.stringify(state));

await browser.close();
process.exit(failed === 0 ? 0 : 1);
