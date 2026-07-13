import { CAMPAIGN_ORDER } from './countries.js';
import { CARD_POOL } from './runbuild.js';

export const EXPEDITION_VERSION = 1;
export const EXPEDITION_STEPS = 5;

export const EXPEDITION_NODE_TYPES = Object.freeze({
  rescue: { icon: '🚁', name: 'Порятунок', desc: 'Країна, місії та бос' },
  elite: { icon: '👹', name: 'Полювання на еліту', desc: 'Країна з додатковою елітною хвилею' },
  defense: { icon: '🛡️', name: 'Оборона', desc: 'Захисти вежу від хвиль' },
  zone: { icon: '⭕', name: 'Оборона в зоні', desc: 'Втримай позицію разом' },
  portal: { icon: '🌀', name: 'Портали', desc: 'Закрий три портали' },
  radiation: { icon: '☢️', name: 'Радіація', desc: 'Короткий небезпечний бій' },
  turretwar: { icon: '🗼', name: 'Війна турелей', desc: 'Зламай ворожу турель' },
  boss: { icon: '🌋', name: 'Фінальний бос', desc: 'Остання битва експедиції' },
});

const SOLO_STEPS = [
  ['rescue'],
  ['defense', 'portal'],
  ['elite', 'rescue'],
  ['portal', 'defense'],
  ['boss'],
];
const COOP_STEPS = [
  ['rescue'],
  ['defense', 'zone'],
  ['elite', 'rescue'],
  ['radiation', 'turretwar'],
  ['boss'],
];
const CARD_IDS = new Set(CARD_POOL.map((card) => card.id));

const int = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
const hash = (seed, step, branch, salt = 0) => {
  let n = (int(seed) ^ Math.imul(step + 1, 0x9e3779b1) ^ Math.imul(branch + 7, 0x85ebca6b) ^ salt) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d) >>> 0;
  return (n ^ (n >>> 15)) >>> 0;
};

function cleanCountries(value) {
  const list = Array.isArray(value) ? value : CAMPAIGN_ORDER;
  const clean = [...new Set(list.filter((id) => CAMPAIGN_ORDER.includes(id)))];
  return clean.length ? clean : ['UKR'];
}

function cardFor(seed, step, branch, build) {
  const available = CARD_POOL.filter((card) => !build.includes(card.id));
  const pool = available.length ? available : CARD_POOL;
  return pool[hash(seed, step, branch, 0x51ed270b) % pool.length];
}

function makeNode(run, step, branch) {
  const types = (run.coop ? COOP_STEPS : SOLO_STEPS)[step] || ['rescue'];
  const type = types[branch % types.length];
  const country = run.countries[hash(run.seed, step, branch) % run.countries.length];
  const card = step > 0 ? cardFor(run.seed, step, branch, run.build) : null;
  return {
    id: `${step}-${branch}-${type}-${country}`,
    step,
    type,
    country,
    card: card ? card.id : null,
  };
}

function nextChoices(run) {
  const step = run.step + 1;
  const types = (run.coop ? COOP_STEPS : SOLO_STEPS)[step] || [];
  return types.map((_, branch) => makeNode(run, step, branch));
}

export function createExpedition({ seed = Date.now(), countries = CAMPAIGN_ORDER, coop = false } = {}) {
  const run = {
    v: EXPEDITION_VERSION,
    seed: int(seed),
    coop: !!coop,
    countries: cleanCountries(countries),
    step: 0,
    wins: 0,
    status: 'active',
    current: null,
    choices: [],
    build: [],
    reward: { coins: 0, crystals: 0, claimed: false },
  };
  run.current = makeNode(run, 0, 0);
  return run;
}

export function sanitizeExpedition(value) {
  if (!value || typeof value !== 'object' || int(value.v) !== EXPEDITION_VERSION) return null;
  const run = createExpedition({ seed: value.seed, countries: value.countries, coop: value.coop });
  run.step = Math.max(0, Math.min(EXPEDITION_STEPS - 1, int(value.step)));
  run.wins = Math.max(0, Math.min(EXPEDITION_STEPS, int(value.wins)));
  run.build = [...new Set((Array.isArray(value.build) ? value.build : []).filter((id) => CARD_IDS.has(id)))].slice(0, 12);
  run.status = ['active', 'choice', 'won', 'failed'].includes(value.status) ? value.status : 'active';
  if (run.status === 'active') run.wins = run.step;
  if (run.status === 'choice') run.wins = Math.min(EXPEDITION_STEPS - 1, run.step + 1);
  if (run.status === 'won') { run.step = EXPEDITION_STEPS - 1; run.wins = EXPEDITION_STEPS; }
  if (run.status === 'failed') run.wins = Math.min(run.wins, run.step);
  const coins = run.status === 'won' ? 300 + run.wins * 50 : run.status === 'failed' ? run.wins * 35 : 0;
  run.reward = { coins, crystals: run.status === 'won' ? 10 : 0, claimed: !!(value.reward && value.reward.claimed) };
  if (run.status === 'active') run.current = makeNode(run, run.step, Math.max(0, int(value.current && String(value.current.id).split('-')[1])));
  else run.current = null;
  run.choices = run.status === 'choice' ? nextChoices(run) : [];
  return run;
}

export function completeExpeditionNode(value, { won, build = [] } = {}) {
  const run = sanitizeExpedition(value);
  if (!run || run.status !== 'active') return run;
  run.build = [...new Set([...run.build, ...build.filter((id) => CARD_IDS.has(id))])].slice(0, 12);
  run.current = null;
  if (!won) {
    run.status = 'failed';
    run.reward = { coins: run.wins * 35, crystals: 0, claimed: false };
    return run;
  }
  run.wins++;
  if (run.step >= EXPEDITION_STEPS - 1) {
    run.status = 'won';
    run.reward = { coins: 300 + run.wins * 50, crystals: 10, claimed: false };
    return run;
  }
  run.status = 'choice';
  run.choices = nextChoices(run);
  return run;
}

export function chooseExpeditionNode(value, nodeId) {
  const run = sanitizeExpedition(value);
  if (!run || run.status !== 'choice') return null;
  const node = run.choices.find((choice) => choice.id === nodeId);
  if (!node) return null;
  if (node.card && !run.build.includes(node.card)) run.build.push(node.card);
  run.step = node.step;
  run.current = node;
  run.choices = [];
  run.status = 'active';
  return run;
}

export function expeditionLevelConfig(value) {
  const run = sanitizeExpedition(value);
  if (!run || run.status !== 'active' || !run.current) return null;
  const node = run.current;
  const opts = { expedition: run };
  if (node.type === 'defense') opts.defense = run.coop ? 'friendly' : true;
  else if (node.type === 'zone') opts.defense = run.coop ? 'zone-friendly' : 'zone';
  else if (node.type === 'portal') opts.portal = true;
  else if (node.type === 'radiation') opts.radiation = true;
  else if (node.type === 'turretwar') opts.turretwar = true;
  else if (node.type === 'boss') opts.worldBoss = 'radiation';
  return { countryId: ['defense', 'zone', 'portal', 'radiation', 'turretwar', 'boss'].includes(node.type) ? 'UKR' : node.country, opts };
}

export function expeditionCard(cardId) {
  return CARD_POOL.find((card) => card.id === cardId) || null;
}
