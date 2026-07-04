import { getCountryStory } from './countryStories.js';

const LEGACY_UKR_MISSION_ALIASES = {
  rescue: 'ukr-rescue',
  tower: 'ukr-signal',
  warehouse: 'ukr-defense',
};

export class StoryMissions {
  constructor(level) {
    this.level = level;
    this.story = getCountryStory(level.countryId);
    this.objectives = (this.story ? this.story.objectives : []).map((cfg, i) => ({
      ...cfg,
      slotIndex: i,
      state: i === 0 ? 'active' : 'locked',
    }));
    this.missions = this.objectives;
    this.prompt = null;
    this.civilians = [];
    this.bossUnlocked = false;
    this.bossStarted = false;
  }

  get(id) {
    const resolvedId = LEGACY_UKR_MISSION_ALIASES[id] || id;
    return this.objectives.find((o) => o.id === resolvedId || o.slotIndex === resolvedId) || null;
  }

  getHudList() {
    return this.objectives.map((o) => ({
      icon: o.icon,
      title: o.title(),
      done: o.state === 'done',
    }));
  }

  getMarkers() {
    const active = this.objectives.find((o) => o.state === 'active');
    const site = active && this.level.world.layout[active.site];
    return site ? [{ x: site.x, z: site.z, icon: active.icon }] : [];
  }

  update() {}

  _completeObjective(id) {
    const obj = this.get(id);
    if (!obj || obj.state === 'done') return;
    obj.state = 'done';
    const next = this.objectives.find((o) => o.state === 'locked');
    if (next) next.state = 'active';
    else this.bossUnlocked = true;
  }

  _complete(id) {
    this._completeObjective(id);
  }
}
