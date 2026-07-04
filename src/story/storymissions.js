import { DynamicMissions } from '../missionpool.js';
import { getCountryStory } from './countryStories.js';

const LEGACY_UKR_MISSION_ALIASES = {
  'ukr-rescue': 'rescue',
  'ukr-signal': 'tower',
  'ukr-defense': 'warehouse',
};

const LEGACY_SLOT_IDS = ['rescue', 'tower', 'warehouse'];

export class StoryMissions {
  constructor(level) {
    this.level = level;
    this.story = getCountryStory(level.countryId);
    this.objectives = (this.story ? this.story.objectives : []).map((cfg, i) => ({
      ...cfg,
      slotIndex: i,
      state: i === 0 ? 'active' : 'locked',
    }));
    this.delegate = new DynamicMissions(level);
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
    return this.delegate.get(this._toLegacyMissionId(id));
  }

  getHudList() {
    return this.delegate.getHudList();
  }

  getMarkers() {
    return this.delegate.getMarkers();
  }

  update(dt, input, allowControl) {
    this.delegate.update(dt, input, allowControl);
    this._syncObjectiveStates();
  }

  _completeObjective(id) {
    this._complete(id);
  }

  _complete(id) {
    this.delegate._complete(this._toLegacyMissionId(id));
    this._syncObjectiveStates();
  }

  dispose() {
    if (this.delegate.dispose) this.delegate.dispose();
  }

  get missions() { return this.delegate.missions; }
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
    if (LEGACY_UKR_MISSION_ALIASES[id]) return LEGACY_UKR_MISSION_ALIASES[id];
    if (LEGACY_SLOT_IDS.includes(id)) return id;
    const objective = this.objectives.find((o) => o.id === id || o.slotIndex === id);
    if (objective) return LEGACY_SLOT_IDS[objective.slotIndex] || this.delegate.missions[objective.slotIndex]?.id || id;
    return id;
  }

  _syncObjectiveStates() {
    let foundNext = false;
    for (const obj of this.objectives) {
      const mission = this.delegate.get(this._toLegacyMissionId(obj.id));
      if (mission && mission.state === 'done') {
        obj.state = 'done';
      } else if (!foundNext) {
        obj.state = 'active';
        foundNext = true;
      } else {
        obj.state = 'locked';
      }
    }
  }
}
