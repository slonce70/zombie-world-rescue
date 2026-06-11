// HUD: приціл, здоров'я, патрони, монети, місії, мінікарта, банери
import { ROADS, LAYOUT } from './world.js';
import { WEAPONS } from './player.js';
import { clamp } from './utils.js';

export class HUD {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'),
      crosshair: $('crosshair'),
      healthFill: $('health-fill'),
      healthText: $('health-text'),
      ammoMag: $('ammo-mag'),
      ammoReserve: $('ammo-reserve'),
      weaponName: $('weapon-name'),
      coins: $('coins-value'),
      missions: $('mission-list'),
      minimap: $('minimap'),
      prompt: $('prompt'),
      promptText: $('prompt-text'),
      promptBar: $('prompt-bar'),
      promptFill: $('prompt-fill'),
      banner: $('banner'),
      bannerTitle: $('banner-title'),
      bannerSub: $('banner-sub'),
      toasts: $('toasts'),
      vignette: $('vignette'),
      healGlow: $('heal-glow'),
      hitmarker: $('hitmarker'),
      bossbar: $('bossbar'),
      bossFill: $('boss-fill'),
      hordeCounter: $('horde-counter'),
      hordeValue: $('horde-value'),
      grenades: $('grenades'),
      grenadesValue: $('grenades-value'),
      combo: $('combo'),
    };
    this._lastCombo = 0;
    this.ctx = this.el.minimap.getContext('2d');
    this.bannerT = 0;
    this.hitT = 0;
    this.vignetteT = 0;
    this.lastHealth = 100;
    this.minimapT = 0;
  }

  wire(bus) {
    bus.on('hitmarker', (crit) => this.hitmarker(crit));
    bus.on('playerHurt', () => this.damageFlash());
    bus.on('toast', (text) => this.toast(text));
    bus.on('missionDone', (m) => this.banner('✅ МІСІЮ ВИКОНАНО!', `${m.title} · +${m.reward} монет 💰`));
    bus.on('hordeWarning', () => this.banner('⚠️ УВАГА!', 'Наближається орда зомбі!'));
    bus.on('hordeStart', () => this.banner('🧟 ОРДА!', 'Відбий напад!'));
    bus.on('hordeEnd', () => this.banner('🎉 Орду відбито!', '+60 монет 💰'));
    bus.on('bossUnlocked', () => this.banner('👑 АРЕНА ВІДКРИТА!', 'Іди до фіолетового маркера і переможи БОСА!'));
    bus.on('bossStart', () => {
      const c = this.game.level && this.game.level.country;
      this.banner('👑 БОС КРАЇНИ!', c ? `Звільни країну: ${c.name}!` : 'Переможи боса!');
    });
    bus.on('bossCharge', () => this.toast('⚠️ Бос розганяється — тікай убік!'));
    bus.on('bossSummon', () => this.toast('🧟 Бос кличе підмогу!'));
  }

  banner(title, sub = '', dur = 3.2) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.add('show');
    this.bannerT = dur;
  }

  toast(text, dur = 4) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    this.el.toasts.appendChild(div);
    requestAnimationFrame(() => div.classList.add('show'));
    setTimeout(() => {
      div.classList.remove('show');
      setTimeout(() => div.remove(), 500);
    }, dur * 1000);
  }

  hitmarker(crit) {
    this.el.hitmarker.classList.remove('show', 'crit');
    void this.el.hitmarker.offsetWidth;
    this.el.hitmarker.classList.add('show');
    if (crit) this.el.hitmarker.classList.add('crit');
    this.hitT = 0.18;
  }

  damageFlash() {
    this.vignetteT = 0.7;
  }

  comboPop() {
    // плавний поп обробляється в update через _lastCombo
  }

  showBoss(show) {
    this.el.bossbar.classList.toggle('show', show);
  }

  update(dt) {
    const level = this.game.level;
    if (!level) return;
    const p = level.player;

    // здоров'я
    const hpFrac = clamp(p.health / p.maxHealth, 0, 1);
    this.el.healthFill.style.width = (hpFrac * 100) + '%';
    this.el.healthText.textContent = `${Math.ceil(p.health)} / ${p.maxHealth}`;
    this.el.healthFill.classList.toggle('low', hpFrac < 0.3);
    // зелене свічення при лікуванні
    if (p.health > this.lastHealth + 0.01 && p.health < p.maxHealth) {
      this.el.healGlow.style.opacity = 0.5;
    } else {
      this.el.healGlow.style.opacity = Math.max(0, parseFloat(this.el.healGlow.style.opacity || 0) - dt * 1.2);
    }
    this.lastHealth = p.health;

    // патрони
    const a = p.curAmmo;
    this.el.ammoMag.textContent = p.reloading > 0 ? '⟳' : a.mag;
    this.el.ammoReserve.textContent = a.reserve === Infinity ? '∞' : a.reserve;
    this.el.weaponName.textContent = `${p.weapon.icon} ${p.weapon.name}`;
    this.el.ammoMag.classList.toggle('low', a.mag <= 4 && p.reloading <= 0);

    // гранати
    this.el.grenadesValue.textContent = p.grenades;
    this.el.grenades.classList.toggle('none', p.grenades === 0);

    // комбо
    const combo = level.combo ? level.combo.n : 0;
    if (combo >= 3) {
      this.el.combo.classList.add('show');
      if (combo !== this._lastCombo) {
        this.el.combo.textContent = `🔥 x${combo}`;
        this.el.combo.classList.remove('pop');
        void this.el.combo.offsetWidth;
        this.el.combo.classList.add('pop');
      }
    } else {
      this.el.combo.classList.remove('show');
    }
    this._lastCombo = combo;

    // монети
    this.el.coins.textContent = this.game.save.coins;

    // приціл: розліт
    const spread = 6 + p.gunKick * 14 + p.bobAmp * 6;
    this.el.crosshair.style.setProperty('--gap', spread + 'px');

    // місії
    const list = level.missions.getHudList();
    let html = '';
    for (const m of list) {
      html += `<div class="mission ${m.done ? 'done' : ''}"><span class="mi">${m.done ? '✅' : m.icon}</span> ${m.title}</div>`;
    }
    if (this.el.missions.innerHTML !== html) this.el.missions.innerHTML = html;

    // підказка взаємодії
    const prompt = level.missions.prompt;
    if (prompt) {
      this.el.prompt.classList.add('show');
      this.el.promptText.textContent = prompt.text;
      if (prompt.hold) {
        this.el.promptBar.style.display = 'block';
        this.el.promptFill.style.width = (prompt.progress * 100) + '%';
      } else {
        this.el.promptBar.style.display = 'none';
      }
    } else {
      this.el.prompt.classList.remove('show');
    }

    // банер
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.classList.remove('show');
    }

    // віньєтка
    if (this.vignetteT > 0) {
      this.vignetteT -= dt;
      this.el.vignette.style.opacity = clamp(this.vignetteT / 0.7, 0, 1) * 0.75;
    } else {
      // постійна слабка віньєтка при низькому HP
      this.el.vignette.style.opacity = hpFrac < 0.3 ? 0.35 + Math.sin(performance.now() / 300) * 0.1 : 0;
    }

    // хітмаркер
    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) this.el.hitmarker.classList.remove('show', 'crit');
    }

    // бос
    const boss = level.zombies.boss;
    if (boss) {
      this.showBoss(true);
      this.el.bossFill.style.width = (clamp(boss.hp / boss.maxHp, 0, 1) * 100) + '%';
    } else if (this.el.bossbar.classList.contains('show')) {
      this.showBoss(false);
    }

    // лічильник орди
    const zm = level.zombies;
    if (zm.hordeActive) {
      this.el.hordeCounter.classList.add('show');
      this.el.hordeValue.textContent = zm.hordeRemaining;
    } else {
      this.el.hordeCounter.classList.remove('show');
    }

    // мінікарта (15 разів/с достатньо)
    this.minimapT -= dt;
    if (this.minimapT <= 0) {
      this.minimapT = 1 / 15;
      this._drawMinimap();
    }
  }

  _drawMinimap() {
    const ctx = this.ctx;
    const level = this.game.level;
    const p = level.player;
    const W = this.el.minimap.width;
    const C = W / 2;
    const R = C - 4;
    const VIEW = 85; // метрів видно
    const k = R / VIEW;
    const yaw = p.yaw;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const toMap = (wx, wz) => {
      const dx = wx - p.pos.x, dz = wz - p.pos.z;
      return [C + (dx * cos - dz * sin) * k, C + (dx * sin + dz * cos) * k];
    };

    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath();
    ctx.arc(C, C, R, 0, 6.29);
    ctx.clip();
    // фон — за біомом країни
    const winter = level.country && level.country.biome === 'winterDusk';
    const grad = ctx.createRadialGradient(C, C, 10, C, C, R);
    grad.addColorStop(0, winter ? 'rgba(190, 205, 222, 0.92)' : 'rgba(72, 128, 56, 0.92)');
    grad.addColorStop(1, winter ? 'rgba(140, 158, 182, 0.92)' : 'rgba(48, 92, 40, 0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, W);
    // межа світу
    const [bx, by] = toMap(0, 0);
    ctx.beginPath();
    ctx.arc(bx, by, LAYOUT.BOUND * k, 0, 6.29);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // дороги
    ctx.strokeStyle = 'rgba(185, 160, 120, 0.9)';
    ctx.lineWidth = 4;
    for (const line of ROADS) {
      ctx.beginPath();
      for (let i = 0; i < line.length; i++) {
        const [mx, my] = toMap(line[i][0], line[i][1]);
        if (i === 0) ctx.moveTo(mx, my);
        else ctx.lineTo(mx, my);
      }
      ctx.stroke();
    }
    // зомбі поблизу
    for (const z of level.zombies.list) {
      if (z.state === 'dead') continue;
      const d = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
      if (d > VIEW) continue;
      const [mx, my] = toMap(z.x, z.z);
      if (z.type === 'boss') {
        ctx.font = '14px serif';
        ctx.textAlign = 'center';
        ctx.fillText('👑', mx, my + 5);
      } else {
        ctx.beginPath();
        ctx.arc(mx, my, 3, 0, 6.29);
        ctx.fillStyle = z.aggroed ? '#ff5544' : '#cc8888';
        ctx.fill();
      }
    }
    // цивільні
    for (const c of level.missions.civilians) {
      const [mx, my] = toMap(c.x, c.z);
      ctx.beginPath();
      ctx.arc(mx, my, 2.5, 0, 6.29);
      ctx.fillStyle = '#7dffb0';
      ctx.fill();
    }
    ctx.restore();

    // охоронці складу — помаранчеві точки навіть здалека, поки місія активна
    const wh = level.missions.get('warehouse');
    if (wh && wh.state === 'active' && !level.missions.crateReady) {
      for (const z of level.zombies.list) {
        if (z.zone !== 'warehouse' || z.state === 'dead') continue;
        let [mx, my] = toMap(z.x, z.z);
        const ddx = mx - C, ddy = my - C;
        const dd = Math.hypot(ddx, ddy);
        if (dd > R - 8) {
          mx = C + (ddx / dd) * (R - 8);
          my = C + (ddy / dd) * (R - 8);
        }
        ctx.beginPath();
        ctx.arc(mx, my, 3.5, 0, 6.29);
        ctx.fillStyle = '#ffaa33';
        ctx.fill();
        ctx.strokeStyle = '#7a4a00';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // маркери місій (клампимо до краю)
    for (const m of level.missions.getMarkers()) {
      let [mx, my] = toMap(m.x, m.z);
      const ddx = mx - C, ddy = my - C;
      const dd = Math.hypot(ddx, ddy);
      if (dd > R - 12) {
        mx = C + (ddx / dd) * (R - 12);
        my = C + (ddy / dd) * (R - 12);
      }
      ctx.font = '13px serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.icon, mx, my + 5);
    }

    // гравець (трикутник, завжди вгору)
    ctx.save();
    ctx.translate(C, C);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#2266aa';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // північ
    const nx = C + sin * (R - 9);
    const ny = C - cos * (R - 9);
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffdd66';
    ctx.fillText('N', nx, ny + 4);

    // рамка
    ctx.beginPath();
    ctx.arc(C, C, R, 0, 6.29);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}
