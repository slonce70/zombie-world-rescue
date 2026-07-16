// 🏠 База Рятівника: маленька 3D-сцена-вітрина, куди дитина заходить зі Штабу.
// Read-only: показує героя, трофеї звільнених країн, відкритий бестіарій і безпечні
// тренувальні мішені. Жодного UGC/чату/мережі/нової економії (див. план living-rescue-hq).
import * as THREE from 'three';
import { t } from './i18n.js';
import { COUNTRIES, CAMPAIGN_ORDER } from './countries.js';
import { makeHero, HERO_SKINS, makeCivilian, setAnim, updateRig } from './characters.js';
import { WORLD_BOSSES } from './worldboss.js';
import { BESTIARY_TYPE_IDS } from './zombies.js';
import {
  rescuedFriendIds, friendFor, campTier, friendThanksUnlocked, friendThanksPending, FRIEND_THANKS_COINS,
} from './friends.js';
import { weeklyCampState } from './weeklycamp.js';

// маленький rng для makeCivilian (потрібні .pick/.f) — детермінізм тут не критичний
function campRng() {
  return { f: Math.random, range(a, b) { return a + (b - a) * Math.random(); }, pick(arr) { return arr[Math.floor(Math.random() * arr.length) % arr.length]; } };
}

export class LivingHQ {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 180);
    this.camera.position.set(0, 7, 14);
    this.camera.lookAt(0, 2, 0);
    this.hitCount = 0;
    this.mode = 'base';
    this.ready = false;
    this.targets = [];
    this.dummies = [];
    this.hints = [];
    this.friends = [];       // 🤝 живий табір: врятовані друзі-ріги
    this.campProps = 0;
    this.campBoardObjs = []; // 🏕️ дошка тижневого квесту (клікабельні меші)
    this.campQuestBoard = 0;
    this.damageTotal = 0;
    this.worldBossTrophies = 0;
    this.megaQuestRows = 0;
    this.skinDisplays = 0;
    this.hallPlaques = 0;
    this.hintDisplays = 0;
    this.frontProjectProps = 0;
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._onPointerDown = (e) => this._pickTarget(e);
  }

  enter(mode = 'base') {
    this.mode = mode === 'moon' ? 'moon' : 'base';
    this.ready = true;
    this.hitCount = 0;
    this.damageTotal = 0;
    this._ensureUi();
    this.build();
    this.onResize();
    // слухач лише поки ми в Штабі (додаємо в enter, прибираємо в exit — без витоку/подвоєння)
    this.game.renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
  }

  exit() {
    this.ready = false;
    this.game.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
    const ui = document.getElementById('hqbase-ui');
    if (ui) ui.style.display = 'none';
    this.dispose();
  }

  build() {
    this.dispose();
    if (this.mode === 'moon') {
      this._buildMoonRescue();
      return;
    }
    this.scene.background = new THREE.Color(0x78bdf2);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x6fb060, 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(8, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(12, 64),
      new THREE.MeshLambertMaterial({ color: 0x5fc46b })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const path = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.04, 18),
      new THREE.MeshLambertMaterial({ color: 0xd8bd82 })
    );
    path.position.y = 0.03;
    this.scene.add(path);

    this._addWall(-5.5, 0, 0x6f8fb8);
    this._addWall(5.5, 0, 0x6f8fb8);
    this._addHeroMannequin();
    this._addSaveTrophies();
    this._addWorldBossTrophies();
    this._addMegaQuestBoard();
    this._addSkinCollection();
    this._addHallOfFame();
    this._addTrainingTargets();
    this._addDamageDummies();
    this._addLivingCamp();
    this._addCampQuestBoard();
    this._addFrontProjects();
    this._refreshHints();
    this.scene.traverse((obj) => {
      if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; }
    });
  }

  _moonState() {
    const moon = this.game.save.moonRescue;
    if (moon && Array.isArray(moon.relays)) return moon;
    return (this.game.save.moonRescue = { relays: [], done: false });
  }

  _buildMoonRescue() {
    this.scene.background = new THREE.Color(0x050817);
    this.scene.add(new THREE.HemisphereLight(0xaac8ff, 0x15172b, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-8, 12, 7);
    this.scene.add(sun);

    const stars = new THREE.BufferGeometry();
    const points = [];
    for (let i = 0; i < 90; i++) points.push((Math.random() - 0.5) * 70, 5 + Math.random() * 30, -18 - Math.random() * 35);
    stars.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16 })));

    const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshLambertMaterial({ color: 0x8b8f9d }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(2.1, 32, 20), new THREE.MeshLambertMaterial({ color: 0x3d8fe8, emissive: 0x10274d }));
    earth.position.set(7, 7, -17);
    this.scene.add(earth);

    this._addBox(0, 1.2, -4.2, 5.4, 2.4, 2.2, 0xe7edf5);
    this._addBox(0, 2.7, -4.2, 2.4, 0.65, 1.5, 0x77aee8);
    this._addBox(-4.8, 0.7, -1.7, 2.8, 0.18, 2.8, 0xb8c2d2);
    this._addBox(4.8, 0.7, -1.7, 2.8, 0.18, 2.8, 0xb8c2d2);

    const state = this._moonState();
    const relayDefs = [
      ['solar', -4, 2.6, 0xffd45a],
      ['comms', 0, 3.8, 0x65b8ff],
      ['oxygen', 4, 2.6, 0x62e59a],
    ];
    this.targets = relayDefs.map(([id, x, z, color]) => {
      const active = state.relays.includes(id);
      const relay = this._addBox(x, 1.15, z, 1.7, 2.1, 0.45, active ? color : 0x485164, {
        isHqTarget: true, moonRelay: id, moonColor: color,
      });
      this._addBox(x, 0.25, z, 0.18, 0.5, 0.18, 0xd8dde8);
      return relay;
    });

    const coreReady = state.relays.length === 3;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 28, 18),
      new THREE.MeshLambertMaterial({
        color: state.done ? 0xfff3b0 : coreReady ? 0xbcd0ff : 0x43495c,
        emissive: state.done ? 0xffd45a : coreReady ? 0x6688cc : 0x000000,
        emissiveIntensity: state.done ? 1.2 : 0.5,
      })
    );
    core.position.set(0, 1.7, -1.1);
    core.userData = { isHqTarget: true, moonCore: true };
    this.scene.add(core);
    this.targets.push(core);

    this.friends = [];
    ['medic', 'kid', 'granny'].forEach((kind, i) => {
      const rig = makeCivilian(kind, campRng());
      const x = -3 + i * 3, z = -0.2 + (i % 2) * 0.8;
      rig.group.position.set(x, 0, z);
      rig.group.userData.isHqFriend = true;
      rig.group.userData.friendId = '';
      setAnim(rig, i === 1 ? 'cheer' : 'walk');
      this.scene.add(rig.group);
      this.friends.push({ cid: '', rig, home: { x, z }, wp: { x: x + 1, z: z + 1 }, waveT: 1 + i, moving: true });
    });
    this.scene.traverse((obj) => {
      if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; }
    });
    this._refreshMoonUi();
  }

  _activateMoonTarget(target) {
    const state = this._moonState();
    const relay = target.userData.moonRelay;
    if (relay) {
      if (state.relays.includes(relay)) {
        this.game.hud.toast(t('🌙 Це реле вже працює.'));
        return;
      }
      state.relays.push(relay);
      target.material.color.setHex(target.userData.moonColor);
      this.game.saveGame();
      this.game.audio.checkpoint();
      this.game.hud.toast(t('📡 Місячне реле запущено ({n}/3)!', { n: state.relays.length }));
      if (state.relays.length === 3) this.game.hud.toast(t('🌕 Усі реле працюють — активуй ядро Місяця!'));
      this._refreshMoonUi();
      return;
    }
    if (!target.userData.moonCore) return;
    if (state.done) {
      this.game.hud.toast(t('🌕 Місяць уже врятовано. База працює!'));
      return;
    }
    if (state.relays.length < 3) {
      this.game.hud.toast(t('🔒 Спочатку запусти три місячні реле.'));
      return;
    }
    state.done = true;
    this.game.save.crystals = (this.game.save.crystals || 0) + 3;
    this.game.progress.addXp(500);
    this.game.saveGame();
    target.material.color.setHex(0xfff3b0);
    target.material.emissive.setHex(0xffd45a);
    target.material.emissiveIntensity = 1.2;
    this.game.audio.levelUp();
    this.game.hud.toast(t('🌕 Місяць урятовано! +500 XP і +3 кристали.'));
    this._refreshMoonUi();
  }

  _refreshMoonUi() {
    if (this.mode !== 'moon') return;
    const ui = document.getElementById('moonbase-status');
    if (!ui) return;
    const state = this._moonState();
    ui.innerHTML = `<div class="hqbase-mini-row ${state.done ? 'done' : ''}">
      <span>${state.done ? t('🌕 Місячна база врятована й населена') : t('🌙 Запусти 3 реле, потім активуй ядро')}</span>
      <b>${state.relays.length}/3</b>
    </div>`;
  }

  _hintText(data = {}) {
    if (data.kind === 'country') return t('🏆 Трофей країни: {n}. Штаб памʼятає твою перемогу!', { n: data.label || t('країна') });
    if (data.kind === 'world-boss-trophy') return t('🌋 Трофей світового боса. Смілива перемога!');
    if (data.kind === 'mega-board') return t('📅 Мега-дошка показує великі цілі на потім.');
    if (data.kind === 'skin-display' || data.kind === 'skin-stand') return t('👕 Колекція скінів: можна вибрати стиль у Гардеробі.');
    if (data.kind === 'hall-trophy') return t('🏆 Зал слави рахує твої найкращі подвиги.');
    if (data.kind === 'beast') return t('📖 Бестіарій: тут живуть відкриті записи про зомбі.');
    if (data.kind === 'front-map') return t('🛰️ Карта показує активні операції Живого фронту.');
    if (data.kind === 'front-project') return t('🏗️ Проєкт Бази: рівень {n}/3.', { n: data.level || 0 });
    return '';
  }

  _addFrontProjects() {
    this.frontProjectProps = 0;
    const front = this.game.save.front;
    if (!front) return;
    this._addBox(0, 1.25, 4.65, 3.6, 2.2, 0.16, 0x17365d, { kind: 'front-map' });
    this.frontProjectProps++;
    const defs = [
      ['medbay', -3.6, 0xe96378],
      ['workshop', 0, 0xf0ae38],
      ['radio', 3.6, 0x4ea7df],
    ];
    for (const [id, x, color] of defs) {
      const level = Math.max(0, Math.min(3, (front.projects && front.projects[id]) | 0));
      this._addBox(x, 0.35, 3.1, 1.4, 0.7, 1.4, color, { kind: 'front-project', id, level });
      this.frontProjectProps++;
      for (let tier = 0; tier < level; tier++) {
        const height = 0.45 + tier * 0.25;
        this._addBox(x - 0.38 + tier * 0.38, 0.7 + height / 2, 3.1, 0.26, height, 0.26, 0xe9f4ff, {
          kind: 'front-project', id, level,
        });
        this.frontProjectProps++;
      }
    }
  }

  _refreshHints() {
    this.hints = [];
    this.scene.traverse((obj) => {
      const text = this._hintText(obj.userData || {});
      if (!text) return;
      obj.userData.hqHint = text;
      this.hints.push(obj);
    });
    this.hintDisplays = this.hints.length;
  }

  _addWall(x, z, color) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 3, 8),
      new THREE.MeshLambertMaterial({ color })
    );
    wall.position.set(x, 1.5, z);
    this.scene.add(wall);
  }

  _addBox(x, y, z, sx, sy, sz, color, data = {}) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.set(x, y, z);
    Object.assign(mesh.userData, data);
    this.scene.add(mesh);
    return mesh;
  }

  _addTrophy(x, y, z, color, data = {}, s = 1) {
    const trophy = new THREE.Group();
    trophy.position.set(x, y, z);
    Object.assign(trophy.userData, data);
    const gold = new THREE.MeshLambertMaterial({ color });
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x2a2118 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * s, 0.4 * s, 0.16 * s, 28), baseMat);
    base.position.y = 0.08 * s;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.12 * s, 0.28 * s, 20), gold);
    stem.position.y = 0.3 * s;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * s, 0.2 * s, 0.42 * s, 32), gold);
    cup.position.y = 0.64 * s;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.28 * s, 0.035 * s, 8, 28), gold);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.86 * s;

    for (const side of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14 * s, 0.025 * s, 8, 18), gold);
      handle.position.set(side * 0.35 * s, 0.64 * s, 0);
      handle.rotation.y = Math.PI / 2;
      handle.scale.x = 0.7;
      trophy.add(handle);
    }

    trophy.add(base, stem, cup, lip);
    this.scene.add(trophy);
    return trophy;
  }

  _addHeroMannequin() {
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.1, 0.25, 24),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    stand.position.set(0, 0.12, -4.2);
    this.scene.add(stand);

    const hero = makeHero(this.game.save.activeSkin || 'classic', this.game.save.hero);
    hero.group.position.set(0, 0.28, -4.2);
    hero.group.rotation.y = Math.PI; // обличчям до камери
    hero.group.userData.isHqHero = true;
    this.hero = hero.group;
    this.scene.add(hero.group);
  }

  _addSaveTrophies() {
    this.countryTrophies = 0;
    this.beastTrophies = 0;
    const saved = this.game.save.liberated || {};
    CAMPAIGN_ORDER.forEach((id, i) => {
      if (!saved[id]) return;
      const c = COUNTRIES[id];
      this._addTrophy(-4.9, 0.48 + (i % 4) * 0.6, -3 + Math.floor(i / 4) * 1.8, 0xffd45a, {
        kind: 'country',
        label: c ? c.name : id,
      }, 0.48);
      this.countryTrophies++;
    });

    const b = this.game.save.bestiary || {};
    const ids = Object.keys(b).filter((id) => b[id] > 0).slice(0, 8);
    ids.forEach((id, i) => {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.42, 0.1),
        new THREE.MeshLambertMaterial({ color: 0x8fd0ff })
      );
      box.position.set(4.9, 0.8 + (i % 4) * 0.6, -3 + Math.floor(i / 4) * 1.8);
      box.userData.kind = 'beast';
      box.userData.label = id;
      this.scene.add(box);
      this.beastTrophies++;
    });
  }

  _addWorldBossTrophies() {
    this.worldBossTrophies = 0;
    const done = this.game.save.worldBosses || {};
    WORLD_BOSSES.forEach((boss, i) => {
      if (!done[boss.id]) return;
      const color = boss.id === 'radiation' ? 0x77d56c : boss.id === 'ice' ? 0xa8e8ff : 0xff5c5c;
      this._addTrophy(-3 + i * 1.2, 0.35, -6.1, color, { kind: 'world-boss-trophy', label: boss.id }, 0.68);
      this.worldBossTrophies++;
    });
  }

  _addMegaQuestBoard() {
    this.megaQuestRows = 0;
    this.game.quests.ensureMegaQuests();
    const quests = this.game.quests.megaUnlocked ? this.game.quests.megaList : [];
    this._addBox(0, 1.55, -6.8, 4.8, 2.1, 0.18, 0x20324d, { kind: 'mega-board' });
    quests.forEach((q, i) => {
      const y = 2.3 - i * 0.28;
      const ratio = Math.max(0.04, Math.min(1, q.progress / q.target));
      const rowColor = q.done ? 0x6fe06f : 0xf5c542;
      this._addBox(-1.9, y, -6.65, 0.18, 0.14, 0.12, rowColor, { kind: 'mega-row-icon', id: q.id });
      this._addBox(-0.55, y, -6.63, 2.2, 0.08, 0.08, 0x0b1422, { kind: 'mega-row-bg', id: q.id });
      this._addBox(-1.65 + ratio * 1.1, y, -6.58, 2.2 * ratio, 0.08, 0.1, rowColor, { kind: 'mega-row-fill', id: q.id });
      this.megaQuestRows++;
    });
  }

  _addSkinCollection() {
    this.skinDisplays = 0;
    const owned = (this.game.save.skins || []).filter((id) => HERO_SKINS[id]).slice(0, 6);
    owned.forEach((id, i) => {
      const hero = makeHero(id, this.game.save.hero);
      hero.group.position.set(3.1 + (i % 3) * 1.0, 0.18, -3.6 + Math.floor(i / 3) * 1.2);
      hero.group.rotation.y = Math.PI * 0.78;
      hero.group.scale.setScalar(0.48);
      hero.group.userData.kind = 'skin-display';
      hero.group.userData.skin = id;
      this.scene.add(hero.group);
      this._addBox(hero.group.position.x, 0.08, hero.group.position.z, 0.75, 0.16, 0.75, 0xffffff, { kind: 'skin-stand', skin: id });
      this.skinDisplays++;
    });
  }

  _addHallOfFame() {
    this.hallPlaques = 0;
    const s = this.game.save.stats || {};
    const worldBossDone = Object.keys(this.game.save.worldBosses || {}).filter((id) => this.game.save.worldBosses[id]).length;
    const values = [
      ['kills', s.killed || 0, 0xf05a5a],
      ['bosses', s.bosses || 0, 0xffd45a],
      ['worldBosses', worldBossDone, 0x77d56c],
      ['combo', s.bestCombo || 0, 0x8fd0ff],
    ];
    values.forEach(([id, n, color], i) => {
      const x = -4.5 + i * 1.0;
      const s = 0.72 + Math.min(0.45, n / (id === 'kills' ? 260 : 26));
      this._addTrophy(x, 0.16, 5.4, color, { kind: 'hall-trophy', id, value: n }, s);
      this.hallPlaques++;
    });
  }

  _addTrainingTargets() {
    this.targets = [];
    for (let i = 0; i < 3; i++) {
      const target = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 0.12, 24),
        new THREE.MeshLambertMaterial({ color: 0xf05a5a })
      );
      target.rotation.x = Math.PI / 2;
      target.position.set(-2 + i * 2, 1.2, 4.3);
      target.userData.isHqTarget = true;
      this.targets.push(target);
      this.scene.add(target);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.2, 10),
        new THREE.MeshLambertMaterial({ color: 0x60442a })
      );
      pole.position.set(target.position.x, 0.6, 4.45);
      this.scene.add(pole);
    }
  }

  _addDamageDummies() {
    this.dummies = [];
    for (let i = 0; i < 3; i++) {
      const x = -2 + i * 2;
      const body = this._addBox(x, 1.05, 6.1, 0.55, 1.5, 0.32, 0x6f8fb8, {
        isHqTarget: true,
        isHqDummy: true,
        hp: 100,
        maxHp: 100,
      });
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 16, 10),
        new THREE.MeshLambertMaterial({ color: 0xffc9a3 })
      );
      head.position.set(0, 0.95, 0);
      head.userData.isHqDummyHead = true;
      body.add(head);
      this.targets.push(body);
      this.dummies.push(body);
    }
  }

  // 🏕️ Живий табір: врятовані друзі ходять/махають; декор росте з їх кількістю.
  // Дешева спільна геометрія, БЕЗ динамічних світел (emissive-матеріали — можна).
  _addLivingCamp() {
    this.friends = [];
    this.campProps = 0;
    const ids = rescuedFriendIds(this.game.save);
    const count = ids.length;
    if (count === 0) return;
    const tier = campTier(count);
    const baseX = -4, baseZ = 3;
    if (tier.tent) { this._addTent(baseX - 1.4, baseZ + 0.4); this._addCampfire(baseX + 0.2, baseZ); this.campProps += 2; }
    if (tier.benches) { this._addBenches(baseX + 2, baseZ + 0.6); this.campProps += 1; }
    if (tier.garland) { this._addGarland(baseX, baseZ - 1.6); this.campProps += 1; }
    if (tier.allFlag) { this._addAllFlag(baseX + 1.4, baseZ - 1.2); this.campProps += 1; }
    const rng = campRng();
    ids.forEach((cid, i) => {
      const f = friendFor(cid);
      if (!f) return;
      const rig = makeCivilian(f.kind || 'kid', rng);
      const ang = (i / count) * Math.PI * 2;
      const rr = 1.5 + (i % 3) * 0.55;
      const x = baseX + Math.cos(ang) * rr;
      const z = baseZ + Math.sin(ang) * rr;
      rig.group.position.set(x, 0, z);
      rig.group.rotation.y = ang + Math.PI;
      rig.group.userData.isHqFriend = true;
      rig.group.userData.friendId = cid;
      setAnim(rig, i % 2 ? 'idle' : 'cheer');
      this.scene.add(rig.group);
      this.friends.push({
        cid, f, rig, home: { x, z },
        wp: { x: x + (Math.random() - 0.5) * 2.4, z: z + (Math.random() - 0.5) * 2.4 },
        waveT: Math.random() * 4, moving: true,
      });
    });
  }

  _addTent(x, z) {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.5, 4), new THREE.MeshLambertMaterial({ color: 0xd8654a }));
    tent.position.set(x, 0.75, z);
    tent.rotation.y = Math.PI / 4;
    this.scene.add(tent);
  }

  _addCampfire(x, z) {
    const logs = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.18, 8), new THREE.MeshLambertMaterial({ color: 0x5f3d22 }));
    logs.position.set(x, 0.09, z);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0xff8a3d, emissive: 0xff6a1a, emissiveIntensity: 0.9 }));
    flame.position.set(x, 0.42, z);
    flame.userData.campFlame = true;
    this.scene.add(logs, flame);
  }

  _addBenches(x, z) {
    for (const dx of [-0.9, 0.9]) {
      this._addBox(x + dx, 0.22, z, 0.7, 0.12, 0.28, 0x8a5a32);
    }
    this._addBox(x, 0.4, z, 0.5, 0.1, 0.9, 0xb0895a); // столик
  }

  _addGarland(x, z) {
    const colors = [0xff5d73, 0xffd23f, 0x4cff7a, 0x44ccff, 0xb086f2];
    for (let i = 0; i < 5; i++) {
      const c = colors[i % colors.length];
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.8 }));
      lamp.position.set(x - 1 + i * 0.5, 1.7 + Math.sin(i) * 0.1, z);
      this.scene.add(lamp);
    }
  }

  _addAllFlag(x, z) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), new THREE.MeshLambertMaterial({ color: 0x8a8478 }));
    pole.position.set(x, 1.1, z);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.04), new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xffb020, emissiveIntensity: 0.5 }));
    flag.position.set(x + 0.5, 1.9, z);
    this.scene.add(pole, flag);
  }

  // 🏕️ Дошка тижневого квесту табору: зʼявляється за ≥1 врятованого друга. Дешевий меш
  // (стовпчик + дощечка + прогрес-смужка), БЕЗ нових динамічних світел. Тап (як по другові)
  // відкриває панель квесту. Emissive-маркер, коли є нагорода на клейм.
  _addCampQuestBoard() {
    this.campBoardObjs = [];
    this.campQuestBoard = 0;
    if (rescuedFriendIds(this.game.save).length === 0) return; // ≥1 друг
    const st = weeklyCampState(this.game.save, this.game._weekIndex());
    const x = -1.7, z = 4.5, W = 1.7;
    const post = this._addBox(x, 0.7, z, 0.16, 1.4, 0.16, 0x8a5a32, { isCampQuestBoard: true });
    const plank = this._addBox(x, 1.55, z, W, 0.92, 0.12, 0x2f5a8a, { isCampQuestBoard: true });
    const bg = this._addBox(x, 1.4, z + 0.07, W - 0.3, 0.14, 0.06, 0x0b1422, { isCampQuestBoard: true });
    const ratio = st.goal ? Math.max(0.04, Math.min(1, st.p / st.goal)) : 0.04;
    const fw = (W - 0.3) * ratio;
    const fill = this._addBox(x - (W - 0.3) / 2 + fw / 2, 1.4, z + 0.1, fw, 0.14, 0.08, st.done ? 0x6fe06f : 0xf5c542, { isCampQuestBoard: true });
    this.campBoardObjs.push(post, plank, bg, fill);
    // 🥚 emissive-маркер над дошкою, коли нагороду можна забрати (як вогник багаття — без світла)
    if (st.claimable) {
      const mark = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0x6fe06f, emissive: 0x39c04f, emissiveIntensity: 0.9 })
      );
      mark.position.set(x, 2.2, z);
      mark.userData.isCampQuestBoard = true;
      this.scene.add(mark);
      this.campBoardObjs.push(mark);
    }
    this.campQuestBoard = 1;
  }

  _openCampQuest() {
    this.game.exitHQBase();      // як інші кнопки табору: спершу на глобус, тоді оверлей
    this.game._openCampQuest();
  }

  // тап по другові: репліка табору + (за ≥3 друзів) «щоденне дякую» +20💰 раз на день
  tapFirstFriend() {
    const fr = (this.friends || [])[0];
    return fr ? this._tapFriend(fr.cid) : '';
  }

  _tapFriend(cid) {
    const f = friendFor(cid);
    if (!f) return '';
    let msg = f.greeting();
    const save = this.game.save;
    if (friendThanksUnlocked(save)) {
      const key = this.game.gift.dayKey();
      if (friendThanksPending(save, key)) {
        save.friendThanks = key;
        save.coins = (save.coins || 0) + FRIEND_THANKS_COINS;
        this.game.saveGame();
        if (this.game.audio && this.game.audio.coin) this.game.audio.coin();
        msg = t('💰 Щоденне дякую табору: +{n} монет!', { n: FRIEND_THANKS_COINS }) + ' ' + f.greeting();
      }
    }
    if (this.game.hud) this.game.hud.toast(`${f.emoji} ${msg}`);
    return msg;
  }

  hitFirstTarget() {
    if (this.targets && this.targets[0]) this._hitTarget(this.targets[0]);
  }

  hitFirstDummy() {
    if (this.dummies && this.dummies[0]) this._hitTarget(this.dummies[0]);
  }

  tapFirstHint() {
    const hint = (this.hints || [])[0];
    return hint ? this._showHint(hint) : '';
  }

  _pickTarget(e) {
    if (!this.ready || this.game.state !== 'hqbase') return;
    const rect = this.game.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const friendGroups = (this.friends || []).map((fr) => fr.rig.group);
    const hit = this._raycaster.intersectObjects([...(this.targets || []), ...(this.hints || []), ...(this.campBoardObjs || []), ...friendGroups], true)[0];
    if (!hit) return;
    let obj = hit.object;
    while (obj && !obj.userData?.isHqTarget && !obj.userData?.hqHint && !obj.userData?.isHqFriend && !obj.userData?.isCampQuestBoard) obj = obj.parent;
    if (!obj) return;
    if (obj.userData.isCampQuestBoard) this._openCampQuest();
    else if (obj.userData.isHqFriend) this._tapFriend(obj.userData.friendId);
    else if (obj.userData.isHqTarget) this._hitTarget(obj);
    else this._showHint(obj);
  }

  _showHint(obj) {
    const text = obj.userData.hqHint || '';
    if (text && this.game.hud) this.game.hud.toast(text);
    return text;
  }

  _hitTarget(target) {
    if (target.userData.moonRelay || target.userData.moonCore) {
      this._activateMoonTarget(target);
      return;
    }
    if (target.userData.isHqDummy) {
      this._hitDummy(target);
      return;
    }
    this.hitCount++;
    target.material.color.setHex(0xffd45a);
    target.scale.setScalar(1.18);
    target.userData.flash = 0.25;
    if (this.game.audio && this.game.audio.click) this.game.audio.click();
    const ui = document.getElementById('hqbase-hit-count');
    if (ui) ui.textContent = String(this.hitCount);
  }

  _hitDummy(dummy) {
    const dmg = 25;
    this.damageTotal += dmg;
    dummy.userData.hp = Math.max(0, (dummy.userData.hp || dummy.userData.maxHp || 100) - dmg);
    dummy.material.color.setHex(dummy.userData.hp <= 0 ? 0xffd45a : 0xf05a5a);
    dummy.scale.setScalar(1.08);
    dummy.userData.flash = 0.25;
    if (dummy.userData.hp <= 0) dummy.userData.hp = dummy.userData.maxHp || 100;
    if (this.game.audio && this.game.audio.click) this.game.audio.click();
    const ui = document.getElementById('hqbase-damage-count');
    if (ui) ui.textContent = String(this.damageTotal);
  }

  update(dt) {
    if (!this.ready) return;
    this.scene.rotation.y += dt * 0.03;
    // 🤝 живий табір: друзі ходять між точками, часом махають
    for (const fr of this.friends || []) {
      const g = fr.rig.group;
      const dx = fr.wp.x - g.position.x;
      const dz = fr.wp.z - g.position.z;
      const d = Math.hypot(dx, dz);
      fr.waveT -= dt;
      if (fr.waveT <= 0 && d < 0.3) {
        // прибув — помахати/порадіти, тоді нова точка
        setAnim(fr.rig, 'cheer');
        fr.waveT = 2 + Math.random() * 3;
        fr.wp = { x: fr.home.x + (Math.random() - 0.5) * 3, z: fr.home.z + (Math.random() - 0.5) * 3 };
      } else if (d > 0.3) {
        const sp = 1.1 * dt;
        g.position.x += (dx / d) * sp;
        g.position.z += (dz / d) * sp;
        g.rotation.y = Math.atan2(dx, dz);
        setAnim(fr.rig, 'walk');
      }
      updateRig(fr.rig, dt);
    }
    for (const target of this.targets || []) {
      if (target.userData.flash > 0) {
        target.userData.flash -= dt;
        if (target.userData.flash <= 0) {
          target.material.color.setHex(target.userData.isHqDummy ? 0x6f8fb8 : 0xf05a5a);
          target.scale.setScalar(1);
        }
      }
    }
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // звільняємо ЛИШЕ унікальні per-instance ресурси цієї сцени; спільні кеші
  // (toonMat/cachedGeo/запечена гео героя з userData.shared) НЕ чіпаємо — інакше
  // зламаємо матеріали всієї гри.
  dispose() {
    this.hero = null;
    this.targets = [];
    this.dummies = [];
    this.hints = [];
    this.friends = [];
    this.campProps = 0;
    this.campBoardObjs = [];
    this.campQuestBoard = 0;
    this.countryTrophies = 0;
    this.beastTrophies = 0;
    this.worldBossTrophies = 0;
    this.megaQuestRows = 0;
    this.skinDisplays = 0;
    this.hallPlaques = 0;
    this.hintDisplays = 0;
    this.damageTotal = 0;
    this.scene.rotation.y = 0;
    for (const obj of [...this.scene.children]) {
      this.scene.remove(obj);
      obj.traverse?.((child) => {
        if (child.geometry && !(child.geometry.userData && child.geometry.userData.shared)) child.geometry.dispose();
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) { if (m && !(m.userData && m.userData.shared)) m.dispose(); }
        }
      });
    }
  }

  debugState() {
    return {
      ready: this.ready,
      mode: this.mode,
      hitCount: this.hitCount,
      damageTotal: this.damageTotal,
      children: this.scene.children.length,
      countryTrophies: this.countryTrophies || 0,
      beastTrophies: this.beastTrophies || 0,
      worldBossTrophies: this.worldBossTrophies || 0,
      megaQuestRows: this.megaQuestRows || 0,
      skinDisplays: this.skinDisplays || 0,
      hallPlaques: this.hallPlaques || 0,
      hallTrophies: this.scene.children.filter((obj) => obj.userData?.kind === 'hall-trophy').length,
      hintDisplays: this.hintDisplays || 0,
      dummyCount: (this.dummies || []).length,
      friendRigs: (this.friends || []).length,
      campProps: this.campProps || 0,
      campQuestBoard: this.campQuestBoard || 0,
      hasHero: !!this.hero,
      moonRelays: this._moonState().relays.length,
      moonDone: this._moonState().done,
      moonCrew: this.mode === 'moon' ? (this.friends || []).length : 0,
    };
  }

  _ensureUi() {
    let ui = document.getElementById('hqbase-ui');
    if (!ui) {
      ui = document.createElement('div');
      ui.id = 'hqbase-ui';
      ui.innerHTML = `<div class="hqbase-actions">
        <button id="btn-hqbase-exit" class="btn">🌍 ${t('На глобус')}</button>
        <button id="btn-hqbase-panel" class="btn">🏠 ${t('База')}</button>
        <button id="btn-hqbase-quests" class="btn">📅 ${t('Квести')}</button>
        <button id="btn-hqbase-wardrobe" class="btn">🎒 ${t('Гардероб')}</button>
      </div><div class="hqbase-counter">
        <span>🧭 <b id="hqbase-next-action">${this.game._nextActionInfo().text}</b></span>
        <span>🗺️ ${t('Країни')}: <b id="hqbase-country-count">0</b></span>
        <span>📖 ${t('Бестіарій')}: <b id="hqbase-beast-count">0</b></span>
        <span>👕 ${t('Скіни')}: <b id="hqbase-skin-count">0</b></span>
        <span>🏆 ${t('Зал')}: <b id="hqbase-hall-count">0</b></span>
        <span>🎯 ${t('Мішені')}: <b id="hqbase-hit-count">0</b></span>
        <span>💥 ${t('Шкода')}: <b id="hqbase-damage-count">0</b></span>
      </div><div id="hqbase-mega-list" class="hqbase-mini"></div><div id="moonbase-status" class="hqbase-mini"></div>`;
      document.body.appendChild(ui);
      document.getElementById('btn-hqbase-exit').addEventListener('click', () => this.game.exitHQBase());
      document.getElementById('btn-hqbase-panel').addEventListener('click', () => {
        this.game.exitHQBase();
        this.game.hq.render();
        this.game._showOverlay('overlay-hq');
      });
      document.getElementById('btn-hqbase-quests').addEventListener('click', () => {
        this.game.exitHQBase();
        this.game.renderQuestsPanel();
        this.game._showOverlay('overlay-quests');
      });
      document.getElementById('btn-hqbase-wardrobe').addEventListener('click', () => {
        this.game.exitHQBase();
        this.game.renderWardrobe();
        this.game._showOverlay('overlay-wardrobe');
      });
    }
    ui.style.display = '';
    const baseCounter = ui.querySelector('.hqbase-counter');
    const mini = document.getElementById('hqbase-mega-list');
    const moonStatus = document.getElementById('moonbase-status');
    if (baseCounter) baseCounter.style.display = this.mode === 'moon' ? 'none' : '';
    if (mini) mini.style.display = this.mode === 'moon' ? 'none' : '';
    if (moonStatus) moonStatus.style.display = this.mode === 'moon' ? '' : 'none';
    if (this.mode === 'moon') this._refreshMoonUi();
    const hit = document.getElementById('hqbase-hit-count');
    if (hit) hit.textContent = '0';
    const dmg = document.getElementById('hqbase-damage-count');
    if (dmg) dmg.textContent = '0';
    const next = document.getElementById('hqbase-next-action');
    if (next) next.textContent = this.game._nextActionInfo().text;
    const save = this.game.save;
    const saved = save.liberated || {};
    const bestiary = save.bestiary || {};
    const countries = Object.keys(saved).filter((id) => saved[id]).length;
    const beasts = Object.keys(bestiary).filter((id) => BESTIARY_TYPE_IDS.includes(id) && bestiary[id] > 0).length;
    const skins = (save.skins || []).filter((id) => HERO_SKINS[id]).length;
    const cc = document.getElementById('hqbase-country-count');
    const bc = document.getElementById('hqbase-beast-count');
    const sc = document.getElementById('hqbase-skin-count');
    const hc = document.getElementById('hqbase-hall-count');
    if (cc) cc.textContent = String(countries);
    if (bc) bc.textContent = `${beasts}/${BESTIARY_TYPE_IDS.length}`;
    if (sc) sc.textContent = String(skins);
    if (hc) hc.textContent = '4';

    this.game.quests.ensureMegaQuests();
    if (mini) {
      if (!this.game.quests.megaUnlocked) {
        mini.innerHTML = `<div class="hqbase-mini-row">🔒 ${t('Мега-квести з {n} рівня Зоряного шляху', { n: this.game.quests.megaUnlockLevel })}</div>`;
        return;
      }
      mini.innerHTML = this.game.quests.megaList.slice(0, 3).map((q) => {
        const pct = Math.round((q.progress / q.target) * 100);
        return `<div class="hqbase-mini-row ${q.done ? 'done' : ''}">
          <span>${q.icon} ${q.title}</span><b>${pct}%</b>
        </div>`;
      }).join('');
    }
  }
}
