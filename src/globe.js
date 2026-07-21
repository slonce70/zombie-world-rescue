// Глобальна карта: 3D-глобус, захоплені країни, прогресія кампанії
import * as THREE from 'three';
import { t } from './i18n.js';
import { COUNTRIES, CAMPAIGN_ORDER, nextTarget, isCountryOpen } from './countries.js';
import { countryStars, STARS_PER_COUNTRY } from './stars.js';
import { frontCountryState } from './worldfront.js';
import {
  SPACE_WORLD_ORDER, getSpaceRegion, getSpaceWorld, moonRegionFeatures, spaceRegionList, spaceWorldUnlocked,
} from './moonregions.js';

const FRONT_GLOBE_COLORS = Object.freeze({
  destroyed: ['#49151f', '#a7353f'],
  attacked: ['#c93455', '#ff7b6d'],
  rebuilding: ['#d7a62a', '#ffe08a'],
  saved: ['#25aeb8', '#79edf2'],
  peaceful: ['#8d86a3', '#6b6485'],
});

function latLonToVec3(lat, lon, r, out = new THREE.Vector3()) {
  const phi = (lon + 180) * Math.PI / 180;
  const theta = (90 - lat) * Math.PI / 180;
  return out.set(
    -r * Math.cos(phi) * Math.sin(theta),
    r * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

export class Globe {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b1a);
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
    this.camera.position.set(0, 0.85, 3.1);
    this.camera.lookAt(0, 0.1, 0);

    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.R = 1;
    this.features = [];
    this.earthFeatures = [];
    this.spaceFeatures = Object.fromEntries(SPACE_WORLD_ORDER.map((id) => [id, moonRegionFeatures(id)]));
    this.mode = 'earth';
    this.ready = false;
    this.dragging = false;
    this.dragMoved = 0;
    this.hoverId = null;
    this.t = 0;
    this.raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._paintedFront = null;

    // світло
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dir = new THREE.DirectionalLight(0xfff5e0, 1.6);
    dir.position.set(3, 2, 4);
    this.scene.add(dir);

    // зірки
    const starGeo = new THREE.BufferGeometry();
    const N = 1600;
    const sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 30);
      sp[i * 3] = v.x; sp[i * 3 + 1] = v.y; sp[i * 3 + 2] = v.z;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 0.07, sizeAttenuation: true }));
    this.scene.add(this.stars);

    // атмосфера
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(this.R * 1.08, 48, 32),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, transparent: true, depthWrite: false,
        vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vN; void main(){ float a = pow(0.75 - dot(vN, vec3(0,0,1.0)), 3.0); gl_FragColor = vec4(0.4, 0.7, 1.0, a*0.9); }`,
      })
    );
    this.scene.add(atmo);
    this.atmo = atmo;

    // полотна текстур
    this.texCanvas = document.createElement('canvas');
    this.texCanvas.width = 2048; this.texCanvas.height = 1024;
    this.idCanvas = document.createElement('canvas');
    this.idCanvas.width = 1024; this.idCanvas.height = 512;

    this.texture = new THREE.CanvasTexture(this.texCanvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.85, metalness: 0 });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(this.R, 96, 64), mat);
    this.group.add(this.sphere);
    this.spaceShip = this._makeSpaceShip();
    this.spaceShip.visible = false;
    this.scene.add(this.spaceShip);

    // маяк над поточною ціллю кампанії
    this.targetId = nextTarget(this.game.save.liberated || {}) || 'UKR';
    this.allDone = nextTarget(this.game.save.liberated || {}) === null;
    // 🦖 світ звільнено, але таємний острів ще ні — маяк веде туди
    if (this.allDone && !(this.game.save.liberated || {}).LOST) this.targetId = 'LOST';
    this.beacon = this._makeBeacon();
    this.group.add(this.beacon);
    this._aimBeaconAt(this.targetId);

    // початкове обертання: ціль до камери
    this._rotateToCountry(this.targetId, true);
    this.targetRotX = 0.42;
    this.group.rotation.x = 0.42;

    this._bindPointer();
  }

  _rotateToCountry(id, instant = false) {
    const c = this.mode !== 'earth' ? getSpaceRegion(this.mode.toUpperCase(), id) : (COUNTRIES[id] || COUNTRIES.UKR);
    const up = latLonToVec3(c.lat, c.lon, 1);
    this.targetRotY = -Math.atan2(up.x, up.z);
    if (instant) this.group.rotation.y = this.targetRotY;
  }

  _makeBeacon() {
    const g = new THREE.Group();
    // промінь
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.03, 0.5, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    g.add(beam);
    this.beamMesh = beam;
    // кільце
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.06, 0.008, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9 })
    );
    g.add(ring);
    this.ringMesh = ring;
    // підпис
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 512;
    this.labelCanvas.height = 160;
    this.labelTex = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.labelTex, transparent: true, depthTest: false }));
    sprite.scale.set(0.62, 0.2, 1);
    g.add(sprite);
    this.labelSprite = sprite;
    return g;
  }

  _makeSpaceShip() {
    const ship = new THREE.Group();
    const hull = new THREE.MeshStandardMaterial({ color: 0xd9e4ef, metalness: 0.55, roughness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x5ad9ff, emissive: 0x17668b, emissiveIntensity: 0.8 });
    const engine = new THREE.MeshStandardMaterial({ color: 0xff9f45, emissive: 0xff5a16, emissiveIntensity: 1.5 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.52, 12), hull);
    body.rotation.z = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 12), glass);
    nose.rotation.z = -Math.PI / 2; nose.position.x = 0.35;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 10), engine);
    flame.rotation.z = Math.PI / 2; flame.position.x = -0.34;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.42), hull);
    wing.position.x = -0.05;
    ship.add(body, nose, flame, wing);
    ship.position.set(1.55, -0.52, 0.15);
    ship.rotation.set(-0.12, -0.28, -0.14);
    return ship;
  }

  _drawBeaconLabel(title, sub, color = '#ffd23f') {
    const ctx = this.labelCanvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 160);
    ctx.fillStyle = 'rgba(20,30,50,0.85)';
    ctx.beginPath();
    ctx.roundRect(20, 14, 472, 100, 24);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, 256, 62);
    ctx.fillStyle = color;
    ctx.font = '34px Arial';
    ctx.fillText(sub, 256, 102);
    ctx.fillStyle = 'rgba(20,30,50,0.85)';
    ctx.beginPath();
    ctx.moveTo(236, 112); ctx.lineTo(276, 112); ctx.lineTo(256, 148);
    ctx.fill();
    this.labelTex.needsUpdate = true;
  }

  _aimBeaconAt(id) {
    if (this.mode !== 'earth') {
      const world = getSpaceWorld(this.mode.toUpperCase());
      const region = getSpaceRegion(world.id, id);
      this._placeBeacon(latLonToVec3(region.lat, region.lon, this.R));
      const color = world.id === 'MARS' ? 0xffa06f : world.id === 'EUROPA' ? 0xd8f7ff : 0xd8ecff;
      this.beamMesh.material.color.setHex(color);
      this.ringMesh.material.color.setHex(color);
      this._drawBeaconLabel(region.name.toUpperCase(), t('натисни — почни місію!'), `#${color.toString(16).padStart(6, '0')}`);
      return;
    }
    // 🦖 фінал відкрито: світ вільний, але острів динозаврів чекає — червоний маяк-заклик
    if (this.allDone && !(this.game.save.liberated || {}).LOST && COUNTRIES.LOST) {
      const isl = COUNTRIES.LOST;
      this._placeBeacon(latLonToVec3(isl.lat, isl.lon, this.R));
      this.beamMesh.material.color.setHex(0xff5a2a);
      this.ringMesh.material.color.setHex(0xff5a2a);
      this._drawBeaconLabel(t('🦖 ТАЄМНИЙ ОСТРІВ!'), t('останній бій — натисни!'), '#ff5a2a');
      return;
    }
    if (this.allDone) {
      // вся кампанія пройдена — золотий маяк над останньою країною
      const last = COUNTRIES[id] || COUNTRIES.UKR;
      const pos = latLonToVec3(last.lat, last.lon, this.R);
      this._placeBeacon(pos);
      this.beamMesh.material.color.setHex(0x58c14c);
      this.ringMesh.material.color.setHex(0x58c14c);
      this._drawBeaconLabel(t('УСІ КРАЇНИ ВІЛЬНІ!'), t('ти врятував світ! 🏆'), '#58c14c');
      return;
    }
    const c = COUNTRIES[id] || COUNTRIES.UKR;
    const pos = latLonToVec3(c.lat, c.lon, this.R);
    this._placeBeacon(pos);
    this.beamMesh.material.color.setHex(0xffd23f);
    this.ringMesh.material.color.setHex(0xffd23f);
    this._drawBeaconLabel(c.name.toUpperCase(), t('натисни — почни місію!'));
  }

  _placeBeacon(pos) {
    this.beamMesh.position.copy(pos).multiplyScalar(1.25);
    this.beamMesh.lookAt(0, 0, 0);
    this.beamMesh.rotateX(Math.PI / 2);
    this.ringMesh.position.copy(pos).multiplyScalar(1.005);
    this.ringMesh.lookAt(0, 0, 0);
    this.labelSprite.position.copy(pos).add(pos.clone().normalize().multiplyScalar(0.55));
  }

  async load() {
    const res = await fetch('./assets/countries.geo.json');
    const data = await res.json();
    this.earthFeatures = data.features;
    this.features = this.earthFeatures;
    this.repaint();
    this.ready = true;
  }

  _spaceDone(worldId) {
    if (worldId === 'MOON') return this.game.save.moonRegions || {};
    return this.game.save.moonRescue?.space?.regions?.[worldId] || {};
  }

  _spaceColony(worldId, regionId) {
    return this.game.save.moonRescue?.space?.colonies?.[worldId]?.[regionId] || 0;
  }

  setMode(mode) {
    const requested = String(mode || 'earth').toUpperCase();
    const world = SPACE_WORLD_ORDER.includes(requested) ? getSpaceWorld(requested) : null;
    if (world && !spaceWorldUnlocked(this.game.save, world.id)) {
      this.game.hud.toast(t('🔒 Спочатку звільни попередню планету.'));
      return false;
    }
    this.mode = world ? world.id.toLowerCase() : 'earth';
    this.features = world ? this.spaceFeatures[world.id] : this.earthFeatures;
    this.atmo.visible = !world;
    this.spaceShip.visible = !!world;
    this.beacon.visible = true;
    if (world) {
      const done = this._spaceDone(world.id);
      const list = spaceRegionList(world.id);
      this.targetId = (list.find((region) => !done[region.id]) || list[0]).id;
      this.allDone = false;
    } else {
      this.targetId = nextTarget(this.game.save.liberated || {}) || 'UKR';
      this.allDone = nextTarget(this.game.save.liberated || {}) === null;
    }
    const title = document.querySelector('.globe-top h1');
    const sub = document.querySelector('.globe-sub');
    const hint = document.querySelector('.globe-hint');
    const toggle = document.getElementById('btn-moon-globe');
    const ship = this.game.save.moonRescue?.space?.ship || { level: 1, parts: 0 };
    this.spaceShip.scale.setScalar(0.85 + Math.min(3, ship.level) * 0.12);
    if (title) title.innerHTML = world ? `${world.icon} ОПЕРАЦІЯ: <span class="accent">${world.name.toUpperCase()}</span>` : '🧟 ОПЕРАЦІЯ: <span class="accent">ПОРЯТУНОК СВІТУ</span>';
    if (sub) sub.textContent = world ? `Корабель рівня ${ship.level} · деталі ${ship.parts}/4 · засновуй колонії та відкривай наступну планету.` : 'Зомбі захопили планету! Рятуй країни — сам або з друзями.';
    if (hint) hint.textContent = world ? `🖱️ Обертай ${world.name} · натисни на державу, щоб висадитися!` : '🖱️ Обертай глобус · 🔴 червона країна — там зомбі, натисни і звільни!';
    if (toggle) {
      const next = this._nextMode();
      const nextWorld = next === 'earth' ? null : getSpaceWorld(next.toUpperCase());
      toggle.textContent = nextWorld ? `${nextWorld.icon} ${nextWorld.name}` : '🌍 Земля';
    }
    for (const selector of ['#gift-chip', '#camp-quest-chip', '#globe-compass', '.globe-play-row', '#globe-progress', '#weekly-goal']) {
      const el = document.querySelector(selector);
      if (el) el.style.display = world ? 'none' : '';
    }
    const tooltip = document.getElementById('globe-tooltip');
    if (tooltip) tooltip.style.display = 'none';
    this._aimBeaconAt(this.targetId);
    this._rotateToCountry(this.targetId);
    this.repaint();
    return true;
  }

  _nextMode() {
    if (this.mode === 'earth') return 'moon';
    const index = SPACE_WORLD_ORDER.indexOf(this.mode.toUpperCase());
    for (let i = index + 1; i < SPACE_WORLD_ORDER.length; i++) {
      if (spaceWorldUnlocked(this.game.save, SPACE_WORLD_ORDER[i])) return SPACE_WORLD_ORDER[i].toLowerCase();
    }
    return 'earth';
  }

  cycleMode() { return this.setMode(this._nextMode()); }

  _eachRing(feature, cb) {
    const geom = feature.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    for (const poly of polys) for (const ring of poly) cb(ring);
  }

  _drawRing(ctx, ring, w, h, offX) {
    // розгортаємо стрибки через антимеридіан
    let prev = null, shift = 0;
    ctx.beginPath();
    let first = true;
    for (const pt of ring) {
      let lon = pt[0] + shift;
      if (prev !== null) {
        while (lon - prev > 180) { lon -= 360; shift -= 360; }
        while (lon - prev < -180) { lon += 360; shift += 360; }
      }
      prev = lon;
      const x = ((lon + 180) / 360) * w + offX;
      const y = ((90 - pt[1]) / 180) * h;
      if (first) { ctx.moveTo(x, y); first = false; }
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  _paintCountry(ctx, feature, fill, stroke, w, h) {
    for (const offX of [-w, 0, w]) {
      this._eachRing(feature, (ring) => {
        this._drawRing(ctx, ring, w, h, offX);
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      });
    }
  }

  _frontState(id) {
    if (!CAMPAIGN_ORDER.includes(id)) return null;
    const state = frontCountryState(this.game.save.front, id);
    return state;
  }

  _frontStatusLine(id) {
    const state = this._frontState(id);
    if (!state) return '';
    const label = state.state === 'destroyed' ? t('критичні руйнування')
      : state.state === 'rebuilding' ? t('відбудова')
      : state.state === 'saved' ? t('безпечно')
      : state.state === 'peaceful' ? t('спокійно') : t('загроза');
    const threat = ['attacked', 'destroyed'].includes(state.state) ? ` ${'⚠️'.repeat(state.threat)}` : '';
    return `<br>🛰️ ${label}${threat}<br>🧱 ${t('Руйнування')}: ${state.damage}/3 · 👥 ${t('Люди')}: ${state.population}%`;
  }

  repaint() {
    const ctx = this.texCanvas.getContext('2d');
    const w = this.texCanvas.width, h = this.texCanvas.height;
    if (this.mode !== 'earth') {
      const world = getSpaceWorld(this.mode.toUpperCase());
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      const bg = world.id === 'MARS' ? ['#7c321f', '#b65332', '#57251e']
        : world.id === 'EUROPA' ? ['#d9f2f7', '#83b8ce', '#b8e2ec'] : ['#d7d9dc', '#989da3', '#c4c7ca'];
      grad.addColorStop(0, bg[0]); grad.addColorStop(0.5, bg[1]); grad.addColorStop(1, bg[2]);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      const rng = (n) => ((Math.sin(n * 91.17) + 1) * 0.5);
      for (let i = 0; i < 95; i++) {
        const x = rng(i + 2) * w, y = rng(i + 31) * h, r = 5 + rng(i + 71) * 34;
        ctx.fillStyle = 'rgba(55,58,63,0.16)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 3; ctx.stroke();
      }
      const done = this._spaceDone(world.id);
      this.features.forEach((f, index) => {
        const id = f.id;
        const base = world.colors[index];
        this._paintCountry(ctx, f, done[id] ? world.done : (this.hoverId === id ? world.hover : base), world.stroke, w, h);
      });
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f5f7fa';
      ctx.strokeStyle = 'rgba(20,24,30,0.8)'; ctx.lineWidth = 7; ctx.font = 'bold 34px Arial';
      spaceRegionList(world.id).forEach((region) => {
        const x = ((region.lon + 180) / 360) * w;
        const y = ((90 - region.lat) / 180) * h;
        ctx.strokeText(region.name, x, y); ctx.fillText(region.name, x, y);
      });
    } else {
    // океан
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2e7fc9');
    grad.addColorStop(0.5, '#49a8ec');
    grad.addColorStop(1, '#2e7fc9');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // легкі "хвильки"
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let i = 0; i < 40; i++) {
      const y = (i / 40) * h;
      ctx.fillRect(0, y, w, 2);
    }
    const liberated = this.game.save.liberated || {};
    for (const f of this.features) {
      const id = f.id || f.properties.name;
      let fill = '#8d86a3', stroke = '#6b6485'; // далекі землі — хворобливо-фіолетові
      if (liberated[id]) { fill = '#58c14c'; stroke = '#3e9c36'; }
      else if (isCountryOpen(liberated, id)) {
        // 🔴 зомбі тут, і ти можеш атакувати — тривожно-червона
        fill = this.hoverId === id ? '#ff6b57' : '#e04a3a';
        stroke = '#9c2f24';
      }
      const front = this._frontState(id);
      if (front) {
        [fill, stroke] = FRONT_GLOBE_COLORS[front.state];
        if (this.hoverId === id) fill = stroke;
      }
      this._paintCountry(ctx, f, fill, stroke, w, h);
    }
    }
    this._paintedFront = this.game.save.front;
    this.texture.needsUpdate = true;

    // ID-канва для піків
    const ictx = this.idCanvas.getContext('2d', { willReadFrequently: true });
    const iw = this.idCanvas.width, ih = this.idCanvas.height;
    ictx.fillStyle = '#000000';
    ictx.fillRect(0, 0, iw, ih);
    this.features.forEach((f, idx) => {
      const r = (idx + 1) & 255;
      const g = ((idx + 1) >> 8) & 255;
      this._paintCountry(ictx, f, `rgb(${r},${g},255)`, null, iw, ih);
    });
    this.idData = ictx.getImageData(0, 0, iw, ih);
  }

  pickCountry(uv) {
    if (!this.idData) return null;
    const x = Math.floor(uv.x * this.idCanvas.width);
    const y = Math.floor((1 - uv.y) * this.idCanvas.height);
    const i = (y * this.idCanvas.width + x) * 4;
    const d = this.idData.data;
    if (d[i + 2] !== 255) return null;
    const idx = d[i] + (d[i + 1] << 8) - 1;
    const f = this.features[idx];
    if (!f) return null;
    return { id: f.id || f.properties.name, name: f.properties.name };
  }

  _bindPointer() {
    const canvas = this.game.renderer.domElement;
    let lastX = 0, lastY = 0;
    // Pointer events покривають і мишу, і тач (та перо) одним кодом — без подвійної
    // обробки від синтетичної миші. touch-action:none на канві (styles.css) глушить
    // браузерну прокрутку/зум, тож палець реально крутить глобус.
    canvas.addEventListener('pointerdown', (e) => {
      if (this.game.state !== 'globe') return;
      this.dragging = true;
      this.dragMoved = 0;
      this._pid = e.pointerId;
      lastX = e.clientX; lastY = e.clientY;
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } }
    });
    window.addEventListener('pointermove', (e) => {
      if (this.game.state !== 'globe') return;
      if (this.dragging && (this._pid == null || e.pointerId === this._pid)) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        this.dragMoved += Math.abs(dx) + Math.abs(dy);
        this.targetRotY += dx * 0.005;
        this.targetRotX = Math.max(-0.7, Math.min(0.7, this.targetRotX + dy * 0.003));
        lastX = e.clientX; lastY = e.clientY;
      } else if (e.pointerType === 'mouse') {
        // hover-тултип лише для миші — на тачі нема «наведення»
        this._hover(e);
      }
    });
    const end = (e) => {
      if (this.game.state !== 'globe' || !this.dragging) return;
      if (this._pid != null && e.pointerId !== this._pid) return;
      this.dragging = false;
      this._pid = null;
      if (this.dragMoved < 6) this._click(e);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', () => { this.dragging = false; this._pid = null; });
  }

  _raycast(e) {
    this._ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.sphere);
    return hits.length ? hits[0] : null;
  }

  _hover(e) {
    if (!this.ready) return;
    // не показуємо тултип країни, коли вже НЕ на глобусі (інакше при старті рівня
    // рух миші під час асинхронної побудови «протікає» тултип «звільнено…» у бій).
    // ВАЖЛИВО: під час побудови state ще 'globe' (флип на 'level' — наприкінці
    // _buildLevel), тож перевіряємо і _startingLevel — інакше рух миші на екрані
    // завантаження знову вмикає тултип, і він застрягає над рівнем назавжди
    if (this.game.state !== 'globe' || this.game._startingLevel) { const tt = document.getElementById('globe-tooltip'); if (tt) tt.style.display = 'none'; return; }
    const hit = this._raycast(e);
    const c = hit ? this.pickCountry(hit.uv) : null;
    const newHover = c ? c.id : null;
    const tooltip = document.getElementById('globe-tooltip');
    if (c) {
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top = (e.clientY - 10) + 'px';
      if (this.mode !== 'earth') {
        const world = getSpaceWorld(this.mode.toUpperCase());
        const region = getSpaceRegion(world.id, c.id);
        const doneMap = this._spaceDone(world.id);
        const colony = this._spaceColony(world.id, c.id);
        tooltip.innerHTML = `${doneMap[c.id] ? '✅' : world.icon} <b>${region.name}</b><br>${region.story ? 'Важка сюжетна операція' : `Місії: ${region.missions.join(' · ')}`}<br>🏠 Колонія: ${colony}/3`;
        tooltip.classList.add('available');
        document.body.style.cursor = 'pointer';
      } else {
      const known = COUNTRIES[c.id];
      if ((this.game.save.liberated || {})[c.id]) {
        // ⭐ R3: для країн кампанії показуємо зірки (X/3) у тултипі звільненої країни
        const starLine = CAMPAIGN_ORDER.includes(c.id)
          ? t('<br>⭐ {n}/{m} зірок', { n: countryStars(this.game.save, c.id), m: STARS_PER_COUNTRY })
          : '';
        tooltip.innerHTML = t('✅ <b>{n}</b> — звільнено! Натисни, щоб зіграти ще раз', { n: known ? known.name : c.name }) + starLine + this._frontStatusLine(c.id);
        tooltip.classList.add('available');
      } else if (isCountryOpen(this.game.save.liberated, c.id)) {
        tooltip.innerHTML = t('🔴 {f} <b>{n}</b> — тут зомбі! Натисни, щоб звільнити', { f: known ? known.flag : '', n: known ? known.name : c.name }) + this._frontStatusLine(c.id);
        tooltip.classList.add('available');
      } else {
        tooltip.innerHTML = t('🔒 <b>{n}</b> — спочатку звільни Україну', { n: c.name });
        tooltip.classList.remove('available');
      }
      }
      document.body.style.cursor = 'pointer';
    } else {
      tooltip.style.display = 'none';
      document.body.style.cursor = 'default';
    }
    if (newHover !== this.hoverId) {
      this.hoverId = newHover;
      if (this.ready) this.repaint();
    }
  }

  _click(e) {
    if (!this.ready) return;
    const hit = this._raycast(e);
    if (!hit) return;
    const c = this.pickCountry(hit.uv);
    if (!c) return;
    this.game.audio.ensure();
    if (this.mode !== 'earth') {
      this.game.audio.click();
      document.getElementById('globe-tooltip').style.display = 'none';
      document.body.style.cursor = 'default';
      this.game.startLevel('MOON', { moonRegion: c.id, spaceWorld: this.mode.toUpperCase() });
      return;
    }
    const playable = (this.game.save.liberated || {})[c.id] || isCountryOpen(this.game.save.liberated, c.id);
    if (playable && COUNTRIES[c.id]) {
      this.game.audio.click();
      document.getElementById('globe-tooltip').style.display = 'none';
      document.body.style.cursor = 'default';
      this.game.startLevel(c.id);
    } else {
      this.game.audio.denied();
      this.game.hud.toast(t('🔒 {n}: спочатку звільни Україну!', { n: c.name }));
    }
  }

  setLiberated() {
    if (this.mode !== 'earth') { this.setMode(this.mode); return; }
    const lastTarget = this.targetId;
    const nt = nextTarget(this.game.save.liberated || {});
    this.allDone = nt === null;
    // 🦖 після звільнення світу ведемо на таємний острів, поки й його не пройдено
    this.targetId = nt || ((this.game.save.liberated || {}).LOST ? lastTarget : 'LOST');
    this.repaint();
    this._aimBeaconAt(this.targetId);
    this._rotateToCountry(this.targetId);
  }

  update(dt) {
    if (this.ready && this._paintedFront !== this.game.save.front) this.repaint();
    this.t += dt;
    // плавне обертання до цілі
    this.group.rotation.y += (this.targetRotY - this.group.rotation.y) * Math.min(1, dt * 8);
    this.group.rotation.x += (this.targetRotX - this.group.rotation.x) * Math.min(1, dt * 8);
    this.stars.rotation.y += dt * 0.008;
    if (this.spaceShip.visible) {
      this.spaceShip.position.y = -0.52 + Math.sin(this.t * 1.3) * 0.035;
      this.spaceShip.rotation.y += dt * 0.18;
    }
    // пульс маяка
    const pulse = 1 + Math.sin(this.t * 3) * 0.25;
    this.ringMesh.scale.setScalar(pulse);
    this.beamMesh.material.opacity = 0.55 + Math.sin(this.t * 3) * 0.3;
    this.labelSprite.material.opacity = 0.85 + Math.sin(this.t * 2) * 0.15;
    // легке дихання камери
    this.camera.position.y = 0.85 + Math.sin(this.t * 0.7) * 0.03;
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
