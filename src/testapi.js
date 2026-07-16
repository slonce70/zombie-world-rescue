// 🧪 API для автотестів: інтроспекція стану + детермінізм/форс-хуки режимів.
// v305: винесено ВЕРБАТИМ із src/main.js (геттер get test()) — `const g = this` → `const g = game`.
import { liberatedIds } from './net/cloudsave.js';
import { GADGETS } from './extras.js';
import { starTotal } from './stars.js';
import { WEAPONS } from './player.js';
import { SOUL_COLLECTOR_UNLOCK_LEVEL } from './souls.js';
import { rollMissionSet, MISSION_TYPES } from './missionpool.js';
import { t } from './i18n.js';

export function buildTestApi(game) {
  const g = game;
  return {
    state: () => ({
      state: g.state,
      coins: g.save.coins,
      crystals: g.save.crystals || 0,
      fps: g.fps,
      country: g.level ? g.level.countryId : null,
      grenades: g.level ? g.level.player.grenades : 0,
      combo: g.level ? g.level.combo.n : 0,
      momentum: g.level ? { tier: g.level.combo.tier || 0, time: g.level.combo.t || 0 } : null,
      liberated: liberatedIds(g.save.liberated),
      player: g.level ? {
        x: g.level.player.pos.x, y: g.level.player.pos.y, z: g.level.player.pos.z,
        health: g.level.player.health, weapons: g.level.player.weapons, cur: g.level.player.cur,
        firstPerson: g.level.player.firstPerson,
        armor: g.level.player.armor, maxArmor: g.level.player.maxArmor,
        buffs: { ...g.level.player.buffs },
        superPower: g.level.player.superPower ? { ...g.level.player.superPower } : null,
        rockets: g.level.player.ammo.bazooka.reserve + g.level.player.ammo.bazooka.mag,
      } : null,
      superPickup: g.level && g.level.superPickup && !g.level.superPickup.done
        ? { type: g.level.superPickup.type, x: g.level.superPickup.x, z: g.level.superPickup.z } : null,
      superSpawned: g.level ? !!g.level.superSpawned : false,
      // id — стабільні назви слотів (сумісність зі старими тестами), type — справжній тип
      missions: g.level ? g.level.missions.missions.map((m, i) => ({
        id: ['rescue', 'tower', 'warehouse'][i] || m.id, type: m.type || m.id, state: m.state,
      })) : null,
      missionRuns: { ...g.save.missionRuns },
      bossStarted: g.level ? g.level.missions.bossStarted : false,
      bossHp: g.level && g.level.zombies.boss ? g.level.zombies.boss.hp : null,
      zombies: g.level ? g.level.zombies.list.filter((z) => z.state !== 'dead').length : 0,
      hordeActive: g.level ? g.level.zombies.hordeActive : false,
      stats: g.level ? g.level.stats : null,
      victoryShown: g.victoryShown,
      // оновлення 4
      xp: g.save.xp,
      passLevel: g.progress.level,
      skins: [...g.save.skins],
      dances: [...g.save.dances],
      activeSkin: g.save.activeSkin,
      activeDance: g.save.activeDance,
      gadgets: { owned: [...g.save.gadgetsOwned], active: g.save.activeGadget, cd: g.level ? g.level.gadgets.cd : 0 },
      gadgetShield: g.level ? g.level.player.gadgetShield : 0,
      scoped: g.level ? g.level.player.scoped : false,
      rideSpeed: g.level ? g.level.player.rideSpeed : 0,
      megaPity: g.save.megaPity,
      souls: g.save.souls || 0,
      soulLevel: g.save.soulLevel || 1,
      radiationCoins: g.save.radiationCoins || 0,
      cloneSkins: [...(g.save.cloneSkins || [])],
      activeCloneSkin: g.save.activeCloneSkin || 'ninja',
      quests: g.quests.list.map((q) => ({ id: q.id, ev: q.ev, progress: q.progress, target: q.target, done: q.done })),
      megaQuests: g.quests.megaList.map((q) => ({ id: q.id, ev: q.ev, progress: q.progress, target: q.target, done: q.done })),
      megabox: g.level && g.level.megabox ? { x: g.level.megabox.x, z: g.level.megabox.z, opened: g.level.megabox.opened } : null,
      pet: g.level ? !!g.level.pet : false,
      activePet: g.save.activePet || null,
      pets: [...(g.save.pets || [])],
      riding: g.level ? !!g.level.player.riding : false,
      emoting: g.level ? g.level.player.emoting : null,
      scooters: g.level ? g.level.vehicles.list.map((r) => ({ x: r.x, z: r.z })) : [],
      walls: g.level ? g.level.gadgets.walls.map((w) => ({ x: w.x, z: w.z, hp: w.hp })) : [],
      tramps: g.level ? g.level.gadgets.tramps.length : 0,
      jumpPads: g.level ? g.level.world.jumpPads.length : 0,
      nightK: g.level ? Math.round((g.level.nightK || 0) * 100) / 100 : 0,
      storm: g.level && g.level.storm ? {
        wave: g.level.storm.wave, r: g.level.storm.r,
        outside: g.level.storm.isOutside(), over: g.level.storm.over,
        phase: g.level.storm.phase,
      } : null,
      worldBoss: g.level && g.level.worldBoss ? {
        id: g.level.worldBoss.id,
        over: g.level.worldBoss.over,
        bossHp: g.level.zombies.boss ? g.level.zombies.boss.hp : null,
        shield: !!(g.level.zombies.boss && g.level.zombies.boss.worldBossShield),
        coreOpen: !!(g.level.zombies.boss && g.level.zombies.boss.worldBossCoreOpen),
        hazards: g.level.worldBoss.hazards.length,
      } : null,
      stormBest: { ...g.save.stormBest },
      worldBosses: { ...(g.save.worldBosses || {}) },
    }),
    playgroundSelectGadget: (id) => {
      if (g.level && g.level.playground && GADGETS[id]) {
        g.level.playgroundGadget = id;
        g._startGadgetChallenge(g.level, id);
      }
    },
    setLevelTime: (t) => { g.level.stats.time = t; },
    teleport: (x, z) => {
      const p = g.level.player;
      const dungeonFloor = g.level.world.castleDungeon?.open
        ? g.level.world.castleDungeon.floorHeightAt(x, z)
        : null;
      p.inCastleDungeon = dungeonFloor !== null && dungeonFloor !== undefined;
      p.pos.set(x, p.inCastleDungeon ? dungeonFloor : g.level.world.groundH(x, z), z);
      p.vel.set(0, 0, 0);
    },
    setAim: (yaw, pitch) => {
      g.level.player.yaw = yaw;
      g.level.player.pitch = pitch;
    },
    aimAtNearestZombie: () => {
      const p = g.level.player;
      let best = null, bd = 1e9;
      for (const z of g.level.zombies.list) {
        if (z.state === 'dead') continue;
        const d = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
        if (d < bd) { bd = d; best = z; }
      }
      if (!best) return null;
      const dx = best.x - p.pos.x, dz = best.z - p.pos.z;
      p.yaw = Math.atan2(-dx, -dz);
      const eyeY = p.pos.y + 1.62;
      const targetY = best.y + best.rig.height * 0.55;
      p.pitch = Math.atan2(targetY - eyeY, Math.hypot(dx, dz));
      return bd;
    },
    key: (code, down) => {
      if (down) { g.input.keys.add(code); g.input.justPressed.add(code); }
      else g.input.keys.delete(code);
    },
    mouse: (down) => {
      g.input.mouseDown = down;
      if (down) g.input.justClicked = true;
    },
    god: () => { g.level.player.respawnProtect = 1e9; },
    giveCoins: (n) => g.level.addCoins(n),
    giveWeapon: (id) => g.unlockWeapon(id),
    throwGrenade: () => g.level.player.throwGrenade(),
    spawnZombie: (type, x, z) => g.level.zombies.spawn(type, x, z, {}),
    airdropNow: () => { g.level.effects.airdropT = 0.05; },
    shopBuy: (id) => g.shop.buy(id),
    killZombiesNear: (x, z, r) => {
      for (const zb of [...g.level.zombies.list]) {
        if (zb.state !== 'dead' && Math.hypot(zb.x - x, zb.z - z) < r) {
          zb.damage(99999, null, false);
        }
      }
    },
    completeMission: (id) => g.level.missions._complete(id),
    // ⭐ R3 «Зірки та милосердя»: інтроспекція + детермінізм для тестів
    forceSecondary: (id) => { g._forceSecondary = id; }, // форс типу вторинної цілі на наступний старт
    secondaryState: () => {
      const so = g.level && g.level.secondaryObjective;
      return so ? { id: so.id, ev: so.ev, target: so.target, progress: so.progress, done: so.done, label: so.label() } : null;
    },
    // ⭐ v298 «Зірки разом»: форс виконання КОМАНДНОЇ цілі на ХОСТІ (як соло-тести форсять
    // secondaryObjective.done). Хост доганяє прогрес до target через _bumpSecondary → шле `soc`.
    // На гості (mirror) — no-op: прогрес авторитетний у хоста.
    forceSecondaryDone: () => {
      const level = g.level;
      const so = level && level.secondaryObjective;
      if (!so || (level.net && !level.net.authority)) return false;
      g._bumpSecondary(level, so.ev, so.target);
      return so.done;
    },
    starState: () => ({
      stars: { ...(g.save.stars || {}) },
      total: starTotal(g.save),
      claims: [...(g.save.starClaims || [])],
    }),
    mercyState: () => ({
      deaths: g.save.mercyDeaths ? { ...g.save.mercyDeaths } : null,
      active: !!(g.level && g.level.mercy),   // ЖИВИЙ модифікатор на поточному рівні
      mercy: g.level && g.level.mercy ? { ...g.level.mercy } : null,
    }),
    // 🌟 супер-пікап: детермінований тип для тестів + примусовий спавн/грабіж
    forceSuperPower: (type) => { g._forceSuperPower = type; },
    spawnSuper: () => { if (g.level) g._trySuperPickup(g.level); return !!(g.level && g.level.superPickup); },
    grabSuper: () => { if (g.level && g.level.superPickup) { g.level.superPickup.grab(); return true; } return false; },
    superState: () => (g.level && g.level.player.superPower ? { ...g.level.player.superPower } : null),
    // 👹 v296: форс елітної хвилі на ХОСТІ — телеграф (банер+стінгер+ev `ew`) і 2–4 еліти.
    // Гість бачить хвилю через onZombieSpawn (zs з o.e) і `ew`; на гості — no-op.
    forceEliteWave: () => {
      const level = g.level;
      if (level.net && !level.net.authority) return 0;
      level.missions.telegraphEliteWave(); // банер+стінгер+ev — той самий шлях, що _complete
      return level.zombies.spawnEliteWave().length;
    },
    finishHorde: () => {
      const zm = g.level.zombies;
      if (g.level.missions) g.level.missions.pendingHorde = null;
      zm.hordePending = 0;
      for (const zb of [...zm.list]) {
        if (zb.horde && zb.state !== 'dead') zb.damage(99999, null, false);
      }
      zm.hordeRemaining = 0;
      zm.hordeActive = false;
    },
    damageBoss: (amt) => {
      if (g.level.zombies.boss) g.level.zombies.boss.damage(amt, null, false);
    },
    // оновлення 4
    addXp: (n) => g.progress.addXp(n),
    megaForce: (roll) => { g._megaForce = roll; },
    unlockGadget: (id) => {
      if (!g.save.gadgetsOwned.includes(id)) g.save.gadgetsOwned.push(id);
      g.save.activeGadget = id;
      g.saveGame();
    },
    useGadget: () => g.level.gadgets.use(),
    gadgetCdReset: () => { g.level.gadgets.cd = 0; },
    dance: () => g.level.player.emote(),
    stopDance: () => g.level.player.stopEmote(),
    mountScooter: (i = 0) => {
      const r = g.level.vehicles.list[i];
      g.test.teleport(r.x + 1, r.z);
      g.level.vehicles.mount(r);
    },
    dismountScooter: () => g.level.vehicles.dismount(),
    startStorm: (c) => g.startStorm(c),
    // 🌪️ піщана буря EGY: форс-старт + інтроспекція стану для тестів
    sandstormState: () => (g.level && g.level.sandstorm ? g.level.sandstorm.state() : null),
    startArena: () => g.startArena(),
    startKnockout: () => g.startKnockout(),
    startOverloadedKnockout: () => {
      g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true };
      return g.startOverloadedKnockout();
    },
    startDefense: () => {
      g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true };
      return g.startDefense();
    },
    startOverloadedDefense: () => {
      g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true };
      return g.startOverloadedDefense();
    },
    startZoneDefense: () => {
      g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true };
      return g.startZoneDefense();
    },
    startPvp: () => {
      g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true, JPN: true };
      return g.startPvp();
    },
    startOverloadedPvp: () => {
      g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true };
      return g.startOverloadedPvp();
    },
    startBank: () => {
      g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true };
      return g.startBank();
    },
    startPortal: () => {
      g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true };
      return g.startPortal();
    },
    startMaze: () => {
      g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true, JPN: true, CHN: true };
      return g.startMaze();
    },
    startHumans: () => {
      g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true, JPN: true, CHN: true };
      return g.startHumans();
    },
    startOverloadedHumans: () => {
      g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true, JPN: true, CHN: true, DIN: true };
      return g.startOverloadedHumans();
    },
    startSoulCollector: async () => {
      const { xpForLevel } = await import('/src/progress.js');
      let xp = 0;
      for (let i = 1; i < SOUL_COLLECTOR_UNLOCK_LEVEL; i++) xp += xpForLevel(i);
      g.save.xp = Math.max(g.save.xp || 0, xp);
      return g.startSoulCollector();
    },
    weapon: (id) => WEAPONS[id] || null,
    startWorldBoss: (id) => {
      g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true, JPN: true, CHN: true, DIN: true };
      return g.startWorldBoss(id);
    },
    startRadiation: () => {
      g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true, JPN: true, CHN: true, DIN: true };
      return g.startRadiation();
    },
    knockoutForce: (roll) => { g._knockoutForce = roll; },
    pvpForce: (roll) => { g._pvpForce = roll; },
    finishKnockout: () => {
      for (const zb of [...g.level.zombies.list]) {
        if (zb.knockout && zb.state !== 'dead') zb.damage(99999, null, false);
      }
      g._endKnockoutRun();
    },
    finishPvp: () => {
      for (const zb of [...g.level.zombies.list]) {
        if (zb.pvp && zb.state !== 'dead') zb.damage(99999, null, false);
      }
      g.level.pvp.update();
    },
    questEvent: (ev, data) => g.quests.onEvent(ev, data || {}),
    regenQuests: (dateKey) => {
      g.save.quests = null;
      g.quests.ensureToday(dateKey);
    },
    setSkin: (id) => {
      if (!g.save.skins.includes(id)) g.save.skins.push(id);
      g.save.activeSkin = id;
      g.saveGame();
    },
    setDance: (id) => {
      if (!g.save.dances.includes(id)) g.save.dances.push(id);
      g.save.activeDance = id;
      g.saveGame();
    },
    givePet: (id = 'dog') => {
      if (!g.save.pets.includes(id)) g.save.pets.push(id);
      g.save.activePet = id;
      g.spawnPet();
    },
    setActivePet: (id) => {
      if (!g.save.pets.includes(id)) g.save.pets.push(id);
      g.save.activePet = id;
      g.saveGame();
      g.spawnPet();
    },
    petPos: () => g.level.pet ? { x: g.level.pet.x, z: g.level.pet.z } : null,
    petKind: () => g.level.pet ? g.level.pet.id : null,
    rollMissions: (c, seed, run) => rollMissionSet(c, seed, run),
    missionTypes: () => Object.keys(MISSION_TYPES),
    setMissionRun: (c, n) => {
      g.save.missionRuns[c] = n;
      g.saveGame();
    },
    forceMissions: (types) => { g._forceMissionSet = types; },
    missionKind: () => g.level && g.level.missions && g.level.missions.constructor
      ? g.level.missions.constructor.name : null,
    storyObjectiveIds: () => g.level && g.level.missions && g.level.missions.objectives
      ? g.level.missions.objectives.map((o) => o.id) : [],
    completeStoryObjective: (id) => {
      if (g.level && g.level.missions && g.level.missions._completeObjective) {
        g.level.missions._completeObjective(id);
        return true;
      }
      return false;
    },
    // 🤝 кооп
    coopCreate: async (nick) => {
      const code = await g.coop.session.create(nick || t('Хост'));
      g.coop._openLobby(); // як у UI: вмикає лобі-пінги (анонс кімнати)
      return code;
    },
    coopJoin: async (code, nick) => {
      await g.coop.session.join(code, nick || t('Гість'));
      g.coop._openLobby();
    },
    coopSetCountry: (c) => g.coop.session.setCountry(c),
    coopSetMode: (mo) => g.coop.session.setMode(mo),
    coopSetRole: (r) => g.coop.session.setMyRole(r),
    coopStartLevel: () => g.coop.session.startLevel(),
    coopState: () => {
      const s = g.coop.session;
      const net = g.level && g.level.net;
      return {
        role: s.role, room: s.room, state: s.state, myPid: s.myPid,
        roster: [...s.roster.entries()].map(([pid, r]) => ({ pid, nick: r.nick })),
        remotes: net ? [...net.remotes.keys()] : [],
        remotePos: net ? Object.fromEntries([...net.remotes.entries()].map(([pid, rp]) => [pid,
          { x: Math.round(rp.pos.x * 10) / 10, y: Math.round(rp.pos.y * 10) / 10, z: Math.round(rp.pos.z * 10) / 10, hp: rp.health }])) : {},
        remotePets: net ? Object.fromEntries([...net.remotes.entries()].map(([pid, rp]) => [pid, rp.petId || null])) : {},
        aliveZombies: g.level ? g.level.zombies.list.filter((z) => z.state !== 'dead').length : 0,
        items: g.level ? g.level.effects.coins.length : 0,
        waiting: (net && net.waiting) || false,
        connected: s.transport.connected,
      };
    },
  };
}
