import * as THREE from 'three';
import { t, interactKey } from './i18n.js';
import { clamp } from './utils.js';
import { toonMat } from './renderkit.js';
import { makeGunMesh } from './characters.js';

export const CUSTOM_MAP_TYPES = Object.freeze(['house', 'tree', 'lake', 'zombie', 'rock', 'task', 'airdrop', 'church']);
const TYPE_SET = new Set(CUSTOM_MAP_TYPES);
const BASE_MAX_OBJECTS = 120;
const PLUS_MAX_OBJECTS = 140;
const TYPE_INFO = Object.freeze({
  house: { icon: '🏠', name: 'Дім', radius: 4.5 },
  tree: { icon: '🌲', name: 'Дерево', radius: 0.8 },
  lake: { icon: '💧', name: 'Озеро', radius: 6.5 },
  zombie: { icon: '🧟', name: 'Зомбі', radius: 1 },
  rock: { icon: '🪨', name: 'Камінь', radius: 1.5 },
  task: { icon: '⭐', name: 'Завдання', radius: 8 },
  airdrop: { icon: '🪂', name: 'Аірдроп', radius: 2.5, plus: true, max: 2 },
  church: { icon: '⛪', name: 'Церква', radius: 7, plus: true, max: 1 },
});
const SPAWN_CLEAR_RADIUS = 10;
const MAX_TASKS = 3;
const QUEST_TYPES = Object.freeze(['rescue', 'collect', 'repair', 'lights', 'elites', 'warehouse', 'rebuild']);
const QUEST_INFO = Object.freeze({
  rescue: { icon: '🆘', title: 'Врятуй людей у хліві', total: 1 },
  collect: { icon: '📦', title: 'Збери 4 ящики припасів', total: 4 },
  repair: { icon: '📡', title: 'Полагодь радіовежу', total: 1 },
  lights: { icon: '🔦', title: 'Засвіти 3 ліхтарі', total: 3 },
  elites: { icon: '👹', title: 'Перемож 3 елітних зомбі', total: 3 },
  warehouse: { icon: '🏭', title: 'Зачисть склад від зомбі', total: 8 },
  rebuild: { icon: '🏗️', title: 'Знайди сокиру й кірку та віднови центр міста', total: 3, plus: true },
});
const QUEST_SET = new Set(QUEST_TYPES);
const ZOMBIE_TYPES = Object.freeze(['walker', 'runner', 'tank', 'spitter', 'shield', 'moonbrute']);
const ZOMBIE_NAMES = Object.freeze({
  walker: 'Звичайний зомбі', runner: 'Зомбі-бігун', tank: 'Зомбі-танк',
  spitter: 'Зомбі-плювака', shield: 'Зомбі-щитоносець', moonbrute: 'Місячний громила',
});
const ZOMBIE_SET = new Set(ZOMBIE_TYPES);

export const CUSTOM_COUNTRY = Object.freeze({
  id: 'CUSTOM', name: t('Моя карта'), flag: '🧱', seed: 73421, biome: 'summer',
  difficulty: { hp: 1, dmg: 1, counts: 1 }, extraZombie: null, shieldGuards: 0,
  boss: { hp: 5500, style: 'king' },
  banner: t('Твоя власна карта'), food: t('яблуко'),
  map: {
    custom: true, barren: true, bound: 180, spawn: { x: 0, z: 55 }, terrain: () => 0,
    sites: {
      village: { x: 0, z: 0, r: 12 }, rescue: { x: -140, z: -140, r: 8 },
      tower: { x: 140, z: -140, r: 8 }, warehouse: { x: 140, z: 140, r: 8 },
      arena: { x: -140, z: 140, r: 20 },
    },
    storySites: {}, roads: [], hills: [], flats: [], houses: [], landmarks: [],
    villageExtras: [], fun: {}, zombieDensity: 0,
  },
});

export function sanitizeCustomMap(raw) {
  const objects = Array.isArray(raw && raw.objects) ? raw.objects : [];
  let taskCount = 0;
  return {
    biome: raw && raw.biome === 'snow' ? 'snow' : 'summer',
    objects: objects.slice(0, PLUS_MAX_OBJECTS).flatMap((item) => {
      if (!item || !TYPE_SET.has(item.type)) return [];
      if (item.type === 'task' && taskCount >= MAX_TASKS) return [];
      const x = Number(item.x), z = Number(item.z), ry = Number(item.ry) || 0;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
      const clean = { type: item.type, x: clamp(x, -170, 170), z: clamp(z, -170, 170), ry: clamp(ry, -Math.PI, Math.PI) };
      if (item.type === 'task') {
        clean.quest = QUEST_SET.has(item.quest) ? item.quest : QUEST_TYPES[taskCount % QUEST_TYPES.length];
        taskCount++;
      }
      if (item.type === 'zombie') clean.zombieType = ZOMBIE_SET.has(item.zombieType) ? item.zombieType : 'walker';
      return [clean];
    }),
  };
}

export class CustomMapMode {
  constructor(level, raw, editor = false, slot = 0) {
    this.level = level;
    this.editor = editor;
    this.slot = slot === 1 ? 1 : 0;
    this.plus = level.game.save.upgrades.mapeditorplus > 0;
    this.maxObjects = this.plus ? PLUS_MAX_OBJECTS : BASE_MAX_OBJECTS;
    this.data = sanitizeCustomMap(raw);
    this.prompt = null;
    this.tasks = [];
    this.civilians = [];
    this.airdrops = [];
    this.crateReady = false;
    this.done = false;
    this.flyY = 0;
    this.selected = null;
    this.questTypes = this.plus ? QUEST_TYPES : QUEST_TYPES.filter((quest) => !QUEST_INFO[quest].plus);
    this.questIndex = this.data.objects.filter((item) => item.type === 'task').length % this.questTypes.length;
    this.zombieIndex = 0;
    this.bossStarted = false;
    this.boss = null;
    this.spawned = Object.fromEntries(CUSTOM_MAP_TYPES.map((type) => [type, 0]));
    for (const item of this.data.objects) this._spawn(item);
    level.world._buildGrid();
    if (editor) {
      level.player.pos.set(0, 14, 55);
      level.player.camera.position.copy(level.player.pos);
      this.preview = new THREE.Mesh(
        new THREE.RingGeometry(1.05, 1.35, 24),
        new THREE.MeshBasicMaterial({ color: 0x5ad465, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
      );
      this.preview.rotation.x = -Math.PI / 2;
      this.preview.visible = false;
      level.scene.add(this.preview);
      this._openTools();
    }
  }

  _spawn(item) {
    const { level } = this;
    const { world, scene } = level;
    const y = world.groundH(item.x, item.z);
    let object = null;
    if (item.type === 'house') {
      object = world._makeHouse(item.x, item.z, item.ry, { w: 7, d: 5.5, h: 3.2 });
    } else if (item.type === 'tree') {
      object = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 3.5, 8), toonMat(0x76502c));
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 1), toonMat(0x4f9a4b));
      trunk.position.y = 1.75; crown.position.y = 4.1;
      object.add(trunk, crown); object.position.set(item.x, y, item.z); scene.add(object);
      world._addCollider(item.x, item.z, 0.65, y + 3.4, 0.4);
    } else if (item.type === 'lake') {
      object = new THREE.Group();
      const shore = new THREE.Mesh(new THREE.RingGeometry(5.5, 6.5, 28), toonMat(0xd9c98f));
      const water = new THREE.Mesh(new THREE.CircleGeometry(5.5, 28), new THREE.MeshToonMaterial({ color: 0x43aee2, transparent: true, opacity: 0.82, side: THREE.DoubleSide }));
      shore.rotation.x = water.rotation.x = -Math.PI / 2; shore.position.y = 0.03; water.position.y = 0.08;
      object.add(shore, water); object.position.set(item.x, y, item.z); scene.add(object);
    } else if (item.type === 'rock') {
      object = new THREE.Mesh(new THREE.DodecahedronGeometry(1.45, 0), toonMat(0x858e98));
      object.scale.set(1.2, 0.8, 1); object.rotation.y = item.ry;
      object.position.set(item.x, y + 0.9, item.z); scene.add(object);
      world._addCollider(item.x, item.z, 1.3, y + 1.8, 1.1);
    } else if (item.type === 'zombie') {
      const zombieType = this.plus && ZOMBIE_SET.has(item.zombieType) ? item.zombieType : 'walker';
      object = level.zombies.spawn(zombieType, item.x, item.z, { horde: false });
      object.customPlaced = true;
    } else if (item.type === 'task') {
      object = this._spawnTask(item, y);
      this.tasks.push(object);
    } else if (item.type === 'airdrop') {
      object = this._spawnAirdrop(item, y);
    } else if (item.type === 'church') {
      object = this._spawnChurch(item, y);
    }
    this.spawned[item.type]++;
    return object;
  }

  _spawnAirdrop(item, y) {
    const group = new THREE.Group();
    const crate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.2), toonMat(0x7b4c28));
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.28, 2.3), toonMat(0xf2b632));
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.7, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonMat(0xe95b54));
    crate.position.y = band.position.y = 0.8; canopy.position.y = 5.2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.2, 5), toonMat(0xe5dfd3));
      cord.position.set(sx * 0.85, 3, sz * 0.85); cord.rotation.z = sx * 0.22; group.add(cord);
    }
    group.add(crate, band, canopy); group.position.set(item.x, y, item.z); this.level.scene.add(group);
    this.level.world._addCollider(item.x, item.z, 1.35, y + 1.7, 1.2);
    if (!this.editor) this.airdrops.push({ ...item, group, crate, canopy, opened: false });
    return group;
  }

  _spawnChurch(item, y) {
    const building = this.level.world._makeHouse(item.x, item.z, item.ry, { w: 12, d: 16, h: 6.5 });
    const tower = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.2, 8, 4.2), toonMat(0xe8dfcf));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 5, 4), toonMat(0x596f8b));
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.2, 0.22), toonMat(0xe7b83f));
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.22, 0.22), toonMat(0xe7b83f));
    base.position.y = 4; roof.position.y = 10.5; roof.rotation.y = Math.PI / 4;
    crossV.position.y = 14; crossH.position.y = 14.3;
    tower.add(base, roof, crossV, crossH); tower.position.set(item.x, y, item.z - 5.5); tower.rotation.y = item.ry;
    this.level.scene.add(tower);
    return { building, tower };
  }

  _spawnTask(item, y) {
    const { level } = this;
    const quest = QUEST_SET.has(item.quest) ? item.quest : 'rescue';
    const task = { ...item, quest, done: false, progress: 0, targets: [], enemies: [], tools: [] };
    if (!this.editor) {
      const addBox = (x, z, color = 0xb08a5a) => {
        const mesh = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), toonMat(color));
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.16, 0.96), toonMat(0xffd23f));
        box.position.y = band.position.y = 0.36;
        mesh.add(box, band); mesh.position.set(x, level.world.groundH(x, z), z); level.scene.add(mesh);
        return { x, z, y: mesh.position.y, mesh, done: false };
      };
      if (quest === 'rescue') {
        task.prop = level.world._makeHouse(item.x, item.z, item.ry, { w: 8, d: 6, h: 3.4 });
        task.action = { x: item.x, z: item.z + 5 };
        task.people = [-1.2, 0, 1.2].map((ox) => {
          const person = new THREE.Group();
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.1, 8), toonMat(0x4ea7df));
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), toonMat(0xf0c49b));
          body.position.y = 0.55; head.position.y = 1.35; person.add(body, head);
          person.position.set(task.action.x + ox, level.world.groundH(task.action.x + ox, task.action.z + 1.5), task.action.z + 1.5);
          person.visible = false; level.scene.add(person); return person;
        });
      } else if (quest === 'collect') {
        task.targets = [[-5, -3], [5, -3], [-5, 4], [5, 4]].map(([x, z]) => addBox(item.x + x, item.z + z));
      } else if (quest === 'repair') {
        const tower = new THREE.Group();
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 7, 8), toonMat(0x8b949f));
        const dish = new THREE.Mesh(new THREE.SphereGeometry(1.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonMat(0x63b7de));
        mast.position.y = 3.5; dish.position.set(0, 6.3, 0); dish.rotation.x = Math.PI / 2;
        tower.add(mast, dish); tower.position.set(item.x, y, item.z); level.scene.add(tower);
        task.prop = tower; task.action = { x: item.x, z: item.z + 2.5 };
      } else if (quest === 'lights') {
        task.targets = [[-4, 3], [0, -4], [4, 3]].map(([ox, oz]) => {
          const mesh = new THREE.Group();
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.5, 8), toonMat(0x6f7780));
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: 0x30363d }));
          pole.position.y = 1.25; lamp.position.y = 2.65; mesh.add(pole, lamp);
          const x = item.x + ox, z = item.z + oz; mesh.position.set(x, level.world.groundH(x, z), z); level.scene.add(mesh);
          return { x, z, mesh, lamp, done: false };
        });
      } else if (quest === 'elites') {
        task.enemies = [0, 1, 2].map((i) => {
          const a = i * Math.PI * 2 / 3;
          const zombie = level.zombies.spawn(i === 1 ? 'tank' : 'walker', item.x + Math.cos(a) * 9, item.z + Math.sin(a) * 9, { elite: true, horde: false });
          zombie.hp = zombie.maxHp = Math.round(zombie.maxHp * 2.2); zombie.customTask = true; return zombie;
        });
      } else if (quest === 'warehouse') {
        task.prop = level.world._makeHouse(item.x, item.z, item.ry, { w: 12, d: 9, h: 4.2 });
        task.enemies = Array.from({ length: 8 }, (_, i) => {
          const a = i * Math.PI / 4;
          const zombie = level.zombies.spawn(i % 4 === 0 ? 'runner' : 'walker', item.x + Math.cos(a) * 10, item.z + Math.sin(a) * 10, { horde: false });
          zombie.customTask = true; return zombie;
        });
      } else if (quest === 'rebuild') {
        task.tools = ['axe', 'pickaxe'].map((kind, i) => {
          const mesh = makeGunMesh(kind).group;
          const x = item.x + (i ? 4 : -4), z = item.z - 5;
          mesh.scale.setScalar(2.1); mesh.rotation.set(-0.35, i ? -0.6 : 0.6, 0.15);
          mesh.position.set(x, level.world.groundH(x, z) + 0.8, z); level.scene.add(mesh);
          return { kind, x, z, mesh, done: false };
        });
        task.action = { x: item.x, z: item.z + 7 };
        task.buildProgress = 0;
      }
    }
    const target = this._taskTarget(task) || item;
    task.beam = level.effects.makeBeam(target.x, target.z, 0xffd23f, QUEST_INFO[quest].icon);
    return task;
  }

  select(type) {
    if (!this.editor || !TYPE_SET.has(type)) return false;
    if (TYPE_INFO[type].plus && !this.plus) return false;
    if (type === 'task' && this.selected === 'task') this.questIndex = (this.questIndex + 1) % this.questTypes.length;
    if (type === 'zombie' && this.selected === 'zombie' && this.plus) this.zombieIndex = (this.zombieIndex + 1) % ZOMBIE_TYPES.length;
    this.selected = type;
    this._renderTools();
    this._syncPreview();
    this.level.game.audio.click();
    return true;
  }

  _targetPoint() {
    const player = this.level.player;
    const dir = player.forwardVec(new THREE.Vector3());
    return { x: player.pos.x + dir.x * 18, z: player.pos.z + dir.z * 18 };
  }

  _placementError(type, x, z) {
    if (TYPE_INFO[type].plus && !this.plus) return t('Потрібен Створювач карт+');
    const radius = TYPE_INFO[type].radius;
    if (Math.abs(x) > 170 - radius || Math.abs(z) > 170 - radius) return t('Тут край карти');
    if (type === 'task' && this.data.objects.filter((item) => item.type === 'task').length >= MAX_TASKS) return t('На карті може бути максимум 3 завдання');
    const typeMax = TYPE_INFO[type].max;
    if (typeMax && this.data.objects.filter((item) => item.type === type).length >= typeMax) {
      return t(type === 'airdrop' ? 'На карті може бути максимум 2 аірдропи' : 'На карті може бути максимум 1 церква');
    }
    const spawn = CUSTOM_COUNTRY.map.spawn;
    if (Math.hypot(x - spawn.x, z - spawn.z) < SPAWN_CLEAR_RADIUS + radius) return t('Залиш місце для появи гравця');
    for (const item of this.data.objects) {
      if (Math.hypot(x - item.x, z - item.z) < radius + TYPE_INFO[item.type].radius + 0.5) return t('Тут уже стоїть інший обʼєкт');
    }
    return '';
  }

  _syncPreview() {
    if (!this.preview) return;
    this.preview.visible = !!this.selected;
    if (!this.selected) return;
    const point = this._targetPoint();
    const y = this.level.world.groundH(point.x, point.z);
    const radius = TYPE_INFO[this.selected].radius;
    this.preview.position.set(point.x, y + 0.08, point.z);
    this.preview.scale.setScalar(Math.max(0.8, radius / 1.35));
    this.preview.material.color.setHex(this._placementError(this.selected, point.x, point.z) ? 0xff5d5d : 0x5ad465);
  }

  placeSelected() {
    if (!this.selected) {
      this.level.game.hud.toast(t('Спочатку вибери предмет'));
      return false;
    }
    return this.place(this.selected);
  }

  place(type, point = null) {
    if (!this.editor || !TYPE_SET.has(type) || this.data.objects.length >= this.maxObjects) {
      if (this.data.objects.length >= this.maxObjects) this.level.game.hud.toast(t('Ліміт карти: {n} обʼєктів', { n: this.maxObjects }));
      return false;
    }
    const player = this.level.player;
    const target = point || this._targetPoint();
    const error = this._placementError(type, target.x, target.z);
    if (error) {
      this.level.game.audio.denied();
      this.level.game.hud.toast(error);
      return false;
    }
    const item = { type, x: target.x, z: target.z, ry: player.yaw };
    if (type === 'task') item.quest = this.questTypes[this.questIndex];
    if (type === 'zombie') item.zombieType = this.plus ? ZOMBIE_TYPES[this.zombieIndex] : 'walker';
    this.data.objects.push(item);
    this._spawn(item);
    this.level.world._buildGrid();
    if (type === 'task') this.questIndex = (this.questIndex + 1) % this.questTypes.length;
    this._renderTools();
    this._syncPreview();
    this.level.game.audio.click();
    return true;
  }

  undo() {
    if (!this.editor || !this.data.objects.length) return false;
    const draft = sanitizeCustomMap({ biome: this.data.biome, objects: this.data.objects.slice(0, -1) });
    this._closeTools();
    this.level.game.endLevel();
    this.level.game.startLevel('CUSTOM', { customMap: 'edit', customMapData: draft, customMapSlot: this.slot });
    return true;
  }

  save() {
    this.level.game.save[this.slot ? 'customMap2' : 'customMap'] = sanitizeCustomMap(this.data);
    this.level.game.saveGame();
    this.level.game.hud.toast(t('💾 Власну карту збережено!'));
    this._renderTools();
  }

  exit() {
    const saved = this.level.game.save[this.slot ? 'customMap2' : 'customMap'];
    if (JSON.stringify(sanitizeCustomMap(this.data)) !== JSON.stringify(sanitizeCustomMap(saved))
      && !confirm(t('Вийти без збереження змін?'))) return false;
    this._closeTools();
    this.level.game.endLevel();
    return true;
  }

  _openTools() {
    const el = document.getElementById('map-editor-tools');
    if (!el) return;
    el.classList.add('show');
    el.onclick = (event) => {
      const type = event.target.closest('[data-map-object]')?.dataset.mapObject;
      if (type) this.select(type);
      if (event.target.closest('#map-editor-place')) this.placeSelected();
      if (event.target.closest('#map-editor-undo')) this.undo();
      if (event.target.closest('#map-editor-save')) this.save();
      if (event.target.closest('#map-editor-exit')) this.exit();
      if (type || event.target.closest('#map-editor-place')) setTimeout(() => this.level && this.level.game.input.request(), 0);
    };
    for (const button of el.querySelectorAll('[data-map-fly]')) {
      const set = (value) => { this.flyY = value; };
      button.onpointerdown = () => set(button.dataset.mapFly === 'up' ? 1 : -1);
      button.onpointerup = button.onpointercancel = () => set(0);
    }
    for (const [i, type] of CUSTOM_MAP_TYPES.entries()) {
      const button = el.querySelector(`[data-map-object="${type}"]`);
      if (button) {
        button.hidden = !!TYPE_INFO[type].plus && !this.plus;
        button.textContent = `${i + 1} ${TYPE_INFO[type].icon} ${t(TYPE_INFO[type].name)}`;
      }
    }
    this._renderTools();
  }

  _closeTools() {
    const el = document.getElementById('map-editor-tools');
    if (el) el.classList.remove('show');
  }

  _renderTools() {
    const count = document.getElementById('map-editor-count');
    if (count) count.textContent = `${this.data.objects.length}/${this.maxObjects}`;
    const selected = document.getElementById('map-editor-selected');
    if (selected) selected.textContent = this.selected === 'task'
      ? `${QUEST_INFO[this.questTypes[this.questIndex]].icon} ${t(QUEST_INFO[this.questTypes[this.questIndex]].title)}`
      : (this.selected === 'zombie' && this.plus
        ? `🧟 ${t(ZOMBIE_NAMES[ZOMBIE_TYPES[this.zombieIndex]])}`
        : (this.selected ? `${TYPE_INFO[this.selected].icon} ${t(TYPE_INFO[this.selected].name)}` : t('нічого')));
    const undo = document.getElementById('map-editor-undo');
    if (undo) undo.disabled = !this.data.objects.length;
    for (const button of document.querySelectorAll('[data-map-object]')) {
      button.classList.toggle('on', button.dataset.mapObject === this.selected);
      if (button.dataset.mapObject === 'task') button.textContent = `6 ${QUEST_INFO[this.questTypes[this.questIndex]].icon} ${t(QUEST_INFO[this.questTypes[this.questIndex]].title)}`;
      if (button.dataset.mapObject === 'zombie' && this.plus) button.textContent = `4 🧟 ${t(ZOMBIE_NAMES[ZOMBIE_TYPES[this.zombieIndex]])}`;
    }
  }

  _fly(dt, input) {
    const player = this.level.player;
    const look = input.consumeMouse();
    player.yaw -= look.dx * 0.0022;
    player.pitch = clamp(player.pitch - look.dy * 0.0022, -1.45, 1.45);
    const forward = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0) - input.touchMove.z;
    const side = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0) + input.touchMove.x;
    const vertical = (input.down('Space') ? 1 : 0) - (input.down('ControlLeft') || input.down('ControlRight') ? 1 : 0) + this.flyY;
    const speed = (input.down('ShiftLeft') ? 28 : 15) * dt;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    const y = clamp(player.pos.y + vertical * speed, 3, 80);
    const x = clamp(player.pos.x + (fx * forward + rx * side) * speed, -175, 175);
    const z = clamp(player.pos.z + (fz * forward + rz * side) * speed, -175, 175);
    const solved = this.level.world.collide(x, z, 0.45, y - 1.6);
    player.pos.set(solved.x, y, solved.z);
    player.camera.position.copy(player.pos);
    player.camera.rotation.set(player.pitch, player.yaw, 0);
    player.rig.group.visible = false;
  }

  _taskTarget(task) {
    if (task.done) return null;
    if (task.quest === 'collect' || task.quest === 'lights') return task.targets.find((target) => !target.done) || null;
    if (task.quest === 'elites' || task.quest === 'warehouse') {
      const enemy = task.enemies.find((zombie) => zombie.state !== 'dead' && !zombie.gone);
      return enemy ? { x: enemy.x, z: enemy.z } : null;
    }
    if (task.quest === 'rebuild') return task.tools.find((tool) => !tool.done) || task.action;
    return task.action || task;
  }

  _finishTask(task, message) {
    if (task.done) return;
    task.done = true;
    task.progress = QUEST_INFO[task.quest].total;
    task.beam.remove();
    this.level.audio.mission();
    this.level.game.hud.toast(t(message || '⭐ Завдання виконано!'));
  }

  _updateTask(task, dt, input, allowControl) {
    const { level } = this;
    const player = level.player;
    const near = (target, radius = 3.5) => target && Math.hypot(player.pos.x - target.x, player.pos.z - target.z) < radius;
    if (task.quest === 'rescue' && near(task.action)) {
      this.prompt = { text: t('Натисни {k} — врятувати людей', { k: interactKey() }), hold: false };
      if (allowControl && input.pressed('KeyE')) {
        task.people.forEach((person) => { person.visible = true; });
        this._finishTask(task, '🆘 Людей врятовано!');
        input.justPressed.delete('KeyE');
      }
    } else if (task.quest === 'collect') {
      const target = task.targets.find((crate) => !crate.done && near(crate));
      if (target) {
        this.prompt = { text: t('Натисни {k} — підібрати ящик', { k: interactKey() }), hold: false };
        if (allowControl && input.pressed('KeyE')) {
          target.done = true; task.progress++; level.scene.remove(target.mesh); level.audio.pickup();
          if (task.progress >= 4) this._finishTask(task, '📦 Усі 4 ящики зібрано!');
          input.justPressed.delete('KeyE');
        }
      }
    } else if (task.quest === 'repair' && near(task.action)) {
      this.prompt = { text: t('Тримай {k} — полагодити радіовежу', { k: interactKey() }), hold: true, progress: task.progress };
      if (allowControl && input.down('KeyE')) {
        task.progress = Math.min(1, task.progress + dt / 6);
        if (task.progress >= 1) this._finishTask(task, '📡 Радіовежу полагоджено!');
      }
    } else if (task.quest === 'lights') {
      const target = task.targets.find((lamp) => !lamp.done && near(lamp));
      if (target) {
        this.prompt = { text: t('Натисни {k} — засвітити ліхтар', { k: interactKey() }), hold: false };
        if (allowControl && input.pressed('KeyE')) {
          target.done = true; task.progress++; target.lamp.material.color.setHex(0xffe066); level.audio.click();
          if (task.progress >= 3) this._finishTask(task, '🔦 Усі 3 ліхтарі світять!');
          input.justPressed.delete('KeyE');
        }
      }
    } else if (task.quest === 'elites' || task.quest === 'warehouse') {
      task.progress = task.enemies.filter((zombie) => zombie.state === 'dead' || zombie.gone).length;
      if (task.progress >= QUEST_INFO[task.quest].total) this._finishTask(task, task.quest === 'elites' ? '👹 Елітних зомбі переможено!' : '🏭 Склад зачищено!');
    } else if (task.quest === 'rebuild') {
      const tool = task.tools.find((candidate) => !candidate.done && near(candidate));
      if (tool) {
        this.prompt = { text: t('Натисни {k} — взяти {item}', { k: interactKey(), item: tool.kind === 'axe' ? t('сокиру') : t('кірку') }), hold: false };
        if (allowControl && input.pressed('KeyE')) {
          tool.done = true; task.progress++; level.scene.remove(tool.mesh); level.audio.pickup();
          player.giveWeapon(tool.kind);
          input.justPressed.delete('KeyE');
        }
      } else if (task.tools.every((candidate) => candidate.done) && near(task.action, 6)) {
        this.prompt = { text: t('Тримай {k} — відновити центр міста', { k: interactKey() }), hold: true, progress: task.buildProgress };
        if (allowControl && input.down('KeyE')) {
          task.buildProgress = Math.min(1, task.buildProgress + dt / 12);
          if (task.buildProgress >= 1) {
            task.prop = level.world._makeHouse(task.x, task.z, task.ry, { w: 16, d: 11, h: 6.5 });
            this._finishTask(task, '🏛️ Центр міста відновлено!');
          }
        }
      }
    }
    const target = this._taskTarget(task);
    if (target && task.beam.group) {
      task.beam.group.position.x += (target.x - task.beam.group.position.x) * Math.min(1, dt * 6);
      task.beam.group.position.z += (target.z - task.beam.group.position.z) * Math.min(1, dt * 6);
    }
  }

  update(dt, input, allowControl) {
    this.prompt = null;
    if (this.editor) {
      for (const [i, type] of CUSTOM_MAP_TYPES.entries()) if (input.pressed(`Digit${i + 1}`)) this.select(type);
      if (allowControl && input.pressed('KeyE')) this.placeSelected();
      if (allowControl || input.touchMode) this._fly(dt, input);
      this._syncPreview();
      return;
    }
    for (const task of this.tasks) {
      if (task.done) continue;
      task.beam.update(dt);
      this._updateTask(task, dt, input, allowControl);
    }
    for (const drop of this.airdrops) {
      if (drop.opened || Math.hypot(this.level.player.pos.x - drop.x, this.level.player.pos.z - drop.z) >= 3.5) continue;
      this.prompt = { text: t('Натисни {k} — відкрити аірдроп', { k: interactKey() }), hold: false };
      if (allowControl && input.pressed('KeyE')) {
        drop.opened = true; drop.canopy.visible = false; drop.crate.rotation.x = -0.3; this.level.game.save.coins += 100;
        this.level.game.saveGame(); this.level.audio.pickup(); this.level.game.hud.toast(t('🪂 Аірдроп: +100 монет'));
        input.justPressed.delete('KeyE');
      }
    }
    if (!this.done && this.tasks.length && this.tasks.every((task) => task.done) && !this.bossStarted) {
      if (this.plus) {
        this.bossStarted = true;
        this.boss = this.level.zombies.spawnBoss(5500);
        this.boss.hp = this.boss.maxHp = 5500;
        this.level.audio.bossRoar();
        this.level.game.hud.banner(t('👑 ФІНАЛЬНИЙ БОС!'), t('Переможи володаря карти — 5500 HP'));
      } else this._completeMap();
    }
    if (!this.done && this.bossStarted && (!this.boss || this.boss.state === 'dead' || this.boss.gone)) {
      this._completeMap();
    }
  }

  _completeMap() {
    if (this.done) return;
    this.done = true;
    this.level.game.hud.banner(t('🏆 КАРТУ ПРОЙДЕНО!'), t('Усі твої завдання виконано.'));
  }

  getHudList() {
    if (this.editor) return [{ icon: '🧱', title: t('Літай і став обʼєкти кнопками редактора'), done: false }];
    if (!this.tasks.length) return [{ icon: '🗺️', title: t('Досліджуй власну карту'), done: false }];
    const list = this.tasks.map((task) => {
      const info = QUEST_INFO[task.quest];
      const progress = info.total > 1 ? ` ${Math.min(info.total, task.progress | 0)}/${info.total}` : '';
      return { icon: info.icon, title: `${t(info.title)}${progress}`, done: task.done };
    });
    if (this.bossStarted && !this.done) list.push({ icon: '👑', title: t('Переможи фінального боса · 5500 HP'), done: false });
    return list;
  }

  get() { return null; }

  getMarkers() {
    const markers = this.tasks.filter((task) => !task.done).map((task) => {
      const target = this._taskTarget(task) || task;
      return { x: target.x, z: target.z, icon: QUEST_INFO[task.quest].icon };
    });
    if (this.bossStarted && this.boss && !this.done) markers.push({ x: this.boss.x, z: this.boss.z, icon: '👑' });
    return markers;
  }
}
