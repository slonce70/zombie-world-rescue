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

const BASE = 'http://localhost:8741';
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

console.log('coop-nick:', JSON.stringify(r));

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

check(errs.length === 0, 'без помилок сторінки', errs.join(' | '));

await browser.close();
console.log(failed === 0 ? '\n✅ coop-nick: усі перевірки пройдені' : `\n❌ coop-nick: ${failed} провалів`);
process.exit(failed === 0 ? 0 : 1);
