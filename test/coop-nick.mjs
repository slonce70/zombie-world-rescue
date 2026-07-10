// 🧼 F37 — безпека дітей: грубий нік у коопі санітизується, нормальний проходить.
//
// ПІДХІД. Клієнтський cleanNick живе в src/net/coop.js, який тягне браузерні
// модулі (i18n, transport, Three.js-залежності) → у голому node він не
// імпортується. Тому ми відкриваємо реальну сторінку гри в Playwright і
// ДИНАМІЧНО import() справжні модулі В БРАУЗЕРНОМУ КОНТЕКСТІ. Це одночасно
// доводить, що ESM-імпорт `nickIsBad` з worker/nick.mjs у браузері справді
// працює (F37, крок 1), і що cleanNick підміняє лайку на «Гравець».
// Хостовий шлях (coop.js _hostHello: `if (nickIsBad(nick)) nick='Гравець'`)
// і UI-відмову (_acceptNick) перевіряємо через ту саму функцію nickIsBad,
// бо повний 2-вкладковий relay-сценарій заради одного поля ростера — надмірний.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
let failed = 0;
const check = (ok, msg, extra = '') => {
  console.log(ok ? '  ✅' : '  ❌', msg, extra);
  if (!ok) failed++;
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(BASE + '/?test&fresh');
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });

// у браузері динамічно вантажимо РЕАЛЬНІ модулі (той самий шлях, що в коді гри)
const r = await page.evaluate(async () => {
  const coop = await import('/src/net/coop.js');
  const nick = await import('/worker/nick.mjs');
  return {
    importedClean: typeof coop.cleanNick === 'function',
    importedBad: typeof nick.nickIsBad === 'function',
    // нормальні ніки — проходять як є
    good_vlad: coop.cleanNick('Влад'),
    good_max: coop.cleanNick('Max'),
    good_player7: coop.cleanNick('Player7'),
    // груба лайка ≤12 укр/рос/англ — має стати «Гравець»
    bad_en: coop.cleanNick('fuck'),
    bad_ru: coop.cleanNick('suka'),
    bad_uk: coop.cleanNick('хуйло'),
    bad_leet: coop.cleanNick('b1tch'),      // leet-підміна 1→i, яку фільтр нормалізує
    // прямий контроль фільтра (хостовий шлях / UI-відмова спираються на нього)
    isBad_bitch: nick.nickIsBad('bitch'),
    isBad_good: nick.nickIsBad('Влад'),
  };
});

// 🛡️ v306: гість чистить welcome/roster від хоста (модифікований хост-клієнт
// не може показати дітям лайку чи сміттєву роль) + титул профілю фільтрується
// на сервері як нік (worker/profile.mjs → cleanTitleSrv).
const r2 = await page.evaluate(async () => {
  const coop = await import('/src/net/coop.js');
  const prof = await import('/worker/profile.mjs');
  const nick = await import('/worker/nick.mjs');
  const s = new coop.CoopSession({});
  // гість (role=null → гілка else) отримує welcome зі зловмисним ростером
  s._onMessage(1, { t: 'welcome', pid: 2, roster: [{ pid: 1, nick: 'b1tch', role: 'hax', skin: 'classic' }] });
  const w = s.roster.get(1) || {};
  // ...і пізніший roster-бродкаст
  s._onMessage(1, { t: 'roster', list: [{ pid: 1, nick: 'сука', role: 'guard' }, { pid: 3, nick: 'Оля' }] });
  const b = s.roster.get(1) || {};
  const ok = s.roster.get(3) || {};
  const p = prof.cleanProfileSrv('Влад', { title: 'xyi <b>лол</b>', coins: 1e9 }, 0);
  const pOk = prof.cleanProfileSrv('Влад', { title: 'Рятівник Світу' }, 0);
  // HTML-стрип на ЧИСТОМУ титулі (лайка не маскує відсутність стрипу) + стеля 24
  const pHtml = prof.cleanProfileSrv('Влад', { title: '<b>Герой</b> Дня' }, 0);
  const pLong = prof.cleanProfileSrv('Влад', { title: 'Дуже довгий титул на тридцять+' }, 0);
  // 🧩 еквівалентність клієнт/сервер на «брудному» вході — головна мета normNick
  const messy = '  Player   Seven777  ';
  const eq = {
    client: coop.cleanNick(messy),
    server: nick.cleanNickSrv(messy),
    norm: nick.normNick(messy),
  };
  // 🛡️ welcome/roster без масиву — гість не має падати (гард || [])
  const s2 = new coop.CoopSession({});
  let emptyOk = true, emptySize = -1;
  try {
    s2._onMessage(1, { t: 'welcome', pid: 9 });
    s2._onMessage(1, { t: 'roster' });
    emptySize = s2.roster.size;
  } catch (e) { emptyOk = false; }
  // 🔁 інваріант дедупу хоста: суфікс « (2)» у межах стелі 12 має пережити
  // повторний cleanNick на гості (регресія: «Володимир123 (2)» різалась у кашу)
  const dedupSurvives = coop.cleanNick('Володими (2)');
  return {
    dedupSurvives,
    welcomeNick: w.nick, welcomeRole: w.role, welcomeSkin: w.skin,
    rosterNick: b.nick, rosterRoleKept: b.role, rosterOkNick: ok.nick,
    titleBad: p.title, coinsClamped: p.coins, titleOk: pOk.title,
    titleHtml: pHtml.title, titleLongLen: pLong.title.length,
    eq, emptyOk, emptySize,
  };
});

console.log('coop-nick:', JSON.stringify(r), JSON.stringify(r2));

check(r.importedClean, 'браузер імпортує cleanNick із src/net/coop.js');
check(r.importedBad, 'браузер імпортує nickIsBad із worker/nick.mjs (ESM у браузері)');

check(r.good_vlad === 'Влад', 'нормальний нік «Влад» проходить', r.good_vlad);
check(r.good_max === 'Max', 'нормальний нік «Max» проходить', r.good_max);
check(r.good_player7 === 'Player7', 'нормальний нік «Player7» проходить', r.good_player7);

check(r.bad_en === 'Гравець', 'англ. лайка → «Гравець»', r.bad_en);
check(r.bad_ru === 'Гравець', 'рос. лайка → «Гравець»', r.bad_ru);
check(r.bad_uk === 'Гравець', 'укр. лайка → «Гравець»', r.bad_uk);
check(r.bad_leet === 'Гравець', 'leet-обхід (b1tch) → «Гравець»', r.bad_leet);

check(r.isBad_bitch === true, 'nickIsBad ловить лайку (хост/UI шлях)', String(r.isBad_bitch));
check(r.isBad_good === false, 'nickIsBad пропускає нормальний нік', String(r.isBad_good));

check(r2.welcomeNick === 'Гравець', 'гість: лайка у welcome-ростері → «Гравець»', r2.welcomeNick);
check(r2.welcomeRole === null, 'гість: сміттєва роль з мережі → null', String(r2.welcomeRole));
check(r2.welcomeSkin === 'classic', 'гість: решта полів ростера не зачеплені', r2.welcomeSkin);
check(r2.rosterNick === 'Гравець', 'гість: лайка у roster-бродкасті → «Гравець»', r2.rosterNick);
check(r2.rosterRoleKept === 'guard', 'гість: валідна роль проходить', String(r2.rosterRoleKept));
check(r2.rosterOkNick === 'Оля', 'гість: нормальний нік у ростері проходить', r2.rosterOkNick);
check(r2.titleBad === '', 'сервер: лайка у титулі профілю → порожньо', JSON.stringify(r2.titleBad));
check(r2.titleOk === 'Рятівник Світу', 'сервер: нормальний титул проходить', r2.titleOk);
check(r2.titleHtml === 'Герой Дня', 'сервер: HTML стрипається з чистого титулу', JSON.stringify(r2.titleHtml));
check(r2.titleLongLen <= 24, 'сервер: титул обрізається до 24', String(r2.titleLongLen));
check(r2.coinsClamped === 999999, 'сервер: coins клампиться стелею', String(r2.coinsClamped));
check(r2.eq.client === r2.eq.server && r2.eq.client === r2.eq.norm && r2.eq.norm.length <= 12,
  'normNick: клієнт і сервер нормалізують однаково (брудний вхід)', JSON.stringify(r2.eq));
check(r2.emptyOk && r2.emptySize === 0, 'гість: welcome/roster без масиву не валить клієнт', `ok=${r2.emptyOk} size=${r2.emptySize}`);
check(r2.dedupSurvives === 'Володими (2)', 'дедуп-суфікс хоста у бюджеті 12 переживає cleanNick гостя', r2.dedupSurvives);

check(errs.length === 0, 'без помилок сторінки', errs.join(' | '));

await browser.close();
closeServer();
console.log(failed === 0 ? '\n✅ coop-nick: усі перевірки пройдені' : `\n❌ coop-nick: ${failed} провалів`);
process.exit(failed === 0 ? 0 : 1);
