// 🏠 Живий Штаб Рятівника: маленька 3D-сцена-вітрина, куди дитина заходить зі Штабу.
// Read-only: показує героя, трофеї звільнених країн, відкритий бестіарій і безпечні
// тренувальні мішені. Жодного UGC/чату/мережі/нової економії (див. план living-rescue-hq).
import * as THREE from 'three';
import { t } from './i18n.js';
import { COUNTRIES, CAMPAIGN_ORDER } from './countries.js';
import { makeHero } from './characters.js';

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
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._onPointerDown = (e) => this._pickTarget(e);
  }

  enter() {
    this.ready = true;
    this.hitCount = 0;
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
    this._addTrainingTargets();
  }

  _addWall(x, z, color) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 3, 8),
      new THREE.MeshLambertMaterial({ color })
    );
    wall.position.set(x, 1.5, z);
    this.scene.add(wall);
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

  hitFirstTarget() {
    if (this.targets && this.targets[0]) this._hitTarget(this.targets[0]);
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
    this.hitCount++;
    target.material.color.setHex(0xffd45a);
    target.scale.setScalar(1.18);
    target.userData.flash = 0.25;
    if (this.game.audio && this.game.audio.click) this.game.audio.click();
    const ui = document.getElementById('hqbase-hit-count');
    if (ui) ui.textContent = String(this.hitCount);
  }

  update(dt) {
    if (!this.ready) return;
    this.scene.rotation.y += dt * 0.03;
    for (const target of this.targets || []) {
      if (target.userData.flash > 0) {
        target.userData.flash -= dt;
        if (target.userData.flash <= 0) {
          target.material.color.setHex(0xf05a5a);
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
    this.countryTrophies = 0;
    this.beastTrophies = 0;
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
      children: this.scene.children.length,
      countryTrophies: this.countryTrophies || 0,
      beastTrophies: this.beastTrophies || 0,
      hasHero: !!this.hero,
    };
  }

  _ensureUi() {
    let ui = document.getElementById('hqbase-ui');
    if (!ui) {
      ui = document.createElement('div');
      ui.id = 'hqbase-ui';
      ui.innerHTML = `<button id="btn-hqbase-exit" class="btn">🌍 ${t('На глобус')}</button><div class="hqbase-counter">🎯 ${t('Мішені')}: <b id="hqbase-hit-count">0</b></div>`;
      document.body.appendChild(ui);
      document.getElementById('btn-hqbase-exit').addEventListener('click', () => this.game.exitHQBase());
    }
    ui.style.display = '';
    const c = document.getElementById('hqbase-hit-count');
    if (c) c.textContent = '0';
  }
}
