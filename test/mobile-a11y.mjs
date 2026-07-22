import { readFileSync } from 'fs';
import { openBrowserTest, makeCheck } from './_browser.mjs';

const root = new URL('..', import.meta.url);
let failed = 0;
const check = makeCheck(() => failed++);

console.log('▸ Mobile a11y: static PWA and live-region semantics');
const index = readFileSync(new URL('index.html', root), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));

check(/id="banner"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/.test(index),
  'banner exposes polite atomic status semantics');
check(/id="toasts"[^>]*role="status"[^>]*aria-live="polite"/.test(index),
  'toast stack exposes polite status semantics');
check(/id="weapon-wheel"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="weapon-wheel-title"/.test(index),
  'weapon wheel is labelled as a modal dialog');
check(/id="overlay-front"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="front-title"/.test(index),
  'Front is labelled as a modal dialog');
check(/id="overlay-lobby"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="lobby-title"/.test(index),
  'lobby is labelled as a modal dialog');
check(/id="overlay-front-result"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="front-result-title"/.test(index),
  'Front result is labelled as a modal dialog');
for (const id of ['btn-front', 'btn-front-close', 'btn-front-result-primary', 'btn-front-result-end', 'btn-lobby-leave', 'btn-lobby-ready']) {
  check(new RegExp(`<button[^>]*id="${id}"`).test(index), `${id} uses a native button`);
}
check(!/кампанія 6 країн/i.test(manifest.description),
  'manifest description no longer says 6 countries', manifest.description);
check(/12 країн/i.test(manifest.description) && /фінальн/i.test(manifest.description),
  'manifest description reflects current campaign scale', manifest.description);

console.log('▸ Mobile a11y: weapon wheel labels, escape close, focus return');
const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } });

await page.goto(`${BASE}/?test&fresh&touch&country=UKR`);
await page.waitForFunction(() => window.__game && window.__game.state === 'level' && window.__game.touch, null, { timeout: 30000 });
const wheelState = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  for (const id of ['rifle', 'shotgun']) p.giveWeapon(id, false);
  document.getElementById('tb-weapon').focus();
  g.touch._openWheel();
  const buttons = [...document.querySelectorAll('#weapon-wheel-grid .ww-item')];
  const opened = {
    wheelHidden: document.getElementById('weapon-wheel').getAttribute('aria-hidden'),
    activeId: document.activeElement && document.activeElement.dataset.weapon,
    labels: buttons.map((b) => b.getAttribute('aria-label')),
  };
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return {
    ...opened,
    closedHidden: document.getElementById('weapon-wheel').getAttribute('aria-hidden'),
    focusReturned: document.activeElement && document.activeElement.id,
  };
});

check(wheelState.wheelHidden === 'false', 'weapon wheel opens for assistive tech', JSON.stringify(wheelState));
check(wheelState.activeId === 'pistol', 'current weapon receives focus on open', JSON.stringify(wheelState));
check(wheelState.labels.length >= 3 && wheelState.labels.every((s) => /Зброя: .+/.test(s || '')),
  'weapon buttons have explicit aria-labels', JSON.stringify(wheelState.labels));
check(wheelState.closedHidden === 'true', 'Escape closes weapon wheel', JSON.stringify(wheelState));
check(wheelState.focusReturned === 'tb-weapon', 'closing weapon wheel returns focus to trigger', JSON.stringify(wheelState));

console.log('▸ Mobile a11y: Front sheet, touch targets, dialog focus and dismissal');
const coreFlow = await page.evaluate(async () => {
  const game = window.__game;
  game.endLevel();
  const trigger = document.getElementById('btn-front');
  game.save.liberated = { UKR: true, POL: true, DEU: true };
  game.save.front = null;
  game._ensureFront();

  trigger.focus();
  game.openFront();
  const cardStyle = getComputedStyle(document.querySelector('.front-card'));
  const actionStyle = getComputedStyle(document.querySelector('.front-actions'));
  const body = document.querySelector('.front-body');
  const bodyStyle = getComputedStyle(body);
  const scrollbarStyle = getComputedStyle(body, '::-webkit-scrollbar');
  const scrollbarThumbStyle = getComputedStyle(body, '::-webkit-scrollbar-thumb');
  const decision = document.querySelector('.front-op-summary');
  const decisionStyle = getComputedStyle(decision);
  const decisionRect = decision.getBoundingClientRect();
  body.scrollTop = body.scrollHeight;
  const front = {
    focusIn: document.activeElement && document.activeElement.id,
    maxHeight: parseFloat(cardStyle.maxHeight),
    bottomRadius: [cardStyle.borderBottomLeftRadius, cardStyle.borderBottomRightRadius],
    stickyActions: actionStyle.position,
    scrollable: bodyStyle.overflowY,
    overflow: body.scrollHeight > body.clientHeight && body.scrollTop > 0,
    scrollbarWidth: bodyStyle.scrollbarWidth,
    scrollbarColor: bodyStyle.scrollbarColor,
    webkitScrollbarWidth: scrollbarStyle.width,
    scrollbarThumb: scrollbarThumbStyle.backgroundColor,
    scrollAffordance: (bodyStyle.scrollbarWidth === 'thin' || parseFloat(scrollbarStyle.width) > 0)
      && !/rgba\(0, 0, 0, 0\)|transparent/.test(scrollbarThumbStyle.backgroundColor),
    contentWithoutHover: !!decision.textContent.trim() && decisionStyle.display !== 'none'
      && decisionStyle.visibility !== 'hidden' && Number(decisionStyle.opacity) > 0
      && decisionRect.width > 0 && decisionRect.height > 0,
  };
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  front.closed = !document.getElementById('overlay-front').classList.contains('show');
  front.focusOut = document.activeElement && document.activeElement.id;

  trigger.focus();
  game._showFrontResult({ won: true, terminal: true, before: { state: 'attacked' }, after: { state: 'rebuilding' } });
  const resultOverlay = document.getElementById('overlay-front-result');
  const result = { focusIn: document.activeElement && document.activeElement.id };
  resultOverlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  result.backdropKeptOpen = resultOverlay.classList.contains('show');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  result.escapeKeptOpen = resultOverlay.classList.contains('show');
  game._hideOverlay('overlay-front-result');
  result.focusOut = document.activeElement && document.activeElement.id;

  const coop = game.coop;
  const session = coop.session;
  const originalCreate = session.create;
  const originalLeave = session.leave;
  session.create = async () => {
    Object.assign(session, {
      state: 'lobby', role: 'host', room: 'TEST', myPid: 1, mode: 'campaign', countryId: 'UKR',
      roster: new Map([[1, { nick: 'Хост', role: null, skin: 'classic', ready: false }]]),
    });
  };
  session.leave = () => { session.state = 'idle'; session.role = null; session.room = null; session.roster = new Map(); };
  localStorage.setItem('zr-nick', 'Хост');
  const lobbyTrigger = document.getElementById('btn-coop');
  lobbyTrigger.focus();
  lobbyTrigger.click();
  const coopOpened = document.getElementById('overlay-coop').classList.contains('show');
  coop.el.create.focus();
  await coop._create();
  const lobbyChoices = [...document.querySelectorAll('.lobby-role, .lobby-mode, .lobby-country')]
    .filter((element) => getComputedStyle(element).display !== 'none')
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName, id: element.id || element.className, width: rect.width, height: rect.height,
        selected: element.classList.contains('sel'), pressed: element.getAttribute('aria-pressed'),
      };
    });
  const publicRect = document.getElementById('lobby-public-row').getBoundingClientRect();
  const readyRect = document.getElementById('btn-lobby-ready').getBoundingClientRect();
  const lobby = {
    actualTransition: coopOpened && document.getElementById('overlay-lobby').classList.contains('show'),
    focusIn: document.activeElement && document.activeElement.id,
    choices: lobbyChoices,
    targets: [
      ...lobbyChoices,
      { id: 'lobby-public-row', width: publicRect.width, height: publicRect.height },
      { id: 'btn-lobby-ready', width: readyRect.width, height: readyRect.height },
    ],
  };
  const lobbyPublic = document.getElementById('lobby-public');
  lobbyPublic.focus();
  lobbyPublic.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  lobby.closed = !document.getElementById('overlay-lobby').classList.contains('show');
  lobby.focusOut = document.activeElement && document.activeElement.id;
  session.create = originalCreate;
  session.leave = originalLeave;

  game.openFront();
  const targets = ['#btn-front', '#btn-solo', '#btn-coop', '#btn-front-close', '.front-operation-choice', '.front-choice', '.front-actions .btn']
    .flatMap((selector) => [...document.querySelectorAll(selector)])
    .filter((element) => !element.hidden && getComputedStyle(element).display !== 'none')
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.id || element.className, width: rect.width, height: rect.height };
    });
  game.frontui.close();
  return { front, result, lobby, targets };
});

check(coreFlow.front.focusIn === 'btn-front-close' && coreFlow.front.closed && coreFlow.front.focusOut === 'btn-front',
  'Front receives focus, closes with Escape, and restores its trigger', JSON.stringify(coreFlow.front));
check(coreFlow.front.maxHeight <= 844 * 0.72 + 1 && coreFlow.front.bottomRadius.every((radius) => radius === '0px')
    && coreFlow.front.stickyActions === 'sticky' && coreFlow.front.scrollable === 'auto'
    && coreFlow.front.overflow && coreFlow.front.scrollAffordance,
  'Front is a 72dvh bottom sheet with sticky actions and a visible working scroll affordance', JSON.stringify(coreFlow.front));
check(coreFlow.front.contentWithoutHover, 'Front country decision copy has visible geometry without hover');
check(coreFlow.result.focusIn === 'btn-front-result-primary' && coreFlow.result.backdropKeptOpen
    && coreFlow.result.escapeKeptOpen && coreFlow.result.focusOut === 'btn-front',
  'result requires an explicit decision and restores focus', JSON.stringify(coreFlow.result));
check(coreFlow.lobby.actualTransition && coreFlow.lobby.focusIn === 'btn-lobby-leave'
    && coreFlow.lobby.closed && coreFlow.lobby.focusOut === 'btn-coop',
  'actual co-op create transition focuses lobby, closes from its checkbox with Escape, and restores btn-coop', JSON.stringify(coreFlow.lobby));
check(coreFlow.lobby.choices.every(({ tag }) => tag === 'BUTTON'),
  'lobby choices use native buttons', JSON.stringify(coreFlow.lobby.choices));
check(coreFlow.lobby.choices.filter(({ id }) => /lobby-(mode|country)/.test(id))
    .every(({ selected, pressed }) => pressed === String(selected)),
  'lobby mode and country buttons expose selection through aria-pressed', JSON.stringify(coreFlow.lobby.choices));
const shortTargets = coreFlow.targets.filter(({ width, height }) => width < 44 || height < 44);
const shortLobbyTargets = coreFlow.lobby.targets.filter(({ width, height }) => width < 44 || height < 44);
check(coreFlow.targets.length > 5 && shortTargets.length === 0 && shortLobbyTargets.length === 0,
  'new globe, Front, and lobby controls are at least 44×44 CSS pixels', JSON.stringify([...shortTargets, ...shortLobbyTargets]));

const realErrors = errors.filter((e) => !/Failed to load resource|status of \d{3}|net::|ERR_/i.test(e));
check(realErrors.length === 0, `без JS-помилок консолі (${realErrors.length})`, realErrors.slice(0, 2).join('|'));

await closeTest();
console.log(failed === 0 ? '🎉 MOBILE A11Y OK' : `❌ MOBILE A11Y FAILURES: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
