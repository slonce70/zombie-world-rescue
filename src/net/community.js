// 🏘️ Операції спільноти: тонкий клієнт до Community DO на zr-relay.
// Усі фейли м'які — редактор, кампанія і старі кооп-режими працюють без мережі.
// CID ніколи не потрапляє в query string: кожен ідентифікований запит — POST.
import { apiBase } from './transport.js';
import { ensureCid } from './league.js';
import { COMMUNITY_MAP_ID_RE } from '../../worker/community-schema.mjs';

export { makeRunId } from './protocol.js';

// {ok:true, …} від воркера або {ok:false, error} — виняток назовні не летить
async function post(path, body) {
  let response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: 'net', status: 0 };
  }
  let data = null;
  try { data = await response.json(); } catch (e) { data = null; }
  if (!response.ok || !data || data.ok !== true) {
    return { ok: false, error: (data && data.error) || 'net', status: response.status };
  }
  return data;
}

export function communityPublish(game, { slot, map, mapSize, mapStyle }) {
  return post('/community/publish', { cid: ensureCid(game), slot, map, mapSize, mapStyle });
}

export function communityUnpublish(game, mapId) {
  return post('/community/unpublish', { cid: ensureCid(game), mapId });
}

export function communityList(game, tab) {
  return post('/community/list', { cid: ensureCid(game), tab });
}

// revision опускаємо повністю (не null) — воркер звіряє точний набір ключів
export function communityMap(game, mapId, revision = null) {
  const body = { cid: ensureCid(game), mapId };
  if (revision != null) body.revision = revision;
  return post('/community/map', body);
}

export function communityRunStart(game, { mapId, revision, runId, coop }) {
  return post('/community/run/start', { cid: ensureCid(game), mapId, revision, runId, coop: !!coop });
}

export function communityComplete(game, { mapId, revision, runId, coop }) {
  return post('/community/complete', { cid: ensureCid(game), mapId, revision, runId, coop: !!coop });
}

export function communityReact(game, { mapId, revision, reaction }) {
  return post('/community/react', { cid: ensureCid(game), mapId, revision, reaction: reaction || null });
}

export function communityReport(game, { mapId, revision, reason }) {
  return post('/community/report', { cid: ensureCid(game), mapId, revision, reason });
}

// ---------- 🔗 точні посилання ----------

// ?community=AB7K2MNP&r=3 → {mapId, revision}; без r — поточна ревізія (revision:null)
export function parseCommunityLink(params) {
  const mapId = params && params.get('community');
  if (!mapId || !COMMUNITY_MAP_ID_RE.test(mapId)) return null;
  const raw = params.get('r');
  if (raw == null || raw === '') return { mapId, revision: null };
  const revision = Number(raw);
  if (!Number.isSafeInteger(revision) || revision <= 0) return null;
  return { mapId, revision };
}

// точне посилання містить лише ID карти й ревізію — ані CID, ані payload
export function communityShareUrl(mapId, revision) {
  return `${location.origin}${location.pathname}?community=${encodeURIComponent(mapId)}&r=${revision}`;
}
