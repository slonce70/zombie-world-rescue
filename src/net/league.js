// 🏆 Ліга рекордів: тонкий клієнт до League DO на zr-relay.
// Усі фейли тихі — гра ніколи не залежить від доступності Ліги.
import { apiBase } from './transport.js';
import { loadNick } from './coop.js';

// високоентропійний резервний cid, якщо crypto.randomUUID недоступний (старі WebView):
// 128 біт із getRandomValues — cid є «паролем» хмарного сейва, тож має бути невгадуваним
function fallbackCid() {
  try {
    const c = globalThis.crypto;
    if (!c || typeof c.getRandomValues !== 'function') throw new Error('no-crypto');
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return 'cid-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return `cid-${Date.now()}-${Math.floor(Math.random() * 1e9)}`; // крайній випадок: crypto немає взагалі
  }
}

// постійний анонімний id гравця (живе в сейві)
export function ensureCid(game) {
  if (!game.save.cid) {
    const c = globalThis.crypto;
    game.save.cid = (c && typeof c.randomUUID === 'function' && c.randomUUID()) || fallbackCid();
    game.saveGame();
  }
  return game.save.cid;
}

export function leagueNick(game) {
  return loadNick() || (game.coop && game.coop.session.nick) || 'Гравець';
}

// надіслати результат; повертає {top, me} або null (офлайн/помилка)
export async function submitScore(game, { mode, country, score, team = [] }) {
  try {
    const res = await fetch(`${apiBase()}/league/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cid: ensureCid(game),
        nick: leagueNick(game),
        mode, country, score, team,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// топ-50 + моє місце; null при помилці
export async function fetchTop(game, mode, country) {
  try {
    const res = await fetch(
      `${apiBase()}/league/top?mode=${mode}&country=${country}&cid=${encodeURIComponent(ensureCid(game))}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}
