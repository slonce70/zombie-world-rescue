// 🌪️ Піщана буря — фірмовий, телеграфований, чесний до дітей погодний хазард
// Єгипту. ЛИШЕ соло-кампанія EGY (кооп/спецрежими/PROTO не чіпаються — синк
// погоди хостом поза скоупом R6). Кожні ~100–140с (детерміновано за сідом забігу):
//   warn (4с)   — банер + вітер наростає, попереджаємо заздалегідь;
//   storm (20с) — оранжевий туман стуляється, легкі піщані смуги, зомбі бачать
//                 ближче (ЧЕСНО: і гравець, і зомбі), швидкість гравця не падає,
//                 кинуті монети яскравіше мерехтять — буря це шанс, а не лише завада;
//   settle (3с) — банер «Буря вщухла», туман ВІДНОВЛЮЄТЬСЯ рівно до стану до бурі
//                 (з урахуванням дня/ночі), звук стихає.
// Перф: без нових джерел світла; частки в межах quality-тірів; туман малюється з
// нічно-коректної бази (формула World.setNight), тож нічний реплей теж коректний.
import * as THREE from 'three';
import { t } from './i18n.js';
import { RNG, damp, lerp } from './utils.js';

const WARN_T = 4;      // телеграф перед бурею
const STORM_T = 20;    // активна буря
const SETTLE_T = 3;    // затихання
const MIN_GAP = 100, MAX_GAP = 140; // проміжок між бурями
const STORM_FOG = new THREE.Color(0xd98b3a); // піщано-оранжевий

export class Sandstorm {
  constructor(level) {
    this.level = level;
    // власний детермінований RNG (незалежний від порядку інших систем)
    this.rng = new RNG(((level.country.seed || 0) ^ 0x5a11d) >>> 0);
    this.phase = 'idle';        // idle | warn | storm | settle
    this.timer = this._gap();   // до першого попередження
    this.intensity = 0;         // 0..1 — сила туману/часток
    this.active = false;        // true у фазі storm (читають зомбі/HUD/монети)
    this.t = 0;                 // залишок активної бурі (для HUD-чипа)
    this._fogDirty = false;     // чи треба форснути чистий перерахунок туману
    this._base = new THREE.Color();
    this._time = 0;
    this._buildSand();
  }

  _gap() { return this.rng.range(MIN_GAP, MAX_GAP); }

  // піщані смуги: окремий пул InstancedMesh (не краде combat-FX), у межах quality
  _buildSand() {
    const w = this.level.world;
    const q = (w && w.quality && w.quality.snow) || 220;
    const N = Math.max(16, Math.round(q * 0.4));
    const geo = new THREE.BoxGeometry(0.6, 0.03, 0.03); // горизонтальна смужка-порошинка
    const mat = new THREE.MeshBasicMaterial({
      color: 0xdcb877, transparent: true, opacity: 0.5, depthWrite: false,
    });
    this._sandMat = mat;
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.level.scene.add(mesh);
    this._sand = mesh;
    this._grains = [];
    for (let i = 0; i < N; i++) {
      this._grains.push({
        x: this.rng.range(-40, 40), y: this.rng.range(0.5, 14), z: this.rng.range(-40, 40),
        spd: this.rng.range(26, 42), ph: this.rng.range(0, 6.28),
      });
    }
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this._p = new THREE.Vector3();
  }

  // тест-хук / майбутні тригери: форсуємо бурю зараз (лише коли ідемо на спокої)
  forceStart() {
    if (this.phase !== 'idle') return false;
    this._enterWarn();
    return true;
  }

  // інтроспекція для тестів
  state() {
    const fog = this.level.scene.fog;
    return {
      phase: this.phase,
      active: this.active,
      intensity: +this.intensity.toFixed(3),
      t: +this.t.toFixed(2),
      aggroMul: this.active ? 0.5 : 1,
      fog: fog ? { color: fog.color.getHex(), near: +fog.near.toFixed(3), far: +fog.far.toFixed(3) } : null,
    };
  }

  _enterWarn() {
    this.phase = 'warn';
    this.timer = WARN_T;
    const g = this.level.game;
    if (g && g.hud) g.hud.banner(t('🌪️ Піщана буря наближається!'), '', WARN_T + 0.5);
    if (this.level.audio && this.level.audio.sandstormWarn) this.level.audio.sandstormWarn();
  }

  _enterStorm() {
    this.phase = 'storm';
    this.timer = STORM_T;
    this.active = true;
    this.t = STORM_T;
  }

  _enterSettle() {
    this.phase = 'settle';
    this.timer = SETTLE_T;
    this.active = false;
    this.t = 0;
    const g = this.level.game;
    if (g && g.hud) g.hud.banner(t('Буря вщухла'), '', SETTLE_T);
    if (this.level.audio && this.level.audio.sandstormSettle) this.level.audio.sandstormSettle();
  }

  _enterIdle() {
    this.phase = 'idle';
    this.timer = this._gap();
  }

  update(dt) {
    this._time += dt;
    this.timer -= dt;
    if (this.phase === 'idle') {
      if (this.timer <= 0) this._enterWarn();
    } else if (this.phase === 'warn') {
      if (this.timer <= 0) this._enterStorm();
    } else if (this.phase === 'storm') {
      this.t = Math.max(0, this.timer);
      if (this.timer <= 0) this._enterSettle();
    } else if (this.phase === 'settle') {
      if (this.timer <= 0) this._enterIdle();
    }
    // сила туману/часток плавно тягнеться до цілі (1 у бурю, 0 інакше)
    const target = this.phase === 'storm' ? 1 : 0;
    this.intensity = damp(this.intensity, target, 2.4, dt);
    if (target === 0 && this.intensity < 0.004) this.intensity = 0;
    this._applyFog();
    this._applyParticles(dt);
    this._applyCoins();
  }

  // туман: малюємо з нічно-коректної бази (формула World.setNight) + оранж×intensity.
  // Виклик стоїть ПІСЛЯ _updateDayNight у кроці — тож наш оверлей лягає поверх ночі.
  _applyFog() {
    const w = this.level.world;
    const scene = this.level.scene;
    if (!w || !scene.fog) return;
    if (this.intensity <= 0) {
      // рівно один раз після бурі: форсуємо чистий перерахунок нічного туману,
      // щоб відновити ТОЧНО стан до бурі (setNight має early-return на незмінному k)
      if (this._fogDirty) {
        w.nightK = -999;
        w.setNight(this.level.nightK || 0);
        this._fogDirty = false;
      }
      return;
    }
    this._fogDirty = true;
    const nk = this.level.nightK || 0;
    this._base.copy(w._dayFog).lerp(w._nightFog, nk);
    const baseNear = w.fogNear * (1 - nk * 0.2);
    const baseFar = w.fogFar * (1 - nk * 0.3);
    const k = this.intensity;
    scene.fog.color.copy(this._base).lerp(STORM_FOG, k * 0.85);
    scene.fog.near = lerp(baseNear, 8, k);
    scene.fog.far = lerp(baseFar, 52, k);
  }

  _applyParticles(dt) {
    const mesh = this._sand;
    if (!mesh) return;
    const on = this.intensity > 0.05;
    if (mesh.visible !== on) mesh.visible = on;
    if (!on) return;
    const player = this.level.player;
    const px = player ? player.pos.x : 0;
    const pz = player ? player.pos.z : 0;
    const wind = this.intensity;
    for (let i = 0; i < this._grains.length; i++) {
      const gr = this._grains[i];
      // піщинки летять по горизонталі (вітер по +x), легке коливання по y/z
      gr.x += gr.spd * wind * dt;
      gr.ph += dt * 3;
      if (gr.x > 42) { gr.x -= 82; gr.z = this.rng.range(-40, 40); gr.y = this.rng.range(0.5, 14); }
      this._p.set(px + gr.x, gr.y + Math.sin(gr.ph) * 0.4, pz + gr.z + Math.cos(gr.ph * 0.7) * 0.6);
      this._m4.compose(this._p, this._q, this._s);
      mesh.setMatrixAt(i, this._m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this._sandMat.opacity = 0.5 * this.intensity;
  }

  // 💰 кинуті монети яскравіше мерехтять крізь туман — буря це шанс, а не лише завада
  _applyCoins() {
    const eff = this.level.effects;
    if (!eff || !eff.coinMat) return;
    if (this.intensity > 0.02) {
      eff.coinMat.emissiveIntensity = 0.45 + this.intensity * (0.55 + 0.45 * Math.sin(this._time * 6));
      this._coinBoosted = true;
    } else if (this._coinBoosted) {
      eff.coinMat.emissiveIntensity = 0.45; // відновлюємо базу (спільний матеріал — НЕ dispose)
      this._coinBoosted = false;
    }
  }
}
