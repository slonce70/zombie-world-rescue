import * as THREE from 'three';
import { t, interactKey } from './i18n.js';
import { clamp } from './utils.js';
import { toonMat } from './renderkit.js';

export const CUSTOM_MAP_TYPES = Object.freeze(['house', 'tree', 'lake', 'zombie', 'rock', 'task']);
const TYPE_SET = new Set(CUSTOM_MAP_TYPES);
const MAX_OBJECTS = 120;
const TYPE_INFO = Object.freeze({
  house: { icon: '🏠', name: 'Дім', radius: 4.5 },
  tree: { icon: '🌲', name: 'Дерево', radius: 0.8 },
  lake: { icon: '💧', name: 'Озеро', radius: 6.5 },
  zombie: { icon: '🧟', name: 'Зомбі', radius: 1 },
  rock: { icon: '🪨', name: 'Камінь', radius: 1.5 },
  task: { icon: '⭐', name: 'Завдання', radius: 0.8 },
});
const SPAWN_CLEAR_RADIUS = 10;

export const CUSTOM_COUNTRY = Object.freeze({
  id: 'CUSTOM', name: t('Моя карта'), flag: '🧱', seed: 73421, biome: 'summer',
  difficulty: { hp: 1, dmg: 1, counts: 1 }, extraZombie: null, shieldGuards: 0,
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
  return {
    objects: objects.slice(0, MAX_OBJECTS).flatMap((item) => {
      if (!item || !TYPE_SET.has(item.type)) return [];
      const x = Number(item.x), z = Number(item.z), ry = Number(item.ry) || 0;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
      return [{ type: item.type, x: clamp(x, -170, 170), z: clamp(z, -170, 170), ry: clamp(ry, -Math.PI, Math.PI) }];
    }),
  };
}

export class CustomMapMode {
  constructor(level, raw, editor = false) {
    this.level = level;
    this.editor = editor;
    this.data = sanitizeCustomMap(raw);
    this.prompt = null;
    this.tasks = [];
    this.civilians = [];
    this.crateReady = false;
    this.done = false;
    this.flyY = 0;
    this.selected = null;
    this.spawned = Object.fromEntries(CUSTOM_MAP_TYPES.map((type) => [type, 0]));
    for (const item of this.data.objects) this._spawn(item);
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
      object = level.zombies.spawn('walker', item.x, item.z, { horde: false });
      object.customPlaced = true;
    } else if (item.type === 'task') {
      const beam = level.effects.makeBeam(item.x, item.z, 0xffd23f, '⭐');
      object = { ...item, beam, done: false };
      this.tasks.push(object);
    }
    this.spawned[item.type]++;
    return object;
  }

  select(type) {
    if (!this.editor || !TYPE_SET.has(type)) return false;
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
    if (Math.abs(x) > 170 || Math.abs(z) > 170) return t('Тут край карти');
    const spawn = CUSTOM_COUNTRY.map.spawn;
    const radius = TYPE_INFO[type].radius;
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
    if (!this.editor || !TYPE_SET.has(type) || this.data.objects.length >= MAX_OBJECTS) {
      if (this.data.objects.length >= MAX_OBJECTS) this.level.game.hud.toast(t('Ліміт карти: 120 обʼєктів'));
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
    this.data.objects.push(item);
    this._spawn(item);
    this._renderTools();
    this._syncPreview();
    this.level.game.audio.click();
    return true;
  }

  undo() {
    if (!this.editor || !this.data.objects.length) return false;
    const draft = sanitizeCustomMap({ objects: this.data.objects.slice(0, -1) });
    this._closeTools();
    this.level.game.endLevel();
    this.level.game.startLevel('CUSTOM', { customMap: 'edit', customMapData: draft });
    return true;
  }

  save() {
    this.level.game.save.customMap = sanitizeCustomMap(this.data);
    this.level.game.saveGame();
    this.level.game.hud.toast(t('💾 Власну карту збережено!'));
    this._renderTools();
  }

  exit() {
    if (JSON.stringify(sanitizeCustomMap(this.data)) !== JSON.stringify(sanitizeCustomMap(this.level.game.save.customMap))
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
      if (button) button.textContent = `${i + 1} ${TYPE_INFO[type].icon} ${t(TYPE_INFO[type].name)}`;
    }
    this._renderTools();
  }

  _closeTools() {
    const el = document.getElementById('map-editor-tools');
    if (el) el.classList.remove('show');
  }

  _renderTools() {
    const count = document.getElementById('map-editor-count');
    if (count) count.textContent = `${this.data.objects.length}/${MAX_OBJECTS}`;
    const selected = document.getElementById('map-editor-selected');
    if (selected) selected.textContent = this.selected ? `${TYPE_INFO[this.selected].icon} ${t(TYPE_INFO[this.selected].name)}` : t('нічого');
    const undo = document.getElementById('map-editor-undo');
    if (undo) undo.disabled = !this.data.objects.length;
    for (const button of document.querySelectorAll('[data-map-object]')) {
      button.classList.toggle('on', button.dataset.mapObject === this.selected);
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
    player.pos.x = clamp(player.pos.x + (fx * forward + rx * side) * speed, -175, 175);
    player.pos.z = clamp(player.pos.z + (fz * forward + rz * side) * speed, -175, 175);
    player.pos.y = clamp(player.pos.y + vertical * speed, 3, 80);
    player.camera.position.copy(player.pos);
    player.camera.rotation.set(player.pitch, player.yaw, 0);
    player.rig.group.visible = false;
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
      task.beam.update(dt);
      if (task.done || Math.hypot(this.level.player.pos.x - task.x, this.level.player.pos.z - task.z) >= 4) continue;
      this.prompt = { text: t('Натисни {k} — виконати завдання', { k: interactKey() }), hold: false };
      if (allowControl && input.pressed('KeyE')) {
        task.done = true;
        task.beam.remove();
        this.level.audio.mission();
        this.level.game.hud.toast(t('⭐ Завдання виконано!'));
      }
      break;
    }
    if (!this.done && this.tasks.length && this.tasks.every((task) => task.done)) {
      this.done = true;
      this.level.game.hud.banner(t('🏆 КАРТУ ПРОЙДЕНО!'), t('Усі твої завдання виконано.'));
    }
  }

  getHudList() {
    if (this.editor) return [{ icon: '🧱', title: t('Літай і став обʼєкти кнопками редактора'), done: false }];
    if (!this.tasks.length) return [{ icon: '🗺️', title: t('Досліджуй власну карту'), done: false }];
    return this.tasks.map((task, i) => ({ icon: '⭐', title: t('Завдання {n}', { n: i + 1 }), done: task.done }));
  }

  get() { return null; }

  getMarkers() {
    return this.tasks.filter((task) => !task.done).map((task) => ({ x: task.x, z: task.z, icon: '⭐' }));
  }
}
