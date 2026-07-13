import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRONT_METRIC_EVENTS, sanitizeFrontMetric } from '../worker/frontmetrics.mjs';

const valid = {
  version: 500,
  event: 'front_start',
  cohort: '2026-07-13',
  platform: 'mobile',
  lang: 'uk',
};

test('only the documented aggregate events and fields are accepted', () => {
  assert.equal(FRONT_METRIC_EVENTS.size, 7);
  assert.deepEqual(sanitizeFrontMetric(valid), valid);
  assert.equal(sanitizeFrontMetric({ ...valid, event: 'free_text' }), null);
  assert.equal(sanitizeFrontMetric({ ...valid, cid: 'forbidden' }), null);
  assert.equal(sanitizeFrontMetric({ ...valid, exactTime: Date.now() }), null);
  assert.equal(sanitizeFrontMetric({ ...valid, platform: 'iphone-15-pro' }), null);
});

test('worker endpoint keeps body and rate limits and persists counters only', () => {
  const source = readFileSync(new URL('../worker/relay-worker.js', import.meta.url), 'utf8');
  assert.match(source, /length > 512/);
  assert.match(source, /row\.n <= 20/);
  assert.match(source, /origin !== FRONT_METRICS_CORS/);
  assert.match(source, /FRONT_METRICS_CORS = SAVE_CORS/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS counters/);
  assert.doesNotMatch(source, /counters \([\s\S]{0,500}\bcid\b/);
  assert.doesNotMatch(source, /counters \([\s\S]{0,500}\bnick\b/);
  assert.doesNotMatch(source, /counters \([\s\S]{0,500}\bts\b/);
});
