// 🤝 Раннер кооп-релізного ланцюжка (той самий список, що був у package.json).
// Нащо окремий скрипт: на безкоштовному CI-раннері з софтверним рендером гостьову
// вкладку так тротлить, що чесний тест падає разовим таймаутом. Джоб `coop` у CI вже
// довів рецепт: SLOW=4 + один повтор (реальна регресія впаде двічі). Цей раннер дає
// той самий рецепт релізному гейту через env, НЕ міняючи локальний запуск:
//   SLOW  — ПІДЛОГА множника таймаутів (локальний базовий SLOW тесту не занижується);
//   RETRY — скільки повторів після провалу (локально 0: падіння видно одразу).
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

// Базові SLOW — ті, що були в test:coop-release до виносу в раннер.
const CHAIN = [
  { file: 'relay-reconnect.mjs', slow: 1 },
  { file: 'coop-reconnect-guard.mjs', slow: 1 },
  { file: 'coop3.mjs', slow: 4 },
  { file: 'coop-elite.mjs', slow: 2 },
  { file: 'coop-super.mjs', slow: 2 },
  { file: 'coop-stars.mjs', slow: 2 },
  { file: 'coop-draft.mjs', slow: 2 },
  { file: 'coop-friendly-defense.mjs', slow: 2 },
  { file: 'coop-weekly.mjs', slow: 2 },
  { file: 'coop-radiation.mjs', slow: 2 },
  { file: 'coop-turretwar.mjs', slow: 2 },
  { file: 'coop-bonus.mjs', slow: 2 },
  { file: 'coop-worldboss.mjs', slow: 2 },
  { file: 'coop-roles.mjs', slow: 4 },
];

const slowFloor = Math.max(0, parseFloat(process.env.SLOW || '0') || 0);
const retries = Math.max(0, parseInt(process.env.RETRY || '0', 10) || 0);
// НЕ .pathname: кирилиця у шляху (…/Владос/…) стає percent-encoded і модуль не знаходиться
const testUrl = (f) => fileURLToPath(new URL(`./${f}`, import.meta.url));

const failed = [];
for (const { file, slow } of CHAIN) {
  const effSlow = Math.max(slow, slowFloor);
  let ok = false;
  for (let attempt = 0; attempt <= retries && !ok; attempt++) {
    if (attempt > 0) console.log(`\n↻ повтор ${file} (спроба ${attempt + 1}/${retries + 1}) — разовий флейк раннера`);
    console.log(`\n═══ ${file} (SLOW=${effSlow}) ═══`);
    const r = spawnSync(process.execPath, [testUrl(file)], {
      stdio: 'inherit',
      env: { ...process.env, SLOW: String(effSlow) },
    });
    ok = r.status === 0;
  }
  if (!ok) failed.push(file);
}

if (failed.length) {
  console.error(`\n💥 КООП-ГЕЙТ ПРОВАЛЕНО: ${failed.join(', ')}`);
  process.exit(1);
}
console.log('\n🎉 КООП-ГЕЙТ ПРОЙДЕНО ПОВНІСТЮ');
