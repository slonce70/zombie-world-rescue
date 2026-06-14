// Гард синхронізації версій (без браузера, миттєвий): version.json {v} мусить
// дорівнювати APP_VERSION у src/main.js — інакше авто-оновлення тихо не спрацює
// і користувачі застрягнуть на старому білді. Також звіряємо, що PROTO_VERSION існує.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url)); // коректний шлях навіть із не-ASCII теками
let failed = 0;
const check = (cond, msg) => { console.log(cond ? '  ✅' : '  ❌', msg); if (!cond) failed++; };

const versionJson = JSON.parse(readFileSync(root + 'version.json', 'utf8'));
const mainSrc = readFileSync(root + 'src/main.js', 'utf8');
const protoSrc = readFileSync(root + 'src/net/protocol.js', 'utf8');

const appV = Number((mainSrc.match(/const APP_VERSION\s*=\s*(\d+)/) || [])[1]);
const protoV = Number((protoSrc.match(/PROTO_VERSION\s*=\s*(\d+)/) || [])[1]);

console.log(`version.json.v=${versionJson.v}  APP_VERSION=${appV}  PROTO_VERSION=${protoV}`);
check(Number.isInteger(versionJson.v), 'version.json має цілочисельне поле v');
check(Number.isInteger(appV), 'APP_VERSION знайдено у src/main.js');
check(versionJson.v === appV, `version.json.v (${versionJson.v}) === APP_VERSION (${appV}) — авто-оновлення працюватиме`);
check(Number.isInteger(protoV), `PROTO_VERSION визначено (${protoV}) — звіряти при зміні формату повідомлень`);

console.log(failed === 0 ? '\n🎉 ВЕРСІЇ СИНХРОНІЗОВАНІ' : `\n❌ РОЗСИНХРОН ВЕРСІЙ: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
