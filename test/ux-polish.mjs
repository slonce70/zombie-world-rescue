import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let failed = 0;
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};

async function waitFor(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true;
    await page.waitForTimeout(200);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}

console.log('▸ UX polish: portrait globe remains playable');
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?test&fresh&touch`, { waitUntil: 'domcontentloaded' });
  await waitFor(page, async () =>
    (await page.evaluate(() => window.__game && window.__game.state)) === 'globe',
  30000, 'globe');
  const state = await page.evaluate(() => {
    const hint = document.getElementById('rotate-hint');
    const solo = document.getElementById('btn-solo');
    return {
      hintDisplay: getComputedStyle(hint).display,
      hintPointerEvents: getComputedStyle(hint).pointerEvents,
      soloTopElement: document.elementFromPoint(
        solo.getBoundingClientRect().left + solo.getBoundingClientRect().width / 2,
        solo.getBoundingClientRect().top + solo.getBoundingClientRect().height / 2
      )?.id,
    };
  });
  check(state.hintDisplay === 'none', 'портретна підказка не блокує глобус до старту рівня', JSON.stringify(state));
  check(state.soloTopElement === 'btn-solo', 'кнопка ГРАТИ доступна для тапа у портреті', JSON.stringify(state));
  await ctx.close();
}

console.log('▸ UX polish: desktop globe title avoids top buttons');
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?test&fresh&lang=uk`, { waitUntil: 'domcontentloaded' });
  await waitFor(page, async () =>
    (await page.evaluate(() => window.__game && window.__game.state)) === 'globe',
  30000, 'globe');
  const hero = await page.evaluate(() => {
    const title = document.querySelector('#globe-ui h1').getBoundingClientRect();
    const menu = document.getElementById('btn-menu').getBoundingClientRect();
    const lang = document.getElementById('btn-lang-globe').getBoundingClientRect();
    return {
      clearOfMenu: title.left >= menu.right + 8,
      clearOfLang: title.right <= lang.left - 8,
      title: { left: title.left, right: title.right },
      menu: { right: menu.right },
      lang: { left: lang.left },
    };
  });
  check(hero.clearOfMenu && hero.clearOfLang, 'desktop заголовок глобуса не залазить під верхні кнопки', JSON.stringify(hero));
  await ctx.close();
}

console.log('▸ UX polish: tiny portrait globe keeps text clear');
{
  const ctx = await browser.newContext({
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?test&fresh&touch&lang=uk`, { waitUntil: 'domcontentloaded' });
  await waitFor(page, async () =>
    (await page.evaluate(() => window.__game && window.__game.state)) === 'globe',
  30000, 'globe');
  const compact = await page.evaluate(() => ({
    subDisplay: getComputedStyle(document.querySelector('.globe-sub')).display,
    hintDisplay: getComputedStyle(document.querySelector('.globe-hint')).display,
    soloTop: document.getElementById('btn-solo').getBoundingClientRect().top,
  }));
  check(compact.subDisplay === 'none' && compact.hintDisplay === 'none',
    'малий portrait не показує текст поверх глобуса', JSON.stringify(compact));
  check(compact.soloTop > 280, 'кнопка ГРАТИ лишається нижче beacon-зони', JSON.stringify(compact));
  await ctx.close();
}

console.log('▸ UX polish: clickable menu items are native buttons');
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?test&fresh&lang=uk`, { waitUntil: 'domcontentloaded' });
  await waitFor(page, async () =>
    (await page.evaluate(() => window.__game && window.__game.state)) === 'globe',
  30000, 'globe');
  await page.click('#btn-solo');
  await page.click('.solo-mode[data-mode="campaign"]');
  const menu = await page.evaluate(() => ({
    soloModesAreButtons: [...document.querySelectorAll('.solo-mode')].every((el) => el.tagName === 'BUTTON'),
    countriesAreButtons: [...document.querySelectorAll('#country-list .country-item')].every((el) => el.tagName === 'BUTTON'),
    countryCount: document.querySelectorAll('#country-list .country-item').length,
  }));
  check(menu.soloModesAreButtons, 'режими у меню ГРАТИ є <button>', JSON.stringify(menu));
  check(menu.countryCount >= 6 && menu.countriesAreButtons, 'країни кампанії є <button>', JSON.stringify(menu));
  await ctx.close();
}

console.log('▸ UX polish: desktop Escape opens pause menu');
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?test&fresh&country=UKR&lang=uk`, { waitUntil: 'domcontentloaded' });
  await waitFor(page, async () =>
    (await page.evaluate(() => window.__game && window.__game.state)) === 'level',
  30000, 'level');
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const pause = await page.evaluate(() => ({
    paused: window.__game.paused,
    visible: document.getElementById('overlay-pause').classList.contains('show'),
  }));
  check(pause.paused && pause.visible, 'Escape відкриває паузу на desktop', JSON.stringify(pause));
  await ctx.close();
}

console.log('▸ UX polish: mobile banner does not cover the live waypoint');
{
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?test&fresh&country=UKR&touch&lang=uk`, { waitUntil: 'domcontentloaded' });
  await waitFor(page, async () =>
    (await page.evaluate(() => window.__game && window.__game.state)) === 'level',
  30000, 'level');
  await page.waitForTimeout(800);
  await page.tap('body', { position: { x: 420, y: 350 } }).catch(() => {});
  await page.waitForTimeout(400);
  const overlap = await page.evaluate(() => {
    const banner = document.getElementById('banner');
    const wp = document.getElementById('waypoint');
    const br = banner.getBoundingClientRect();
    const wr = wp.getBoundingClientRect();
    const visible = (el) => {
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0.05;
    };
    const intersects = visible(banner) && visible(wp)
      && br.left < wr.right && br.right > wr.left && br.top < wr.bottom && br.bottom > wr.top;
    return { intersects, bannerVisible: visible(banner), waypointVisible: visible(wp), br, wr };
  });
  check(!overlap.intersects, 'банер не перекриває waypoint на mobile landscape', JSON.stringify(overlap));

  const centerOverlap = await page.evaluate(() => {
    const banner = document.getElementById('banner');
    const r = banner.getBoundingClientRect();
    const safe = {
      left: innerWidth / 2 - 90,
      right: innerWidth / 2 + 90,
      top: innerHeight / 2 - 55,
      bottom: innerHeight / 2 + 55,
    };
    const cs = getComputedStyle(banner);
    const visible = cs.display !== 'none' && Number(cs.opacity || 1) > 0.05;
    const intersects = visible && r.left < safe.right && r.right > safe.left && r.top < safe.bottom && r.bottom > safe.top;
    return { intersects, r, safe };
  });
  check(!centerOverlap.intersects, 'банер не закриває центр прицілювання на mobile landscape', JSON.stringify(centerOverlap));
  await ctx.close();
}

console.log('▸ UX polish: tiny landscape shop shows a product');
{
  const ctx = await browser.newContext({
    viewport: { width: 568, height: 320 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?test&fresh&country=UKR&touch&lang=uk`, { waitUntil: 'domcontentloaded' });
  await waitFor(page, async () =>
    (await page.evaluate(() => window.__game && window.__game.state)) === 'level',
  30000, 'level');
  await page.click('#tb-shop');
  await page.waitForTimeout(300);
  const shop = await page.evaluate(() => {
    const item = document.querySelector('#shop-grid .shop-item');
    const r = item.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(40, r.height / 2));
    const bottom = document.elementFromPoint(r.left + r.width / 2, r.bottom - 8);
    return {
      top: r.top,
      bottom: r.bottom,
      viewport: innerHeight,
      tappable: !!top && top.closest('.shop-item') === item && !!bottom && bottom.closest('.shop-item') === item,
    };
  });
  check(shop.top >= 0 && shop.bottom <= shop.viewport && shop.tappable,
    'магазин на малому landscape одразу показує товар', JSON.stringify(shop));
  await ctx.close();
}

console.log('▸ UX polish: tiny landscape toast avoids aim center');
{
  const ctx = await browser.newContext({
    viewport: { width: 568, height: 320 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?test&fresh&country=UKR&touch&lang=uk`, { waitUntil: 'domcontentloaded' });
  await waitFor(page, async () =>
    (await page.evaluate(() => window.__game && window.__game.state)) === 'level',
  30000, 'level');
  await page.waitForTimeout(800);
  const toast = await page.evaluate(() => {
    const el = document.querySelector('#toasts .toast.show');
    const title = document.querySelector('#banner-title');
    const visible = el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    const r = visible ? el.getBoundingClientRect() : { left: 0, right: 0, top: 0, bottom: 0 };
    const tr = title.getBoundingClientRect();
    const safe = {
      left: innerWidth / 2 - 90,
      right: innerWidth / 2 + 90,
      top: innerHeight / 2 - 55,
      bottom: innerHeight / 2 + 55,
    };
    const intersects = visible && r.left < safe.right && r.right > safe.left && r.top < safe.bottom && r.bottom > safe.top;
    const titleOverlap = visible && r.left < tr.right && r.right > tr.left && r.top < tr.bottom && r.bottom > tr.top;
    return { visible, intersects, titleOverlap, r, title: tr, safe, text: el ? el.textContent : '' };
  });
  check(!toast.intersects, 'toast не закриває центр прицілювання на малому landscape', JSON.stringify(toast));
  check(!toast.titleOverlap, 'toast не накриває назву країни на малому landscape', JSON.stringify(toast));
  await ctx.close();
}

console.log('▸ UX polish: mobile pause how-to returns to gameplay');
{
  const ctx = await browser.newContext({
    viewport: { width: 568, height: 320 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?test&fresh&country=UKR&touch&lang=uk`, { waitUntil: 'domcontentloaded' });
  await waitFor(page, async () =>
    (await page.evaluate(() => window.__game && window.__game.state)) === 'level',
  30000, 'level');
  await page.click('#tb-pause');
  await page.click('#btn-how-to-play');
  await page.tap('#touch-coach', { position: { x: 300, y: 250 } });
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({
    paused: window.__game.paused,
    coachShow: document.getElementById('touch-coach').classList.contains('show'),
    pauseShow: document.getElementById('overlay-pause').classList.contains('show'),
    visibleOverlays: [...document.querySelectorAll('.overlay.show')].map((el) => el.id),
  }));
  check(!state.paused && !state.coachShow && !state.pauseShow && state.visibleOverlays.length === 0,
    'мобільна підказка з паузи не лишає гру приховано paused', JSON.stringify(state));
  await ctx.close();
}

console.log(failed === 0 ? '🎉 UX POLISH OK' : `💥 UX POLISH FAILURES: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
