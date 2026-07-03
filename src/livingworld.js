const EVENTS = [
  { id: 'survivor', coins: 95, coinsPerStar: 15, xp: 35 },
  { id: 'crate', coins: 120, coinsPerStar: 18, xp: 30 },
  { id: 'goldHorde', coins: 160, coinsPerStar: 20, xp: 40 },
];

function hashEventSeed(countryId, seed, runIndex, missionIndex) {
  let h = (seed + runIndex * 7777 + missionIndex * 131) >>> 0;
  for (let i = 0; i < countryId.length; i++) h = Math.imul(h ^ countryId.charCodeAt(i), 2654435761) >>> 0;
  return h;
}

export function shouldOfferLivingWorld({ countryId, runIndex = 0, missionIndex = 0, modeId = 'campaign' }) {
  return modeId === 'campaign' && countryId !== 'LAB' && !(countryId === 'UKR' && runIndex === 0) && missionIndex > 0;
}

export function pickLivingWorldEvent({ countryId, seed = 1, runIndex = 0, missionIndex = 0 }) {
  const h = hashEventSeed(countryId || '', seed, runIndex, missionIndex);
  return EVENTS[h % EVENTS.length];
}

export function livingWorldReward(id, diffStar = 1) {
  const ev = EVENTS.find((x) => x.id === id) || EVENTS[0];
  const star = Math.max(1, Math.min(5, diffStar || 1));
  return { coins: ev.coins + ev.coinsPerStar * star, xp: ev.xp };
}
