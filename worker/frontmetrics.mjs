export const FRONT_METRIC_EVENTS = new Set([
  'front_open', 'front_start', 'front_complete', 'front_second_start',
  'front_base_visit', 'return_d1', 'return_d7',
]);

export function sanitizeFrontMetric(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'cohort,event,lang,platform,version') return null;
  const event = String(value.event || '');
  const version = Math.max(1, Math.min(9999, Math.trunc(Number(value.version) || 0)));
  const cohort = String(value.cohort || '');
  const platform = String(value.platform || '');
  const lang = String(value.lang || '');
  if (!FRONT_METRIC_EVENTS.has(event) || !/^\d{4}-\d{2}-\d{2}$/.test(cohort)) return null;
  if (!['desktop', 'mobile', 'tablet'].includes(platform) || !['uk', 'en', 'ru'].includes(lang)) return null;
  return { event, version, cohort, platform, lang };
}
