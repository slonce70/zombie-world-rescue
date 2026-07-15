// Explicitly opt-in, aggregate-only World Front metrics. No cid, nickname,
// age, free text, precise timestamp or location ever enters the payload.
import { getLang } from '../i18n.js';
import { apiBase } from './transport.js';

export const FRONT_METRICS_KEY = 'zr-front-metrics-opt-in';
export const FRONT_METRIC_EVENTS = new Set([
  'front_open', 'front_start', 'front_complete', 'front_second_start',
  'front_base_visit', 'return_d1', 'return_d7',
]);

export function frontMetricsEnabled(game) {
  if (game && game.params && game.params.get('metrics') === '1') return true;
  try { return localStorage.getItem(FRONT_METRICS_KEY) === '1'; } catch (e) { return false; }
}

export function setFrontMetricsEnabled(enabled) {
  try { localStorage.setItem(FRONT_METRICS_KEY, enabled ? '1' : '0'); } catch (e) { /* private mode */ }
  return !!enabled;
}

function platformClass() {
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (!touch) return 'desktop';
  return Math.min(screen.width || innerWidth, screen.height || innerHeight) >= 600 ? 'tablet' : 'mobile';
}

export function frontMetricPayload(game, event) {
  if (!FRONT_METRIC_EVENTS.has(event)) return null;
  const firstSeen = game && game.save && game.save.front && game.save.front.stats && game.save.front.stats.firstSeenDay;
  const cohort = /^\d{4}-\d{2}-\d{2}$/.test(firstSeen || '') ? firstSeen : new Date().toISOString().slice(0, 10);
  const lang = ['uk', 'en', 'ru'].includes(getLang()) ? getLang() : 'uk';
  return { version: Number(window.__APP_VERSION) || 509, event, cohort, platform: platformClass(), lang };
}

export async function sendFrontMetric(game, event) {
  if (!frontMetricsEnabled(game)) return false;
  const payload = frontMetricPayload(game, event);
  if (!payload) return false;
  try {
    const response = await fetch(`${apiBase()}/front-metrics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (e) {
    return false;
  }
}

export async function sendFrontReturns(game) {
  const front = game && game.save && game.save.front;
  if (!frontMetricsEnabled(game) || !front || !front.stats || !front.stats.firstSeenDay) return;
  const days = Math.floor((Date.now() - Date.parse(`${front.stats.firstSeenDay}T00:00:00Z`)) / 86400000);
  for (const [event, threshold] of [['return_d1', 1], ['return_d7', 7]]) {
    if (days < threshold || front.stats.sent.includes(event)) continue;
    if (!await sendFrontMetric(game, event)) continue;
    front.stats.sent.push(event);
    game.saveGame();
  }
}
