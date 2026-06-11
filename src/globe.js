// Глобальна карта: 3D-глобус, сірі захоплені країни, вибір країни
import * as THREE from 'three';

function latLonToVec3(lat, lon, r, out = new THREE.Vector3()) {
  const phi = (lon + 180) * Math.PI / 180;
  const theta = (90 - lat) * Math.PI / 180;
  return out.set(
    -r * Math.cos(phi) * Math.sin(theta),
    r * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

const UKRAINE = { id: 'UKR', name: 'Україна', lat: 49.2, lon: 31.4 };

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
    this.ready = false;
    this.dragging = false;
    this.dragMoved = 0;
    this.hoverId = null;
    this.t = 0;
    this.raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();

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

    // маяк над Україною
    this.beacon = this._makeBeacon();
    this.group.add(this.beacon);

    // початкове обертання: Україна до камери
    const up = latLonToVec3(UKRAINE.lat, UKRAINE.lon, 1);
    this.group.rotation.y = -Math.atan2(up.x, up.z);
    this.group.rotation.x = 0.42; // нахил, щоб Україна була ближче до центру кадру
    this.baseRotY = this.group.rotation.y;
    this.targetRotY = this.group.rotation.y;
    this.targetRotX = 0.42;

    this._bindPointer();
  }

  _makeBeacon() {
    const g = new THREE.Group();
    const pos = latLonToVec3(UKRAINE.lat, UKRAINE.lon, this.R);
    // промінь
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.03, 0.5, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    beam.position.copy(pos).multiplyScalar(1.25);
    beam.lookAt(0, 0, 0);
    beam.rotateX(Math.PI / 2);
    g.add(beam);
    this.beamMesh = beam;
    // кільце
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.06, 0.008, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9 })
    );
    ring.position.copy(pos).multiplyScalar(1.005);
    ring.lookAt(0, 0, 0);
    g.add(ring);
    this.ringMesh = ring;
    // підпис
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 160;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(20,30,50,0.85)';
    ctx.beginPath();
    ctx.roundRect(20, 14, 472, 100, 24);
    ctx.fill();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('УКРАЇНА', 256, 62);
    ctx.fillStyle = '#ffd23f';
    ctx.font = '34px Arial';
    ctx.fillText('натисни — почни місію!', 256, 102);
    // трикутник-хвостик
    ctx.fillStyle = 'rgba(20,30,50,0.85)';
    ctx.beginPath();
    ctx.moveTo(236, 112); ctx.lineTo(276, 112); ctx.lineTo(256, 148);
    ctx.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(0.62, 0.2, 1);
    sprite.position.copy(pos).multiplyScalar(1.0).add(pos.clone().normalize().multiplyScalar(0.55));
    g.add(sprite);
    this.labelSprite = sprite;
    return g;
  }

  async load() {
    const res = await fetch('./assets/countries.geo.json');
    const data = await res.json();
    this.features = data.features;
    this.repaint();
    this.ready = true;
  }

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

  repaint() {
    const ctx = this.texCanvas.getContext('2d');
    const w = this.texCanvas.width, h = this.texCanvas.height;
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
      let fill = '#8d86a3', stroke = '#6b6485'; // захоплені зомбі — хворобливо-фіолетові
      if (liberated[id]) { fill = '#58c14c'; stroke = '#3e9c36'; }
      else if (id === 'UKR') {
        fill = this.hoverId === 'UKR' ? '#ffe06b' : '#f2c94c';
        stroke = '#c99a1f';
      }
      this._paintCountry(ctx, f, fill, stroke, w, h);
    }
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
    canvas.addEventListener('mousedown', (e) => {
      if (this.game.state !== 'globe') return;
      this.dragging = true;
      this.dragMoved = 0;
      lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.game.state !== 'globe') return;
      if (this.dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        this.dragMoved += Math.abs(dx) + Math.abs(dy);
        this.targetRotY += dx * 0.005;
        this.targetRotX = Math.max(-0.7, Math.min(0.7, this.targetRotX + dy * 0.003));
        lastX = e.clientX; lastY = e.clientY;
      } else {
        this._hover(e);
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (this.game.state !== 'globe' || !this.dragging) return;
      this.dragging = false;
      if (this.dragMoved < 6) this._click(e);
    });
  }

  _raycast(e) {
    this._ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.sphere);
    return hits.length ? hits[0] : null;
  }

  _hover(e) {
    if (!this.ready) return;
    const hit = this._raycast(e);
    const c = hit ? this.pickCountry(hit.uv) : null;
    const newHover = c ? c.id : null;
    const tooltip = document.getElementById('globe-tooltip');
    if (c) {
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top = (e.clientY - 10) + 'px';
      if (c.id === 'UKR') {
        tooltip.innerHTML = '🇺🇦 <b>Україна</b> — натисни, щоб грати!';
        tooltip.classList.add('available');
      } else if ((this.game.save.liberated || {})[c.id]) {
        tooltip.innerHTML = `✅ <b>${c.name}</b> — звільнено!`;
        tooltip.classList.remove('available');
      } else {
        tooltip.innerHTML = `🔒 <b>${c.name}</b> — спочатку звільни Україну`;
        tooltip.classList.remove('available');
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
    if (c.id === 'UKR') {
      this.game.audio.click();
      document.getElementById('globe-tooltip').style.display = 'none';
      document.body.style.cursor = 'default';
      this.game.startLevel('UKR');
    } else {
      this.game.audio.denied();
      this.game.hud.toast(`🔒 ${c.name}: спочатку звільни Україну!`);
    }
  }

  setLiberated() {
    this.repaint();
    // маяк стає прапорцем перемоги
    this.beamMesh.material.color.setHex(0x58c14c);
    this.ringMesh.material.color.setHex(0x58c14c);
  }

  update(dt) {
    this.t += dt;
    // плавне обертання до цілі
    this.group.rotation.y += (this.targetRotY - this.group.rotation.y) * Math.min(1, dt * 8);
    this.group.rotation.x += (this.targetRotX - this.group.rotation.x) * Math.min(1, dt * 8);
    this.stars.rotation.y += dt * 0.008;
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
