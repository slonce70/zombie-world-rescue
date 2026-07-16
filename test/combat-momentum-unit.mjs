import { makeCheck } from './_browser.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const srcPath = fileURLToPath(new URL('../src/combatmomentum.js', import.meta.url));
const src = readFileSync(srcPath, 'utf8');
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const { MOMENTUM_TIERS, advanceMomentum, momentumProgress, momentumStats, momentumTier, tickMomentum } = mod;

let failed = 0;
const check = makeCheck(() => failed++);

console.log('▸ Бойовий імпульс: pure rules');
check(MOMENTUM_TIERS.map((x) => x.at).join(',') === '0,5,10,20', 'пороги 0/5/10/20');
check(MOMENTUM_TIERS.every((x, i) => i === 0 || (x.damage >= MOMENTUM_TIERS[i - 1].damage
  && x.speed >= MOMENTUM_TIERS[i - 1].speed && x.fire >= MOMENTUM_TIERS[i - 1].fire)), 'сила порогів не спадає');

const combo = { n: 0, t: 0, best: 0 };
let result;
for (let i = 0; i < 5; i++) result = advanceMomentum(combo);
check(result.tierUp && result.tier === 1, 'x5 відкриває Розігрів');
check(combo.t === 4, 'x5 розширює вікно до 4 секунд', combo.t);
check(momentumStats(combo).fire === 1.15 && momentumStats(combo).speed === 1.1, 'Розігрів дає реальні множники');
for (let i = 5; i < 10; i++) result = advanceMomentum(combo);
check(result.tierUp && momentumTier(combo) === 2, 'x10 відкриває Натиск');
check(momentumStats(combo).damage === 1.25 && momentumStats(combo).reload === 1.25, 'Натиск посилює шкоду й перезарядку');
for (let i = 10; i < 20; i++) result = advanceMomentum(combo);
check(result.tierUp && momentumTier(combo) === 3, 'x20 відкриває Нестримного');
check(momentumStats(combo).damage === 1.5 && momentumStats(combo).fire === 1.4, 'Нестримний має фінальні множники');
check(momentumProgress(combo) === 1, 'свіжа серія має повну шкалу часу');
check(!tickMomentum(combo, 5.9) && combo.n === 20, 'серія живе до завершення 6 секунд');
check(tickMomentum(combo, 0.1) && combo.n === 0 && combo.tier === 0, 'таймер скидає серію й силу');
check(combo.best === 20, 'рекорд не губиться після скидання');

console.log(failed ? `\n❌ Бойовий імпульс: ${failed} помилок` : '\n🎉 БОЙОВИЙ ІМПУЛЬС OK');
process.exit(failed ? 1 : 0);
