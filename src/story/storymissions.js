import { DynamicMissions, MISSION_TYPES, rollMissionSet } from '../missionpool.js';
import { RNG } from '../utils.js';
import { t } from '../i18n.js';
import { getCountryStory } from './countryStories.js';
import { removeStoryNpc, spawnStoryNpc, updateStoryNpc } from './npcs.js';

const LEGACY_UKR_MISSION_ALIASES = {
  'ukr-rescue': 'rescue',
  'ukr-signal': 'tower',
  'ukr-defense': 'warehouse',
};

const LEGACY_SLOT_IDS = ['rescue', 'tower', 'warehouse'];

export const STORY_DELEGATE_MATCHES = {
  'ukr-rescue': { preferred: ['rescue'] },
  'ukr-signal': { preferred: ['repair'] },
  'ukr-defense': { preferred: ['defense'] },
  'ukr-rebuild': { preferred: ['rebuild'] },
  // 🪤 АНТИ-СОФТЛОК: у країнах із фірмовою місією (bonfire B/C, tomb B/C) фірма може
  // зайняти слот сусідньої цілі. Тоді слот-фолбек тієї цілі впирається у РЕЗЕРВ
  // (місія у preferred іншої цілі) і ціль лишається без делегата — бос не відкриється.
  // Ліки: compatible-списки сусідніх цілей покривають пули ВСІХ слотів.
  'pol-bonfires': { preferred: ['bonfire'] },
  'pol-train': { preferred: ['repair'], compatible: ['lights', 'defense', 'nests', 'clear', 'collect', 'hunt', 'escort', 'rescue'] },
  'pol-castle': { preferred: ['castle'] },
  'egy-seals': { preferred: ['tomb'] },
  'egy-ambush': { preferred: ['clear'], compatible: ['defense', 'hunt', 'nests', 'lights', 'collect', 'escort', 'rescue', 'repair'] },
  // 🇩🇪 фірмова convoy може зайняти слот A або C — тому сусідні цілі мають
  // ШИРОКІ compatible-списки (покривають пули всіх слотів), інакше при
  // невдалому ролі ціль лишиться без місії-делегата і бос не відкриється.
  'deu-workshop': { preferred: ['rescue'], compatible: ['collect', 'hunt', 'escort', 'repair', 'defense', 'nests', 'lights', 'clear'] },
  'deu-convoy': { preferred: ['convoy'] },
  'deu-gate': { preferred: ['defense'], compatible: ['clear', 'hunt', 'nests', 'lights', 'collect', 'repair'] },
  'deu-barracks': { preferred: ['barracks'] },
  // 🇫🇷 фірмова balloon (слоти A/C) — та сама страховка широкими списками
  'fra-kitchen': { preferred: ['rescue'], compatible: ['collect', 'hunt', 'escort', 'repair', 'defense', 'nests', 'lights', 'clear'] },
  'fra-balloon': { preferred: ['balloon'] },
  'fra-cellar': { preferred: ['clear'], compatible: ['defense', 'hunt', 'nests', 'lights', 'collect', 'repair'] },
  'fra-bases': { preferred: ['bases'] },
  'esp-band': { preferred: ['rescue'], compatible: ['collect', 'hunt', 'escort'] },
  'esp-bells': { preferred: ['repair'], compatible: ['lights', 'defense', 'nests'] },
  'esp-fireworks': { preferred: ['clear'], compatible: ['defense', 'hunt', 'nests', 'collect', 'lights'] },
  'prt-fishers': { preferred: ['rescue'], compatible: ['collect', 'hunt', 'escort'] },
  'prt-lighthouse': { preferred: ['repair'], compatible: ['lights', 'defense', 'nests'] },
  'prt-docks': { preferred: ['clear'], compatible: ['defense', 'hunt', 'nests', 'collect', 'lights'] },
  'ita-trattoria': { preferred: ['rescue'], compatible: ['collect', 'hunt', 'escort'] },
  'ita-aqueduct': { preferred: ['repair'], compatible: ['lights', 'defense', 'nests'] },
  'ita-legion': { preferred: ['clear'], compatible: ['defense', 'hunt', 'nests', 'collect', 'lights'] },
  // 🇹🇷 фірмова bazaar (слоти A/C) — сусідні цілі зі страховкою
  'tur-bazaar': { preferred: ['bazaar'] },
  'tur-lighthouse': { preferred: ['repair'], compatible: ['lights', 'defense', 'nests'] },
  'tur-spices': { preferred: ['clear'], compatible: ['defense', 'hunt', 'nests', 'collect', 'escort', 'rescue', 'lights'] },
  'tur-rescue-ship': { preferred: ['shiprescue'] },
  'swe-longhouse': { preferred: ['rescue'], compatible: ['collect', 'hunt', 'escort'] },
  'swe-aurora': { preferred: ['repair'], compatible: ['lights', 'defense', 'nests'] },
  'swe-jarl': { preferred: ['clear'], compatible: ['defense', 'hunt', 'nests', 'collect', 'lights'] },
  'jpn-teahouse': { preferred: ['rescue'], compatible: ['collect', 'hunt', 'escort'] },
  'jpn-lanterns': { preferred: ['repair'], compatible: ['lights', 'defense', 'nests'] },
  'jpn-dojo': { preferred: ['clear'], compatible: ['defense', 'hunt', 'nests', 'collect', 'lights'] },
  'chn-scrolls': { preferred: ['rescue'], compatible: ['collect', 'hunt', 'escort'] },
  'chn-beacon': { preferred: ['repair'], compatible: ['lights', 'defense', 'nests'] },
  'chn-pit': { preferred: ['clear'], compatible: ['defense', 'hunt', 'nests', 'collect', 'lights'] },
  'moon-crew': { preferred: ['rescue'] },
  'moon-relays': { preferred: ['repair'] },
  'moon-defense': { preferred: ['defense'] },
  'moon-reactor': { preferred: ['barracks'] },
};

// 📖 Набір місій для СЮЖЕТНОГО рівня. Баг: HUD показує «Врятуй людей із хліва»
// (preferred=rescue), а делегат грає інший тип (напр. «Набери води з колодязів»),
// бо rollMissionSet для runIndex>0 може не викинути rescue, а фірмова місія країни
// (well/bonfire/…) затирає слот. Ліки: гарантуємо, що у перших 3 слотах (A/B/C)
// присутній preferred[0]-тип КОЖНОЇ сюжетної цілі. Фірмову місію rollMissionSet уже
// кладе у ЇЇ слот (а там, де вона і є ціллю — це той самий preferred). Евіктимо лише
// НЕ-preferred типи; фірмові типи (MISSION_TYPES[t].country) не рухаємо — їхні слоти
// фіксовані. Загальні rescue/repair/clear користуються фіксованими точками світу
// (хлів/вежа/склад), тож можуть стояти у будь-якому слоті без шкоди для геймплею.
// Детермінізм за (seed, runIndex) → у коопі хост і гість будують той самий набір.
export function storyMissionSet(countryId, seed, runIndex) {
  const set = rollMissionSet(countryId, seed, runIndex).slice();
  const story = getCountryStory(countryId);
  if (!story) return set;
  const required = [];
  const bonusRequired = [];
  for (const obj of story.objectives) {
    const pref = (STORY_DELEGATE_MATCHES[obj.id] && STORY_DELEGATE_MATCHES[obj.id].preferred) || [];
    if (!pref[0]) continue;
    if (MISSION_TYPES[pref[0]].slots.includes('D')) {
      if (!bonusRequired.includes(pref[0])) bonusRequired.push(pref[0]);
    }
    else if (!required.includes(pref[0])) required.push(pref[0]);
  }
  const rng = new RNG((seed * 31 + runIndex * 7777 + 91) >>> 0); // окремий сід від rollMissionSet
  const locked = [false, false, false]; // слоти A/B/C, які вже тримають потрібний тип
  const satisfied = new Set();
  for (let i = 0; i < 3; i++) {
    if (required.includes(set[i]) && !satisfied.has(set[i])) { locked[i] = true; satisfied.add(set[i]); }
  }
  // фірмові типи (обмежені слоти) — першими; далі загальні
  const remaining = required.filter((type) => !satisfied.has(type));
  remaining.sort((a, b) => (MISSION_TYPES[b].country ? 1 : 0) - (MISSION_TYPES[a].country ? 1 : 0));
  const natural = { rescue: 0, repair: 1, clear: 2 }; // «рідний» слот загального типу
  for (const type of remaining) {
    const isSig = !!MISSION_TYPES[type].country;
    let free = (isSig
      ? MISSION_TYPES[type].slots.map((s) => 'ABC'.indexOf(s)).filter((i) => i >= 0 && i < 3)
      : [0, 1, 2]).filter((i) => !locked[i]);
    if (!free.length) free = [0, 1, 2].filter((i) => !locked[i]); // страховка (не має статися)
    let slot;
    if (!isSig && natural[type] !== undefined && free.includes(natural[type])) slot = natural[type];
    else slot = free[rng.int(0, free.length - 1)];
    set[slot] = type;
    locked[slot] = true;
    satisfied.add(type);
  }
  // 🎁 Навчальна Україна в старому пулі має лише 3 слоти; сюжетна
  // кампанія додає їй таке саме четверте бонусне завдання, як іншим країнам.
  if (set.length < 4) {
    const dPool = ['collect', 'hunt', 'lights', 'defense'].filter((type) => !set.includes(type));
    set.push(dPool[rng.int(0, dPool.length - 1)]);
  }
  // 4-й (бонус) слот не має дублювати перші три
  if (set.length > 3 && set.slice(0, 3).includes(set[3])) {
    const dPool = ['collect', 'hunt', 'lights', 'defense'].filter((type) => !set.slice(0, 3).includes(type));
    if (dPool.length) set[3] = dPool[rng.int(0, dPool.length - 1)];
  }
  if (bonusRequired.length) {
    set[3] = bonusRequired[0];
    for (const type of bonusRequired.slice(1)) if (!set.includes(type)) set.push(type);
  }
  return set;
}

// Чотири завдання, які реально створяться на рівні: сюжетні іконки +
// додаткові місії, не зайняті сюжетом. HUD і меню країни мають показувати
// один і той самий повний набір.
export function storyMissionPreview(countryId, seed, runIndex) {
  const story = getCountryStory(countryId);
  if (!story) return null;
  const usedTypes = new Set(story.objectives.map((obj) => {
    const preferred = STORY_DELEGATE_MATCHES[obj.id]?.preferred || [];
    return preferred[0];
  }).filter(Boolean));
  const icons = story.objectives.map((obj) => obj.icon);
  for (const type of storyMissionSet(countryId, seed, runIndex)) {
    if (!usedTypes.has(type)) icons.push(MISSION_TYPES[type]?.icon || '🎯');
  }
  return icons;
}

export class StoryMissions {
  constructor(level) {
    this.level = level;
    this.story = getCountryStory(level.countryId);
    this.storySites = (level.country.map && level.country.map.storySites) || {};
    this.objectives = (this.story ? this.story.objectives : []).map((cfg, i) => ({
      ...cfg,
      slotIndex: i,
      state: i === 0 ? 'active' : 'locked',
    }));
    this.replayNightRaid = !!(
      this.story
      && level.game
      && level.game.save
      && level.game.save.liberated
      && level.game.save.liberated[level.countryId]
    );
    if (this.replayNightRaid) this._pushReplayNight();
    // 📖 інтро глави: банер з назвою і реплікою НПС показуємо трохи згодом,
    // коли HUD уже живий (перший кадр рівня — ще завантаження)
    this._introShown = false;
    this._introT = 1.1;
    this._activeId = this.objectives[0] ? this.objectives[0].id : null;
    // 📖 набір місій-делегатів гарантовано містить preferred[0] кожної сюжетної цілі
    // (той самий runIndex, що й обчислює DynamicMissions → у коопі збіг хост/гість)
    const runIndex = level.runIndex !== undefined
      ? level.runIndex
      : (level.game.save.missionRuns && level.game.save.missionRuns[level.countryId]) || 0;
    this.delegate = new DynamicMissions(level, storyMissionSet(level.countryId, level.country.seed, runIndex));
    this._syncDelegateLocks();
    this.npcState = spawnStoryNpc(
      level,
      this.story && this.story.npc,
      this.story && this.story.npc ? this._site(this.story.npc.site) : null,
    );
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        const value = target.delegate[prop];
        return typeof value === 'function' ? value.bind(target.delegate) : value;
      },
      set(target, prop, value, receiver) {
        if (prop in target) return Reflect.set(target, prop, value, receiver);
        target.delegate[prop] = value;
        return true;
      },
    });
  }

  get(id) {
    const objective = this._objectiveForId(id);
    if (objective) return this._missionView(objective);
    return this.delegate.get(id);
  }

  getHudList() {
    const out = this.objectives.map((obj) => ({
      icon: obj.icon,
      title: this._objectiveTitle(obj),
      done: obj.state === 'done',
    }));
    const delegateHud = this.delegate.getHudList();
    for (const mission of this._extraDelegateMissions()) {
      const index = this.delegate.missions.indexOf(mission);
      if (delegateHud[index]) out.push(delegateHud[index]);
    }
    if (this.bossUnlocked && !this.bossStarted) {
      out.push({ icon: '👑', title: t('Перемоги БОСА на арені!'), done: false });
    } else if (this.bossStarted) {
      out.push({ icon: '👑', title: t('Бій з босом!'), done: false });
    }
    return out;
  }

  getMarkers() {
    const mk = [];
    const active = this.objectives.find((o) => o.state === 'active');
    if (active) {
      if (active.id === 'pol-castle') {
        const mission = this.delegate.get('castle');
        const target = mission && this.delegate._castleTarget(mission);
        if (target) mk.push({
          x: target.x, z: target.z, color: '#ff9e63',
          icon: mission.phase === 'rescue' ? '🆘' : mission.phase === 'dungeon' ? '🧙' : '🏰',
        });
      } else {
        const mission = this._delegateMissionForObjective(active);
        const next = mission && this.delegate._beamTarget(mission);
        const targets = next ? [next] : mission && mission.points ? mission.points.filter((point) => !point.done) : this._objectiveTargets(active);
        for (const site of targets) {
          mk.push({ x: site.x, z: site.z, color: '#4cff7a', icon: active.icon });
        }
      }
    }
    for (const marker of this.delegate.getMarkers(this._extraDelegateMissions())) {
      if (marker.icon !== '👑') mk.push(marker);
    }
    if (this.bossUnlocked && !this.bossStarted) {
      const arena = this._site('arena') || (this.level.world && this.level.world.layout && this.level.world.layout.arena);
      if (arena) mk.push({ x: arena.x, z: arena.z, color: '#ff44aa', icon: '👑' });
    }
    return mk;
  }

  update(dt, input, allowControl) {
    updateStoryNpc(this.npcState, dt);
    this.delegate.update(dt, input, allowControl);
    this._syncObjectiveStates();
    if (!this._introShown) {
      this._introT -= dt;
      if (this._introT <= 0) { this._introShown = true; this._showIntro(); }
    }
  }

  // 📖 банер глави: назва історії + репліка НПС (при повторі-рейді — короткий тост)
  _showIntro() {
    if (!this.story) return;
    const title = typeof this.story.title === 'function' ? this.story.title() : '';
    const npc = this.story.npc || {};
    const name = typeof npc.name === 'function' ? npc.name() : '';
    const intro = typeof npc.intro === 'function' ? npc.intro() : '';
    if (!title) return;
    if (this.replayNightRaid) {
      this.level.bus.emit('toast', `🌙 ${t('Нічний рейд')} · ${title}`);
      return;
    }
    const game = this.level.game;
    if (game && game.hud && typeof game.hud.banner === 'function') {
      game.hud.banner(`📖 ${title}`, name && intro ? `${name}: ${intro}` : intro, 6, { prio: 1 }); // v300: інтро глави перебиває банер країни (як до черги)
    } else {
      this.level.bus.emit('toast', `📖 ${title}`);
    }
    if (intro && this.level.audio && typeof this.level.audio.voiceOnce === 'function') {
      this.level.audio.voiceOnce('quest', 20);
    }
  }

  _completeObjective(id) {
    const obj = this._objectiveForId(id);
    if (!obj) {
      this.delegate._complete(this._toLegacyMissionId(id));
      this._syncObjectiveStates();
      return;
    }
    if (obj.state === 'done') return;
    if (obj.state !== 'active') return;

    const delegateMission = this._delegateMissionForObjective(obj);
    if (delegateMission && delegateMission.state !== 'done') {
      this._completeDelegateObjective(delegateMission.id);
    } else {
      this.level.addCoins(obj.reward || 0);
      this.level.audio.mission();
      if (obj.horde > 0) {
        const count = Math.round(obj.horde * ((this.level.country && this.level.country.difficulty.counts) || 1));
        if (this.pendingHorde) this.pendingHorde.count += count;
        else this.pendingHorde = { t: 5, count };
        this.level.bus.emit('hordeWarning', 5);
        this.level.netEv('hw');
      }
    }

    obj.state = 'done';
    const doneText = typeof obj.done === 'function' ? obj.done() : this._objectiveTitle(obj);
    this.level.bus.emit('missionDone', this._missionView(obj));
    if (doneText) this.level.bus.emit('toast', doneText);
    this._advanceObjectiveState();
    if (this.objectives.every((o) => o.state === 'done')) this._unlockBoss();
  }

  _completeDelegateObjective(id) {
    const bus = this.level && this.level.bus;
    if (!bus || typeof bus.emit !== 'function') {
      this.delegate._complete(id);
      return;
    }

    const originalEmit = bus.emit;
    bus.emit = function emitWithoutDelegateMissionDone(eventName, ...args) {
      if (eventName === 'missionDone') return undefined;
      return originalEmit.call(this, eventName, ...args);
    };
    try {
      this.delegate._complete(id);
    } finally {
      bus.emit = originalEmit;
    }
  }

  _complete(id) {
    this._completeObjective(id);
  }

  dispose() {
    removeStoryNpc(this.level, this.npcState);
    this.npcState = null;
    if (this.delegate.dispose) this.delegate.dispose();
  }

  currentStoryObjective() {
    const active = this.objectives.find((o) => o.state === 'active');
    if (!active) return '';
    const prefix = this.replayNightRaid ? `🌙 ${t('Нічний рейд')} · ` : '';
    return `${prefix}${active.icon} ${this._objectiveTitle(active)}`;
  }

  get missions() {
    return LEGACY_SLOT_IDS.map((slotId, i) => {
      const obj = this.objectives[i];
      const legacy = this.delegate.missions[i] || {};
      if (!obj) {
        return {
          ...legacy,
          id: slotId,
          state: this.objectives.every((o) => o.state === 'done') ? 'done' : (legacy.state || 'active'),
        };
      }
      return {
        ...legacy,
        id: slotId,
        type: obj.id,
        icon: obj.icon,
        title: this._objectiveTitle(obj),
        reward: obj.reward || legacy.reward || 0,
        horde: obj.horde || 0,
        state: obj.state === 'done' ? 'done' : 'active',
      };
    });
  }
  set missions(value) { this.delegate.missions = value; }
  get prompt() { return this.delegate.prompt; }
  set prompt(value) { this.delegate.prompt = value; }
  get civilians() { return this.delegate.civilians; }
  set civilians(value) { this.delegate.civilians = value; }
  get bossUnlocked() { return this.delegate.bossUnlocked; }
  set bossUnlocked(value) { this.delegate.bossUnlocked = value; }
  get bossStarted() { return this.delegate.bossStarted; }
  set bossStarted(value) { this.delegate.bossStarted = value; }
  get bossBeam() { return this.delegate.bossBeam; }
  set bossBeam(value) { this.delegate.bossBeam = value; }
  get pendingHorde() { return this.delegate.pendingHorde; }
  set pendingHorde(value) { this.delegate.pendingHorde = value; }

  _toLegacyMissionId(id) {
    const objective = this.objectives.find((o) => o.id === id || o.slotIndex === id);
    if (objective) {
      const mission = this._delegateMissionForObjective(objective);
      return mission ? mission.id : (LEGACY_SLOT_IDS[objective.slotIndex] || this.delegate.missions[objective.slotIndex]?.id || id);
    }
    if (LEGACY_UKR_MISSION_ALIASES[id]) return LEGACY_UKR_MISSION_ALIASES[id];
    if (LEGACY_SLOT_IDS.includes(id)) return id;
    return id;
  }

  _delegateMissionForObjective(obj) {
    const match = STORY_DELEGATE_MATCHES[obj.id] || {};
    const preferred = match.preferred || [];
    const compatible = match.compatible || [];

    for (const type of preferred) {
      const mission = this.delegate.get(type);
      if (mission) return mission;
    }

    for (const type of compatible) {
      const mission = this.delegate.get(type);
      if (mission && mission.slotIndex === obj.slotIndex && !this._isReservedForOtherObjective(mission, obj)) {
        return mission;
      }
    }

    for (const type of compatible) {
      const mission = this.delegate.get(type);
      if (mission && !this._isReservedForOtherObjective(mission, obj)) return mission;
    }

    const slotMission = this.delegate.missions[obj.slotIndex] || null;
    if (slotMission && !this._isReservedForOtherObjective(slotMission, obj)) return slotMission;
    return null;
  }

  _extraDelegateMissions() {
    const used = new Set(this.objectives.map((obj) => this._delegateMissionForObjective(obj)).filter(Boolean));
    return this.delegate.missions.filter((mission) => !used.has(mission));
  }

  _isReservedForOtherObjective(mission, currentObj) {
    if (!mission) return false;
    return this.objectives.some((obj) => {
      if (obj === currentObj) return false;
      const preferred = (STORY_DELEGATE_MATCHES[obj.id] && STORY_DELEGATE_MATCHES[obj.id].preferred) || [];
      return preferred.includes(mission.type || mission.id);
    });
  }

  _objectiveForId(id) {
    if (id in LEGACY_UKR_MISSION_ALIASES) {
      return this.objectives.find((o) => o.id === id) || null;
    }
    if (LEGACY_SLOT_IDS.includes(id)) {
      return this.objectives[LEGACY_SLOT_IDS.indexOf(id)] || null;
    }
    return this.objectives.find((o) => o.id === id || o.slotIndex === id) || null;
  }

  _objectiveTitle(obj) {
    if ((obj.id === 'pol-castle' || obj.id === 'deu-barracks' || obj.id === 'tur-rescue-ship') && this.delegate) {
      const type = obj.id === 'pol-castle' ? 'castle' : obj.id === 'deu-barracks' ? 'barracks' : 'shiprescue';
      const mission = this.delegate.get(type);
      if (mission && mission.title) return mission.title;
    }
    return typeof obj.title === 'function' ? obj.title() : (obj.title || obj.id);
  }

  _pushReplayNight() {
    if (this.level.stats) this.level.stats.time = Math.max(this.level.stats.time || 0, 150);
    if (this.level.world) this.level.world.time = Math.max(this.level.world.time || 0, 150);
    this.level.nightK = Math.max(this.level.nightK || 0, 1);
    if (this.level.world && this.level.world.setNight) this.level.world.setNight(this.level.nightK);
    if (this.level.player && this.level.player.setLamp) this.level.player.setLamp(this.level.nightK);
  }

  _missionView(obj) {
    return {
      id: obj.id,
      type: obj.kind || obj.id,
      slotIndex: obj.slotIndex,
      icon: obj.icon,
      title: this._objectiveTitle(obj),
      reward: obj.reward || 0,
      horde: obj.horde || 0,
      state: obj.state,
      site: this._objectiveTarget(obj),
    };
  }

  _objectiveTargets(obj) {
    const site = this._site(obj.site);
    if (!site) return [];
    return Array.isArray(site) ? site.filter(Boolean) : [site];
  }

  _objectiveTarget(obj) {
    return this._objectiveTargets(obj)[0] || null;
  }

  _advanceObjectiveState() {
    let foundNext = false;
    for (const obj of this.objectives) {
      if (obj.state === 'done') continue;
      obj.state = foundNext ? 'locked' : 'active';
      foundNext = true;
    }
    this._syncDelegateLocks();
    // 🗣️ репліка «start» нової активної цілі — рівно раз на перехід
    // (_advanceObjectiveState викликається щокадру з _syncObjectiveStates)
    const active = this.objectives.find((o) => o.state === 'active');
    const id = active ? active.id : null;
    if (id !== this._activeId) {
      this._activeId = id;
      const startText = active && typeof active.start === 'function' ? active.start() : '';
      if (startText) this.level.bus.emit('toast', `${active.icon} ${startText}`);
    }
  }

  _unlockBoss() {
    if (this.delegate.bossUnlocked) return;
    const arena = this._site('arena') || (this.delegate.L && this.delegate.L.arena);
    this.delegate.allDone = true;
    this.delegate.bossUnlocked = true;
    if (arena && !this.delegate.bossBeam) {
      this.delegate.bossBeam = this.level.effects.makeBeam(arena.x, arena.z, 0xff44aa, '👑');
    }
    if (this.level.audio && this.level.audio.bossRoar) this.level.audio.bossRoar();
    this.level.bus.emit('bossUnlocked');
  }

  _site(id) {
    if (!id) return null;
    if (this.storySites && this.storySites[id]) return this.storySites[id];
    if (this.delegate && typeof this.delegate._site === 'function') return this.delegate._site(id);
    const layout = (this.delegate && this.delegate.L) || (this.level.world && this.level.world.layout);
    if (layout && layout[id]) return layout[id];
    return null;
  }

  _syncObjectiveStates() {
    for (const obj of this.objectives) {
      const mission = this._delegateMissionForObjective(obj);
      if (obj.state === 'active' && mission && mission.state === 'done') {
        obj.state = 'done';
      }
    }
    this._advanceObjectiveState();
    if (this.objectives.every((o) => o.state === 'done')) this._unlockBoss();
  }

  _syncDelegateLocks() {
    if (!this.delegate) return;
    for (const obj of this.objectives) {
      const mission = this._delegateMissionForObjective(obj);
      if (!mission || mission.state === 'done') continue;
      mission.state = obj.state === 'active' ? 'active' : 'locked';
    }
  }
}
