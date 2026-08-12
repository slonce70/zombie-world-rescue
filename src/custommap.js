import * as THREE from 'three';
import { t, interactKey } from './i18n.js';
import { clamp } from './utils.js';
import { toonMat } from './renderkit.js';
import { makeCivilian, makeGunMesh } from './characters.js';
import {
  CUSTOM_MAP_TYPES,
  CUSTOM_MAP_QUESTS,
  CUSTOM_MAP_ZOMBIES,
  CUSTOM_MAP_RADII,
  CUSTOM_MAP_TYPE_LIMITS,
  CUSTOM_MAP_LIMITS,
  sanitizeCustomMap,
  validateCustomPlacement,
  deriveCustomMapTier,
  mapSizeScale,
} from '../worker/community-schema.mjs';

export { CUSTOM_MAP_TYPES, sanitizeCustomMap };

const TYPE_SET = new Set(CUSTOM_MAP_TYPES);
const BASE_MAX_OBJECTS = CUSTOM_MAP_LIMITS.baseObjects;
const PLUS_MAX_OBJECTS = CUSTOM_MAP_LIMITS.plusObjects;
const TYPE_INFO = Object.freeze({
  house: { icon: '🏠', name: 'Дім', radius: CUSTOM_MAP_RADII.house },
  tree: { icon: '🌲', name: 'Дерево', radius: CUSTOM_MAP_RADII.tree },
  lake: { icon: '💧', name: 'Озеро', radius: CUSTOM_MAP_RADII.lake },
  zombie: { icon: '🧟', name: 'Зомбі', radius: CUSTOM_MAP_RADII.zombie },
  rock: { icon: '🪨', name: 'Камінь', radius: CUSTOM_MAP_RADII.rock },
  task: { icon: '⭐', name: 'Завдання', radius: CUSTOM_MAP_RADII.task },
  airdrop: { icon: '🪂', name: 'Ящик з парашутом', radius: CUSTOM_MAP_RADII.airdrop, plus: true, max: CUSTOM_MAP_TYPE_LIMITS.airdrop },
  church: { icon: '⛪', name: 'Церква', radius: CUSTOM_MAP_RADII.church, plus: true, max: CUSTOM_MAP_TYPE_LIMITS.church },
  largehouse: { icon: '🏘️', name: 'Велика хата', radius: CUSTOM_MAP_RADII.largehouse, max: CUSTOM_MAP_TYPE_LIMITS.largehouse },
});
const QUEST_TYPES = CUSTOM_MAP_QUESTS;
const QUEST_INFO = Object.freeze({
  rescue: { icon: '🆘', title: 'Врятуй людей у хліві', total: 1 },
  collect: { icon: '📦', title: 'Збери 4 ящики припасів', total: 4 },
  repair: { icon: '📡', title: 'Полагодь радіовежу', total: 1 },
  lights: { icon: '🔦', title: 'Засвіти 3 ліхтарі', total: 3 },
  elites: { icon: '👹', title: 'Переможи 3 елітних зомбі', total: 3 },
  warehouse: { icon: '🏭', title: 'Зачисть склад від зомбі', total: 8 },
  rebuild: { icon: '🏗️', title: 'Знайди сокиру й кірку та віднови центр міста', total: 3, plus: true },
});
const QUEST_SET = new Set(QUEST_TYPES);
export { QUEST_INFO as CUSTOM_QUEST_INFO }; // назви карт спільноти будуються з тих самих enum
const ZOMBIE_TYPES = CUSTOM_MAP_ZOMBIES;
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

export class CustomMapMode {
  constructor(level, raw, { editor = false, slot = 0, tier = null } = {}) {
    this.level = level;
    this.editor = editor;
    this.slot = slot === 1 ? 1 : 0;
    this.editorPlus = level.game.save.upgrades.mapeditorplus > 0;
    this.data = sanitizeCustomMap(raw);
    this.tier = tier === 'plus' || tier === 'base' ? tier : deriveCustomMapTier(this.data);
    this.plus = this.editor ? this.editorPlus : this.tier === 'plus';
    this.authority = !level.mirror;
    this.mirror = !this.authority;
    this.maxObjects = this.editorPlus ? PLUS_MAX_OBJECTS : BASE_MAX_OBJECTS;
    this.prompt = null;
    this.tasks = [];
    this.civilians = [];
    this.airdrops = [];
    this.crateReady = false;
    this.done = false;
    this.flyY = 0;
    this.selected = null;
    this.questTypes = this.editorPlus ? QUEST_TYPES : QUEST_TYPES.filter((quest) => !QUEST_INFO[quest].plus);
    this.questIndex = this.data.objects.filter((item) => item.type === 'task').length % this.questTypes.length;
    this.zombieIndex = 0;
    this.bossStarted = false;
    this.boss = null;
    this.spawned = Object.fromEntries(CUSTOM_MAP_TYPES.map((type) => [type, 0]));
    for (const item of this.data.objects) this._spawn(item);
    level.world._buildGrid();
    if (this.editor) {
      level.player.pos.set(0, 14, CUSTOM_MAP_LIMITS.spawnZ * mapSizeScale(level.mapSize));
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
    } else if (item.type === 'largehouse') {
      object = world._makeHouse(item.x, item.z, item.ry, { w: 14, d: 11, h: 6 });
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
      if (this.editor || this.authority) {
        const zombieType = this.plus && ZOMBIE_SET.has(item.zombieType) ? item.zombieType : 'walker';
        object = level.zombies.spawn(zombieType, item.x, item.z, { horde: false });
        object.customPlaced = true;
      }
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
        task.people = ['medic', 'granny', 'kid'].map((kind, i) => {
          const person = makeCivilian(kind, level.rng).group;
          const ox = i * 1.2 - 1.2;
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
        task.enemies = this.authority ? [0, 1, 2].map((i) => {
          const a = i * Math.PI * 2 / 3;
          const zombie = level.zombies.spawn(i === 1 ? 'tank' : 'walker', item.x + Math.cos(a) * 9, item.z + Math.sin(a) * 9, { elite: true, horde: false });
          zombie.hp = zombie.maxHp = Math.round(zombie.maxHp * 2.2); zombie.customTask = true; return zombie;
        }) : [];
      } else if (quest === 'warehouse') {
        task.prop = level.world._makeHouse(item.x, item.z, item.ry, { w: 12, d: 9, h: 4.2 });
        task.enemies = this.authority ? Array.from({ length: 8 }, (_, i) => {
          const a = i * Math.PI / 4;
          const zombie = level.zombies.spawn(i % 4 === 0 ? 'runner' : 'walker', item.x + Math.cos(a) * 10, item.z + Math.sin(a) * 10, { horde: false });
          zombie.customTask = true; return zombie;
        }) : [];
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
    if (TYPE_INFO[type].plus && !this.editorPlus) return false;
    if (type === 'task' && this.selected === 'task') this.questIndex = (this.questIndex + 1) % this.questTypes.length;
    if (type === 'zombie' && this.selected === 'zombie' && this.editorPlus) this.zombieIndex = (this.zombieIndex + 1) % ZOMBIE_TYPES.length;
    this.selected = type;
    this._renderTools();
    this._syncPreview();
    this.level.game.audio.click();
    return true;
  }

  _targetPoint() {
    const player = this.level.player;
    return { x: player.pos.x - Math.sin(player.yaw) * 18, z: player.pos.z - Math.cos(player.yaw) * 18 };
  }

  _candidate(type, x, z) {
    const yaw = this.level.player.yaw;
    const item = { type, x, z, ry: Math.atan2(Math.sin(yaw), Math.cos(yaw)) };
    if (type === 'task') item.quest = this.questTypes[this.questIndex];
    if (type === 'zombie') item.zombieType = this.editorPlus ? ZOMBIE_TYPES[this.zombieIndex] : 'walker';
    return item;
  }

  _placementError(candidate) {
    const result = validateCustomPlacement(this.data, candidate, {
      plus: this.editorPlus,
      mapSize: this.level.mapSize,
    });
    if (result.ok) return '';
    if (result.code === 'plus_required') return t('Потрібен Створювач карт+');
    if (result.code === 'object_limit') return t('Ліміт карти: {n} обʼєктів', { n: this.maxObjects });
    if (result.code === 'task_limit') return t('На карті може бути максимум 3 завдання');
    if (result.code === 'type_limit') {
      return t(candidate.type === 'airdrop' ? 'На карті може бути максимум 2 ящики з парашутом'
        : candidate.type === 'church' ? 'На карті може бути максимум 1 церква' : 'На карті може бути максимум 5 великих хат');
    }
    if (result.code === 'spawn') return t('Залиш місце для появи гравця');
    if (result.code === 'overlap') return t('Тут уже стоїть інший обʼєкт');
    return t('Тут край карти');
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
    this.preview.material.color.setHex(this._placementError(this._candidate(this.selected, point.x, point.z)) ? 0xff5d5d : 0x5ad465);
  }

  placeSelected() {
    if (!this.selected) {
      this.level.game.hud.toast(t('Спочатку вибери предмет'));
      return false;
    }
    return this.place(this.selected);
  }

  place(type, point = null) {
    if (!this.editor || !TYPE_SET.has(type)) return false;
    const target = point || this._targetPoint();
    const item = this._candidate(type, target.x, target.z);
    const error = this._placementError(item);
    if (error) {
      this.level.game.audio.denied();
      this.level.game.hud.toast(error);
      return false;
    }
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
      if (event.target.closest('#map-editor-publish')) this.level.game.community.startVerify(this.level);
      if (event.target.closest('#map-editor-exit')) this.exit();
      if (type || event.target.closest('#map-editor-place')) this.level.game.input.request();
    };
    for (const button of el.querySelectorAll('[data-map-fly]')) {
      const set = (value) => { this.flyY = value; };
      button.onpointerdown = () => set(button.dataset.mapFly === 'up' ? 1 : -1);
      button.onpointerup = button.onpointercancel = () => set(0);
    }
    for (const [i, type] of CUSTOM_MAP_TYPES.entries()) {
      const button = el.querySelector(`[data-map-object="${type}"]`);
      if (button) {
        button.hidden = !!TYPE_INFO[type].plus && !this.editorPlus;
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
      : (this.selected === 'zombie' && this.editorPlus
        ? `🧟 ${t(ZOMBIE_NAMES[ZOMBIE_TYPES[this.zombieIndex]])}`
        : (this.selected ? `${TYPE_INFO[this.selected].icon} ${t(TYPE_INFO[this.selected].name)}` : t('нічого')));
    const undo = document.getElementById('map-editor-undo');
    if (undo) undo.disabled = !this.data.objects.length;
    for (const button of document.querySelectorAll('[data-map-object]')) {
      button.classList.toggle('on', button.dataset.mapObject === this.selected);
      if (button.dataset.mapObject === 'task') button.textContent = `6 ${QUEST_INFO[this.questTypes[this.questIndex]].icon} ${t(QUEST_INFO[this.questTypes[this.questIndex]].title)}`;
      if (button.dataset.mapObject === 'zombie' && this.editorPlus) button.textContent = `4 🧟 ${t(ZOMBIE_NAMES[ZOMBIE_TYPES[this.zombieIndex]])}`;
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
    const flyBound = 175 * mapSizeScale(this.level.mapSize);
    const x = clamp(player.pos.x + (fx * forward + rx * side) * speed, -flyBound, flyBound);
    const z = clamp(player.pos.z + (fz * forward + rz * side) * speed, -flyBound, flyBound);
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

  // 🤝 скільки віддалених гравців тримають E у радіусі точки (лише в авторитета)
  _remoteHolders(x, z, radius) {
    const players = this.level.players;
    if (!players) return 0;
    let holders = 0;
    for (const player of players) {
      if (player.pid === 1 || player.health <= 0 || !player.holdE) continue;
      if (Math.hypot(player.pos.x - x, player.pos.z - z) < radius) holders++;
    }
    return holders;
  }

  // ящик з парашутом на custom-карті дає ЛИШЕ run-local патрони і лікування — жодних монет і прогресу
  _openAirdrop(drop, { local = true } = {}) {
    if (drop.opened) return false;
    drop.opened = true;
    drop.canopy.visible = false;
    drop.crate.rotation.x = -0.3;
    if (local) {
      this.level.player.addAmmo(30);
      this.level.player.heal(30);
      this.level.audio.pickup();
      this.level.game.hud.toast(t('🪂 Ящик з парашутом: +30 патронів · +30 здоровʼя'));
    }
    return true;
  }

  // 🛡️ єдина точка входу для взаємодій гостя (HostNet._onUse → kind 'cmap').
  // Хост перевіряє індекси, фазу, одноразовість і відстань сам — координати гостя
  // тут не використовуються, лише його позиція в снапшоті через near().
  useCmap(from, near, d) {
    if (this.editor || !this.authority || this.done || !d) return;
    const index = Number.isInteger(d.i) ? d.i : -1;
    const sub = Number.isInteger(d.s) ? d.s : -1;
    const level = this.level;
    if (d.a === 'airdrop') {
      const drop = this.airdrops[index];
      // ефекти ящика з парашутом лишаються в гостя (він застосував їх локально) —
      // авторитет лише фіксує сам факт відкриття у спільному стані
      if (drop && !drop.opened && near(drop.x, drop.z, 3.5)) this._openAirdrop(drop, { local: false });
      return;
    }
    const task = this.tasks[index];
    if (!task || task.done) return;
    if (d.a === 'rescue' && task.quest === 'rescue') {
      if (!near(task.action.x, task.action.z, 3.5)) return;
      task.people.forEach((person) => { person.visible = true; });
      this._finishTask(task, '🆘 Людей врятовано!');
    } else if (d.a === 'collect' && task.quest === 'collect') {
      const target = task.targets[sub];
      if (!target || target.done || !near(target.x, target.z, 3.5)) return;
      target.done = true; task.progress++; level.scene.remove(target.mesh);
      if (task.progress >= QUEST_INFO.collect.total) this._finishTask(task, '📦 Усі 4 ящики зібрано!');
    } else if (d.a === 'lights' && task.quest === 'lights') {
      const target = task.targets[sub];
      if (!target || target.done || !near(target.x, target.z, 3.5)) return;
      target.done = true; task.progress++; target.lamp.material.color.setHex(0xffe066);
      if (task.progress >= QUEST_INFO.lights.total) this._finishTask(task, '🔦 Усі 3 ліхтарі світять!');
    } else if (d.a === 'tool' && task.quest === 'rebuild') {
      const tool = task.tools[sub];
      if (!tool || tool.done || !near(tool.x, tool.z, 3.5)) return;
      tool.done = true; task.progress++; level.scene.remove(tool.mesh);
    }
  }

  // --- гість: дзеркальний цикл — підказки, маяки, наміри до хоста ---
  _updateMirror(dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    const net = level.net;
    if (net) net.holdE = false;
    const near = (target, radius = 3.5) => target && Math.hypot(player.pos.x - target.x, player.pos.z - target.z) < radius;
    let pressE = allowControl && input.pressed('KeyE');
    const send = (a, extra = {}) => {
      if (net) net.sendUse('cmap', { a, ...extra });
      input.justPressed.delete('KeyE');
      pressE = false;
    };
    for (const [index, task] of this.tasks.entries()) {
      if (task.done) continue;
      task.beam.update(dt);
      if (task.quest === 'rescue' && near(task.action)) {
        this.prompt = { text: t('Натисни {k} — врятувати людей', { k: interactKey() }), hold: false };
        if (pressE) send('rescue', { i: index });
      } else if (task.quest === 'collect') {
        const sub = task.targets.findIndex((crate) => !crate.done && near(crate));
        if (sub >= 0) {
          this.prompt = { text: t('Натисни {k} — підібрати ящик', { k: interactKey() }), hold: false };
          if (pressE) send('collect', { i: index, s: sub });
        }
      } else if (task.quest === 'repair' && near(task.action)) {
        this.prompt = { text: t('Тримай {k} — полагодити радіовежу', { k: interactKey() }), hold: true, progress: task.progress };
        if (net) net.holdE = true;
      } else if (task.quest === 'lights') {
        const sub = task.targets.findIndex((lamp) => !lamp.done && near(lamp));
        if (sub >= 0) {
          this.prompt = { text: t('Натисни {k} — засвітити ліхтар', { k: interactKey() }), hold: false };
          if (pressE) send('lights', { i: index, s: sub });
        }
      } else if (task.quest === 'rebuild') {
        const sub = task.tools.findIndex((candidate) => !candidate.done && near(candidate));
        if (sub >= 0) {
          const tool = task.tools[sub];
          this.prompt = { text: t('Натисни {k} — взяти {item}', { k: interactKey(), item: tool.kind === 'axe' ? t('сокиру') : t('кірку') }), hold: false };
          if (pressE) {
            player.giveWeapon(tool.kind); // інструмент — особистий предмет гостя, не спільний стан
            level.audio.pickup();
            send('tool', { i: index, s: sub });
          }
        } else if (task.tools.every((candidate) => candidate.done) && near(task.action, 6)) {
          this.prompt = { text: t('Тримай {k} — відновити центр міста', { k: interactKey() }), hold: true, progress: task.buildProgress };
          if (net) net.holdE = true;
        }
      }
    }
    for (const [index, drop] of this.airdrops.entries()) {
      if (drop.opened || !near(drop, 3.5)) continue;
      this.prompt = { text: t('Натисни {k} — відкрити ящик з парашутом', { k: interactKey() }), hold: false };
      if (pressE) {
        player.addAmmo(30);
        player.heal(30);
        level.audio.pickup();
        level.game.hud.toast(t('🪂 Ящик з парашутом: +30 патронів · +30 здоровʼя'));
        send('airdrop', { i: index });
      }
    }
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
    } else if (task.quest === 'repair') {
      // кооп: рахуємо всіх, хто тримає E біля вежі — разом швидше (патерн місій кампанії)
      let holders = this._remoteHolders(task.action.x, task.action.z, 3.5);
      if (near(task.action)) {
        this.prompt = { text: t('Тримай {k} — полагодити радіовежу', { k: interactKey() }), hold: true, progress: task.progress };
        if (allowControl && input.down('KeyE')) holders++;
      }
      if (holders > 0) {
        task.progress = Math.min(1, task.progress + (dt * holders) / 6);
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
      } else if (task.tools.every((candidate) => candidate.done)) {
        let holders = this._remoteHolders(task.action.x, task.action.z, 6);
        if (near(task.action, 6)) {
          this.prompt = { text: t('Тримай {k} — відновити центр міста', { k: interactKey() }), hold: true, progress: task.buildProgress };
          if (allowControl && input.down('KeyE')) holders++;
        }
        if (holders > 0) {
          task.buildProgress = Math.min(1, task.buildProgress + (dt * holders) / 12);
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
    if (!this.authority) {
      this._updateMirror(dt, input, allowControl);
      return;
    }
    for (const task of this.tasks) {
      if (task.done) continue;
      task.beam.update(dt);
      this._updateTask(task, dt, input, allowControl);
    }
    for (const drop of this.airdrops) {
      if (drop.opened || Math.hypot(this.level.player.pos.x - drop.x, this.level.player.pos.z - drop.z) >= 3.5) continue;
      this.prompt = { text: t('Натисни {k} — відкрити ящик з парашутом', { k: interactKey() }), hold: false };
      if (allowControl && input.pressed('KeyE')) {
        this._openAirdrop(drop);
        input.justPressed.delete('KeyE');
      }
    }
    if (!this.done && this.tasks.length && this.tasks.every((task) => task.done) && !this.bossStarted) {
      if (this.plus) {
        this.bossStarted = true;
        this.boss = this.level.zombies.spawnBoss(5500);
        this.boss.hp = this.boss.maxHp = 5500;
        this.boss.noLeash = true;
        this.level.audio.bossRoar();
        this.level.game.hud.banner(t('👑 ФІНАЛЬНИЙ БОС!'), t('Переможи володаря карти — 5500 HP'));
      } else this._completeMap();
    }
  }

  onBossDied(boss) {
    if (this.editor || !this.authority || this.done || !this.bossStarted || boss !== this.boss) return false;
    this.boss = null;
    this._completeMap();
    return true;
  }

  _completeMap() {
    if (this.done) return;
    this.done = true;
    this.level.game._endCommunityMap(true);
  }

  netState() {
    const mask = (items) => items.reduce((bits, item, index) => bits | (item.done ? (1 << index) : 0), 0);
    return {
      d: this.done ? 1 : 0,
      b: this.bossStarted ? 1 : 0,
      a: mask(this.airdrops),
      t: this.tasks.map((task) => ({
        d: task.done ? 1 : 0,
        p: Number.isFinite(task.progress) ? task.progress : 0,
        g: Number.isFinite(task.buildProgress) ? task.buildProgress : 0,
        x: mask(task.targets || []),
        o: mask(task.tools || []),
      })),
    };
  }

  netFullState() {
    return this.netState();
  }

  applyNet(state) {
    if (!state || typeof state !== 'object' || !Array.isArray(state.t)) return;
    for (let index = 0; index < this.tasks.length; index++) {
      const task = this.tasks[index];
      const next = state.t[index];
      if (!next || typeof next !== 'object') continue;
      const targetMask = Number.isInteger(next.x) && next.x >= 0 ? next.x : 0;
      const toolMask = Number.isInteger(next.o) && next.o >= 0 ? next.o : 0;
      for (let i = 0; i < task.targets.length; i++) {
        const target = task.targets[i];
        if (!(targetMask & (1 << i)) || target.done) continue;
        target.done = true;
        if (task.quest === 'lights' && target.lamp) target.lamp.material.color.setHex(0xffe066);
        else if (target.mesh) this.level.scene.remove(target.mesh);
      }
      for (let i = 0; i < task.tools.length; i++) {
        const tool = task.tools[i];
        if (!(toolMask & (1 << i)) || tool.done) continue;
        tool.done = true;
        if (tool.mesh) this.level.scene.remove(tool.mesh);
      }
      if (Number.isFinite(next.p)) task.progress = Math.max(task.progress || 0, next.p);
      if (Number.isFinite(next.g)) task.buildProgress = Math.max(task.buildProgress || 0, Math.min(1, next.g));
      if (next.d && !task.done) {
        task.done = true;
        if (task.quest === 'rescue') task.people.forEach((person) => { person.visible = true; });
        if (task.quest === 'rebuild' && !task.prop) {
          task.prop = this.level.world._makeHouse(task.x, task.z, task.ry, { w: 16, d: 11, h: 6.5 });
        }
        task.beam.remove();
      }
    }
    const airdropMask = Number.isInteger(state.a) && state.a >= 0 ? state.a : 0;
    for (let i = 0; i < this.airdrops.length; i++) {
      const drop = this.airdrops[i];
      if (!(airdropMask & (1 << i)) || drop.opened) continue;
      drop.opened = true;
      drop.canopy.visible = false;
      drop.crate.rotation.x = -0.3;
    }
    if (state.b) this.bossStarted = true;
    if (state.d && !this.done) {
      this.done = true;
      this.level.game._endCommunityMap(true);
    }
  }

  applyNetFull(state) {
    this.applyNet(state);
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
