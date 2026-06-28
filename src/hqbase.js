// 🏠 База Рятівника: маленька 3D-сцена-вітрина, куди дитина заходить зі Штабу.
// Read-only: показує героя, трофеї звільнених країн, відкритий бестіарій і безпечні
// тренувальні мішені. Жодного UGC/чату/мережі/нової економії (див. план living-rescue-hq).
import * as THREE from 'three';
import { t } from './i18n.js';
import { COUNTRIES, CAMPAIGN_ORDER } from './countries.js';
import { makeHero, HERO_SKINS } from './characters.js';
import { WORLD_BOSSES } from './worldboss.js';

export class LivingHQ {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 180);
    this.camera.position.set(0, 7, 14);
    this.camera.lookAt(0, 2, 0);
    this.hitCount = 0;
    this.ready = false;
    this.targets = [];
    this.dummies = [];
    this.damageTotal = 0;
    this.worldBossTrophies = 0;
    this.megaQuestRows = 0;
    this.skinDisplays = 0;
    this.hallPlaques = 0;
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._onPointerDown = (e) => this._pickTarget(e);
  }

  enter() {
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
    this.scene.background = new THREE.Color(0x78bdf2);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x6fb060, 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(8, 12, 8);
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
      const trophy = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.28, 0.55, 18),
        new THREE.MeshLambertMaterial({ color: 0xffd45a })
      );
      trophy.position.set(-4.9, 0.8 + (i % 4) * 0.6, -3 + Math.floor(i / 4) * 1.8);
      trophy.userData.kind = 'country';
      trophy.userData.label = c ? c.name : id;
      this.scene.add(trophy);
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
      const trophy = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 18, 12),
        new THREE.MeshLambertMaterial({ color: boss.id === 'radiation' ? 0x77d56c : boss.id === 'ice' ? 0xa8e8ff : 0xff5c5c })
      );
      trophy.position.set(-3 + i * 1.2, 1.05, -6.1);
      trophy.userData.kind = 'world-boss-trophy';
      trophy.userData.label = boss.id;
      this.scene.add(trophy);
      this._addBox(-3 + i * 1.2, 0.45, -6.1, 0.8, 0.25, 0.8, 0x3a2f22, { kind: 'world-boss-stand' });
      this.worldBossTrophies++;
    });
  }

  _addMegaQuestBoard() {
    this.megaQuestRows = 0;
    this.game.quests.ensureMegaQuests();
    const quests = this.game.quests.megaList;
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
      const h = 0.35 + Math.min(1.2, n / (id === 'kills' ? 100 : 10));
      this._addBox(x, 0.25, 5.4, 0.65, 0.25, 0.65, 0x3a2f22, { kind: 'hall-stand', id });
      this._addBox(x, 0.5 + h / 2, 5.4, 0.42, h, 0.42, color, { kind: 'hall-plaque', id, value: n });
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

  hitFirstTarget() {
    if (this.targets && this.targets[0]) this._hitTarget(this.targets[0]);
  }

  hitFirstDummy() {
    if (this.dummies && this.dummies[0]) this._hitTarget(this.dummies[0]);
  }

  _pickTarget(e) {
    if (!this.ready || this.game.state !== 'hqbase') return;
    const rect = this.game.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hit = this._raycaster.intersectObjects(this.targets || [], false)[0];
    if (hit) this._hitTarget(hit.object);
  }

  _hitTarget(target) {
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
    this.countryTrophies = 0;
    this.beastTrophies = 0;
    this.worldBossTrophies = 0;
    this.megaQuestRows = 0;
    this.skinDisplays = 0;
    this.hallPlaques = 0;
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
      hitCount: this.hitCount,
      damageTotal: this.damageTotal,
      children: this.scene.children.length,
      countryTrophies: this.countryTrophies || 0,
      beastTrophies: this.beastTrophies || 0,
      worldBossTrophies: this.worldBossTrophies || 0,
      megaQuestRows: this.megaQuestRows || 0,
      skinDisplays: this.skinDisplays || 0,
      hallPlaques: this.hallPlaques || 0,
      dummyCount: (this.dummies || []).length,
      hasHero: !!this.hero,
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
        🗺️ ${t('Країни')}: <b id="hqbase-country-count">0</b> ·
        📖 ${t('Бестіарій')}: <b id="hqbase-beast-count">0</b> ·
        🌋 ${t('Боси')}: <b id="hqbase-worldboss-count">0</b> ·
        👕 ${t('Скіни')}: <b id="hqbase-skin-count">0</b> ·
        🏆 ${t('Зал')}: <b id="hqbase-hall-count">0</b> ·
        🎯 ${t('Мішені')}: <b id="hqbase-hit-count">0</b> ·
        💥 ${t('Шкода')}: <b id="hqbase-damage-count">0</b>
      </div><div id="hqbase-mega-list" class="hqbase-mini"></div>`;
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
    const hit = document.getElementById('hqbase-hit-count');
    if (hit) hit.textContent = '0';
    const dmg = document.getElementById('hqbase-damage-count');
    if (dmg) dmg.textContent = '0';
    const save = this.game.save;
    const saved = save.liberated || {};
    const bestiary = save.bestiary || {};
    const countries = Object.keys(saved).filter((id) => saved[id]).length;
    const beasts = Object.keys(bestiary).filter((id) => bestiary[id] > 0).length;
    const worldBosses = Object.keys(save.worldBosses || {}).filter((id) => save.worldBosses[id]).length;
    const skins = (save.skins || []).filter((id) => HERO_SKINS[id]).length;
    const hall = 4;
    const cc = document.getElementById('hqbase-country-count');
    const bc = document.getElementById('hqbase-beast-count');
    const wc = document.getElementById('hqbase-worldboss-count');
    const sc = document.getElementById('hqbase-skin-count');
    const hc = document.getElementById('hqbase-hall-count');
    if (cc) cc.textContent = String(countries);
    if (bc) bc.textContent = String(beasts);
    if (wc) wc.textContent = String(worldBosses);
    if (sc) sc.textContent = String(skins);
    if (hc) hc.textContent = String(hall);

    this.game.quests.ensureMegaQuests();
    const mini = document.getElementById('hqbase-mega-list');
    if (mini) {
      mini.innerHTML = this.game.quests.megaList.slice(0, 3).map((q) => {
        const pct = Math.round((q.progress / q.target) * 100);
        return `<div class="hqbase-mini-row ${q.done ? 'done' : ''}">
          <span>${q.icon} ${q.title}</span><b>${pct}%</b>
        </div>`;
      }).join('');
    }
  }
}
