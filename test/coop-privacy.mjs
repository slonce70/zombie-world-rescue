import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let failed = 0;
const check = (ok, msg, x = '') => { console.log(ok ? '  ✅' : '  ❌', msg, x); if (!ok) failed++; };

await page.goto('http://localhost:8741/?test&fresh&lang=en');
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
await page.click('#btn-coop');
await page.waitForSelector('#overlay-coop.show');
await page.fill('#coop-nick', 'TATO');
await page.click('#btn-coop-nick');

const profile = await page.evaluate(async () => {
  const { xpForLevel } = await import('/src/progress.js');
  const g = window.__game;
  let xp = 0;
  for (let n = 1; n < 8; n++) xp += xpForLevel(n);
  g.save.xp = xp;
  g.save.diffStar = 4;
  return g.coop.lobbyNet._profile();
});
check(profile.star === 8, 'coop profile sends Star Path level, not difficulty stars', JSON.stringify(profile));

const prestigeProfile = await page.evaluate(async () => {
  const { xpForLevel, PASS_MAX_LEVEL } = await import('/src/progress.js');
  const g = window.__game;
  let xp = 0;
  for (let n = 1; n < PASS_MAX_LEVEL; n++) xp += xpForLevel(n);
  g.save.xp = xp + 1200;
  return g.coop.lobbyNet._profile();
});
check(prestigeProfile.star === 40 && prestigeProfile.prestige === 2,
  'coop profile sends Star Path prestige after max level', JSON.stringify(prestigeProfile));

const prestigeText = await page.evaluate(() => {
  const c = window.__game.coop;
  const data = {
    online: 1,
    today: 1,
    players: ['TATO'],
    profiles: [{ nick: 'TATO', countries: 1, coins: 2, crystals: 3, kills: 4, star: 40, prestige: 2, title: '' }],
    rooms: [],
  };
  c.lobbyNet.data = data;
  c._profileNick = 'TATO';
  c._renderSide(data);
  return document.getElementById('coop-players').innerText;
});
check(/Rescuer Rank 2/.test(prestigeText), 'coop profile localizes prestige rank in English', JSON.stringify(prestigeText));

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
