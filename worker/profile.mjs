// 📇 Спільна чистка профілю лобі: використовується і Cloudflare-воркером
// (wrangler бандлить цей файл), і dev-relay — щоб правила не розійшлися
// (та сама причина, що й у nick.mjs). Титул видно всьому лобі → фільтруємо
// його як нік (мат → порожньо), а не лише від HTML.
import { cleanTitleSrv } from './nick.mjs';

export function safeInt(v, min, max) {
  v = Math.floor(Number(v) || 0);
  return Math.max(min, Math.min(max, v));
}

export function cleanProfileSrv(nick, raw = {}, ts) {
  return {
    nick,
    countries: safeInt(raw.countries, 0, 99),
    coins: safeInt(raw.coins, 0, 999999),
    crystals: safeInt(raw.crystals, 0, 99999),
    kills: safeInt(raw.kills, 0, 999999),
    star: safeInt(raw.star || 1, 1, 65), // стеля Зоряного шляху (v236)
    prestige: safeInt(raw.prestige, 0, 999),
    title: cleanTitleSrv(raw.title),
    ts,
  };
}
