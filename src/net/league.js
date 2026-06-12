// 🏆 Ліга рекордів: тонкий клієнт до League DO на zr-relay.
// Усі фейли тихі — гра ніколи не залежить від доступності Ліги.
import { relayUrl } from './transport.js';
import { loadNick } from './coop.js';

function apiBase() {
  // wss://host → https://host (і ws:// → http:// для локального dev-relay,
  // але dev-relay Ліги не має — тоді запити просто тихо впадуть)
  return relayUrl().replace(/^ws/, 'http').replace(/\/+$/, '');
}

// постійний анонімний id гравця (живе в сейві)
export function ensureCid(game) {
  if (!game.save.cid) {
    game.save.cid = (crypto.randomUUID && crypto.randomUUID()) || `cid-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
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
