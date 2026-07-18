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
  task: { icon: '⭐', name: 'Завдання', radius: 8 },
});
const SPAWN_CLEAR_RADIUS = 10;
const MAX_TASKS = 3;
const QUEST_TYPES = Object.freeze(['rescue', 'collect', 'repair', 'lights', 'elites', 'warehouse']);
const QUEST_INFO = Object.freeze({
  rescue: { icon: '🆘', title: 'Врятуй людей у хліві', total: 1 },
  collect: { icon: '📦', title: 'Збери 4 ящики припасів', total: 4 },
  repair: { icon: '📡', title: 'Полагодь радіовежу', total: 1 },
  lights: { icon: '🔦', title: 'Засвіти 3 ліхтарі', total: 3 },
  elites: { icon: '👹', title: 'Перемож 3 елітних зомбі', total: 3 },
  warehouse: { icon: '🏭', title: 'Зачисть склад від зомбі', total: 8 },
});
const QUEST_SET = new Set(QUEST_TYPES);

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
  let taskCount = 0;
  return {
    objects: objects.slice(0, MAX_OBJECTS).flatMap((item) => {
      if (!item || !TYPE_SET.has(item.type)) return [];
      if (item.type === 'task' && taskCount >= MAX_TASKS) return [];
      const x = Number(item.x), z = Number(item.z), ry = Number(item.ry) || 0;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
      const clean = { type: item.type, x: clamp(x, -170, 170), z: clamp(z, -170, 170), ry: clamp(ry, -Math.PI, Math.PI) };
      if (item.type === 'task') {
        clean.quest = QUEST_SET.has(item.quest) ? item.quest : QUEST_TYPES[taskCount % QUEST_TYPES.length];
        taskCount++;
      }
      return [clean];
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
    this.questIndex = this.data.objects.filter((item) => item.type === 'task').length % QUEST_TYPES.length;
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
      object = this._spawnTask(item, y);
      this.tasks.push(object);
    }
    this.spawned[item.type]++;
    return object;
  }

  _spawnTask(item, y) {
    const { level } = this;
    const quest = QUEST_SET.has(item.quest) ? item.quest : 'rescue';
    const task = { ...item, quest, done: false, progress: 0, targets: [], enemies: [] };
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
      }
    }
    const target = this._taskTarget(task) || item;
    task.beam = level.effects.makeBeam(target.x, target.z, 0xffd23f, QUEST_INFO[quest].icon);
    return task;
  }

  select(type) {
    if (!this.editor || !TYPE_SET.has(type)) return false;
    if (type === 'task' && this.selected === 'task') this.questIndex = (this.questIndex + 1) % QUEST_TYPES.length;
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
    const radius = TYPE_INFO[type].radius;
    if (Math.abs(x) > 170 - radius || Math.abs(z) > 170 - radius) return t('Тут край карти');
    if (type === 'task' && this.data.objects.filter((item) => item.type === 'task').length >= MAX_TASKS) return t('На карті може бути максимум 3 завдання');
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
    if (type === 'task') item.quest = QUEST_TYPES[this.questIndex];
    this.data.objects.push(item);
    this._spawn(item);
    if (type === 'task') this.questIndex = (this.questIndex + 1) % QUEST_TYPES.length;
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
    if (selected) selected.textContent = this.selected === 'task'
      ? `${QUEST_INFO[QUEST_TYPES[this.questIndex]].icon} ${t(QUEST_INFO[QUEST_TYPES[this.questIndex]].title)}`
      : (this.selected ? `${TYPE_INFO[this.selected].icon} ${t(TYPE_INFO[this.selected].name)}` : t('нічого'));
    const undo = document.getElementById('map-editor-undo');
    if (undo) undo.disabled = !this.data.objects.length;
    for (const button of document.querySelectorAll('[data-map-object]')) {
      button.classList.toggle('on', button.dataset.mapObject === this.selected);
      if (button.dataset.mapObject === 'task') button.textContent = `6 ${QUEST_INFO[QUEST_TYPES[this.questIndex]].icon} ${t(QUEST_INFO[QUEST_TYPES[this.questIndex]].title)}`;
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

  _taskTarget(task) {
    if (task.done) return null;
    if (task.quest === 'collect' || task.quest === 'lights') return task.targets.find((target) => !target.done) || null;
    if (task.quest === 'elites' || task.quest === 'warehouse') {
      const enemy = task.enemies.find((zombie) => zombie.state !== 'dead' && !zombie.gone);
      return enemy ? { x: enemy.x, z: enemy.z } : null;
    }
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
    if (!this.done && this.tasks.length && this.tasks.every((task) => task.done)) {
      this.done = true;
      this.level.game.hud.banner(t('🏆 КАРТУ ПРОЙДЕНО!'), t('Усі твої завдання виконано.'));
    }
  }

  getHudList() {
    if (this.editor) return [{ icon: '🧱', title: t('Літай і став обʼєкти кнопками редактора'), done: false }];
    if (!this.tasks.length) return [{ icon: '🗺️', title: t('Досліджуй власну карту'), done: false }];
    return this.tasks.map((task) => {
      const info = QUEST_INFO[task.quest];
      const progress = info.total > 1 ? ` ${Math.min(info.total, task.progress | 0)}/${info.total}` : '';
      return { icon: info.icon, title: `${t(info.title)}${progress}`, done: task.done };
    });
  }

  get() { return null; }

  getMarkers() {
    return this.tasks.filter((task) => !task.done).map((task) => {
      const target = this._taskTarget(task) || task;
      return { x: target.x, z: target.z, icon: QUEST_INFO[task.quest].icon };
    });
  }
}
