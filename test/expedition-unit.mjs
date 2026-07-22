import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const path = new URL('../src/expedition.js', import.meta.url);
const source = readFileSync(path, 'utf8')
  .replace("import { CAMPAIGN_ORDER } from './countries.js';", "const CAMPAIGN_ORDER = ['UKR','POL','DEU','FRA','ESP','PRT','ITA','TUR','SWE','EGY','JPN','CHN','LOST','LAB'];")
  .replace("import { CARD_POOL, cardWeight } from './runbuild.js';", "const CARD_POOL = ['dmg25','nades2','dmgnade','dmg40','nades4','dmg60','boombag','nades6','dmgvamp','spd12','spdheal','spd18','spdfull','spd25','spdjump','jumphi','spdvamp','maxhp25','armor','maxhp40','vamp','maxhp60','shield30','vamp2','fortress'].map((id, i) => ({ id, tag: i < 9 ? 'power' : i < 17 ? 'speed' : 'tank', rarity: 'common' })); const cardWeight = (card, bias) => 6 * (bias && ((bias.tags || []).includes(card.tag) || (bias.ids || []).includes(card.id)) ? 2 : 1);")
  .replace("import { sanitizeSpecialistId, specialistBias } from './specialists.js';", "const sanitizeSpecialistId = (id, fallback = null) => ['guard','medic','scout'].includes(id) ? id : fallback; const specialistBias = (id) => id === 'guard' ? { tags: ['tank'], ids: [], multiplier: 2 } : id === 'scout' ? { tags: ['speed'], ids: [], multiplier: 2 } : id === 'medic' ? { tags: [], ids: ['spdheal','spdfull','dmgvamp','spdvamp','vamp','vamp2'], multiplier: 2 } : null;");

const expedition = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const {
  EXPEDITION_STEPS,
  chooseExpeditionNode,
  completeExpeditionNode,
  createExpedition,
  expeditionLevelConfig,
  sanitizeExpedition,
} = expedition;

test('solo expedition is deterministic, resumable and pays once at the end', () => {
  let run = createExpedition({ seed: 400, countries: ['UKR', 'POL'] });
  assert.equal(run.current.type, 'rescue');
  assert.deepEqual(run, sanitizeExpedition(JSON.parse(JSON.stringify(run))));

  for (let step = 0; step < EXPEDITION_STEPS; step++) {
    const cfg = expeditionLevelConfig(run);
    assert.ok(cfg && cfg.opts.expedition);
    run = completeExpeditionNode(run, { won: true, build: step ? [] : ['dmg25'] });
    if (step < EXPEDITION_STEPS - 1) {
      assert.ok(run.choices.length >= 1);
      run = chooseExpeditionNode(run, run.choices[0].id);
      assert.equal(run.step, step + 1);
    }
  }

  assert.equal(run.status, 'won');
  assert.equal(run.wins, EXPEDITION_STEPS);
  assert.ok(run.reward.coins >= 500);
  assert.equal(run.reward.crystals, 10);
  assert.ok(run.build.includes('dmg25'));
});

test('coop route uses only network-supported nodes and rejects forged state', () => {
  let run = createExpedition({ seed: 401, countries: ['UKR'], coop: true });
  const supported = new Set(['rescue', 'elite', 'defense', 'zone', 'radiation', 'turretwar', 'boss']);
  for (let step = 0; step < EXPEDITION_STEPS - 1; step++) {
    run = completeExpeditionNode(run, { won: true });
    assert.ok(run.choices.every((node) => supported.has(node.type)));
    run = chooseExpeditionNode(run, run.choices.at(-1).id);
  }
  const bad = { ...run, v: 999, build: ['__proto__'], reward: { coins: 99999999 } };
  assert.equal(sanitizeExpedition(bad), null);
  const forgedReward = sanitizeExpedition({ ...run, status: 'failed', wins: 2, reward: { coins: 99999999, crystals: 99 } });
  assert.deepEqual(forgedReward.reward, { coins: 70, crystals: 0, claimed: false });
  assert.equal(chooseExpeditionNode(run, 'forged'), null);
});

test('failed expedition keeps a small earned reward', () => {
  let run = createExpedition({ seed: 402 });
  run = completeExpeditionNode(run, { won: true });
  run = chooseExpeditionNode(run, run.choices[0].id);
  run = completeExpeditionNode(run, { won: false });
  assert.equal(run.status, 'failed');
  assert.equal(run.reward.coins, 35);
  assert.equal(run.reward.crystals, 0);
});

test('v1 solo run migrates to v2 guard without losing progress', () => {
  const old = {
    v: 1, seed: 405, coop: false, countries: ['UKR'], step: 2, wins: 2,
    status: 'active', current: { id: '2-1-rescue-UKR' }, choices: [],
    build: ['dmg25'], reward: { coins: 0, crystals: 0, claimed: false },
  };
  const run = sanitizeExpedition(old);
  assert.equal(run.v, 2);
  assert.equal(run.specialist, 'guard');
  assert.equal(run.step, 2);
  assert.deepEqual(run.build, ['dmg25']);
});

test('co-op run never stores a shared specialist', () => {
  const run = createExpedition({ seed: 406, coop: true, specialist: 'scout' });
  assert.equal(run.specialist, null);
  assert.deepEqual(sanitizeExpedition(run), run);
});
