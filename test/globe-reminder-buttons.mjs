import { mkdir } from 'node:fs/promises';
import { openBrowserTest } from './_browser.mjs';

const { BASE: base, page, closeTest } = await openBrowserTest({
  launch: { args: ['--use-angle=swiftshader', '--no-sandbox'] },
  context: { viewport: { width: 1280, height: 800 } },
  captureErrors: false,
});

try {
  await page.goto(`${base}/?test&fresh`);
  await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });
  await mkdir('test-results', { recursive: true });

  for (const [button, overlay] of [['gift-chip', 'overlay-gift'], ['camp-quest-chip', 'overlay-campquest']]) {
    await page.evaluate((id) => document.getElementById(id).classList.add('show'), button);
    const hit = await page.evaluate((id) => {
      const el = document.getElementById(id);
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      return { top: document.elementFromPoint(x, y)?.id, x, y };
    }, button);
    if (hit.top !== button) throw new Error(`${button} перекрито елементом ${hit.top}`);
    await page.mouse.click(hit.x, hit.y);
    if (!await page.locator(`#${overlay}`).evaluate((el) => el.classList.contains('show'))) {
      throw new Error(`${button} не відкрив ${overlay}`);
    }
    await page.locator(`#${overlay} .panel-close`).click();
    await page.evaluate((id) => document.getElementById(id).classList.remove('show'), button);
  }

  const blocked = await page.evaluate(() => ['btn-menu', 'btn-moon-globe', 'btn-front', 'btn-solo', 'btn-coop'].filter((id) => {
    const el = document.getElementById(id), r = el.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button') !== el;
  }));
  if (blocked.length) throw new Error(`клік проходить крізь: ${blocked.join(', ')}`);

  await page.evaluate(() => document.getElementById('camp-quest-chip').classList.add('show'));
  await page.screenshot({ path: 'test-results/globe-reminder-buttons.png' });
  console.log('✅ Подарунок дня і Квест табору ловлять клік поверх глобуса');
} finally {
  await closeTest();
}
