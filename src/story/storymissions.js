import { DynamicMissions } from '../missionpool.js';
import { t } from '../i18n.js';
import { getCountryStory } from './countryStories.js';
import { removeStoryNpc, spawnStoryNpc, updateStoryNpc } from './npcs.js';

const LEGACY_UKR_MISSION_ALIASES = {
  'ukr-rescue': 'rescue',
  'ukr-signal': 'tower',
  'ukr-defense': 'warehouse',
};

const LEGACY_SLOT_IDS = ['rescue', 'tower', 'warehouse'];

const STORY_DELEGATE_MATCHES = {
  'ukr-rescue': { preferred: ['rescue'] },
  'ukr-signal': { preferred: ['repair'] },
  'ukr-defense': { preferred: ['clear'], compatible: ['defense'] },
  'pol-bonfires': { preferred: ['bonfire'] },
  'pol-train': { preferred: ['repair'], compatible: ['lights', 'defense', 'nests'] },
  'pol-castle': { preferred: ['clear'], compatible: ['defense', 'hunt', 'nests'] },
  'egy-seals': { preferred: ['tomb'] },
  'egy-ambush': { preferred: ['clear'], compatible: ['defense', 'hunt', 'nests'] },
};

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
    this.delegate = new DynamicMissions(level);
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
      for (const site of this._objectiveTargets(active)) {
        mk.push({ x: site.x, z: site.z, color: '#4cff7a', icon: active.icon });
      }
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
  }

  _completeObjective(id) {
    const obj = this._objectiveForId(id);
    if (!obj) {
      this.delegate._complete(this._toLegacyMissionId(id));
      this._syncObjectiveStates();
      return;
    }
    if (obj.state === 'done') return;

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
    return typeof obj.title === 'function' ? obj.title() : (obj.title || obj.id);
  }

  _pushReplayNight() {
    if (this.level.stats) this.level.stats.time = Math.max(this.level.stats.time || 0, 150);
    if (this.level.world) this.level.world.time = Math.max(this.level.world.time || 0, 150);
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
      if (mission && mission.state === 'done') {
        obj.state = 'done';
      }
    }
    this._advanceObjectiveState();
    if (this.objectives.every((o) => o.state === 'done')) this._unlockBoss();
  }
}
