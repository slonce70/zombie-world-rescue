// HUD: приціл, здоров'я, патрони, монети, місії, мінікарта, банери, стрілка до цілі

import * as THREE from 'three';
import { t } from './i18n.js';
import { WEAPONS } from './player.js';
import { GADGETS } from './extras.js';
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
      armorBar: $('armor-bar'),
      armorFill: $('armor-fill'),
      buffs: $('buffs'),
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
      waypoint: $('waypoint'),
      wpArrow: $('wp-arrow'),
      wpLabel: $('wp-label'),
      xpChip: $('xp-chip'),
      xpLvl: $('xp-lvl'),
      xpFill: $('xp-fill'),
      gadgetChips: $('gadget-chips'),
      missionPanel: $('mission-panel'),
      scope: $('scope'),
      tbScope: $('tb-scope'),
      tbPing: $('tb-ping'),
      teamPanel: $('team-panel'),
    };
    this._lastCombo = 0;
    this._lastCoins = -1;
    this._v3 = new THREE.Vector3();
    this.ctx = this.el.minimap.getContext('2d');
    this.bannerT = 0;
    this.hitT = 0;
    this.vignetteT = 0;
    this.lastHealth = 100;
    this.minimapT = 0;
  }

  _bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  wire(bus) {
    bus.on('hitmarker', (crit) => this.hitmarker(crit));
    bus.on('playerHurt', () => this.damageFlash());
    bus.on('toast', (text) => this.toast(text));
    bus.on('missionDone', (m) => {
      this.banner(t('✅ МІСІЮ ВИКОНАНО!'), t('{title} · +{r} монет 💰', { title: m.title, r: m.reward }));
      this._bump(this.el.missionPanel);
    });
    bus.on('hordeWarning', () => this.banner(t('⚠️ УВАГА!'), t('Наближається орда зомбі!')));
    bus.on('hordeStart', () => this.banner(t('🧟 ОРДА!'), t('Відбий напад!')));
    bus.on('hordeEnd', () => this.banner(t('🎉 Орду відбито!'), t('+60 монет 💰')));
    bus.on('bossUnlocked', () => this.banner(t('👑 АРЕНА ВІДКРИТА!'), t('Іди до фіолетового маркера і переможи БОСА!')));
    bus.on('bossStart', () => {
      const c = this.game.level && this.game.level.country;
      this.banner(t('👑 БОС КРАЇНИ!'), c ? t('Звільни країну: {c}!', { c: c.name }) : t('Переможи боса!'));
    });
    bus.on('bossCharge', () => this.toast(t('⚠️ Бос розганяється — тікай убік!')));
    bus.on('bossSummon', () => this.toast(t('🧟 Бос кличе підмогу!')));
    bus.on('shieldBroken', () => {
      if (!this._shieldTipShown) {
        this._shieldTipShown = true;
        this.toast(t('🛡 Щит розбито! Тепер щитоносець беззахисний — добивай!'));
      }
    });
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

  setKidChip(on) {
    const el = document.getElementById('kid-chip');
    // display:'' навмисно — видимість делегується правилу CSS .touch-mode.kid-mode.in-level #kid-chip
    if (el) el.style.display = on ? '' : 'none';
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

    // броня
    if (p.armor > 0) {
      this.el.armorBar.style.display = 'block';
      this.el.armorFill.style.width = (clamp(p.armor / p.maxArmor, 0, 1) * 100) + '%';
    } else {
      this.el.armorBar.style.display = 'none';
    }

    // активні бафи з таймерами
    let buffHtml = '';
    const BUFF_ICONS = { speed: '⚡', rage: '💪', bubble: '🛡', magnet: '🧲' };
    for (const [k, icon] of Object.entries(BUFF_ICONS)) {
      if (p.buffs[k] > 0) {
        buffHtml += `<div class="buff"><span class="buff-icon">${icon}</span><span class="buff-t">${Math.ceil(p.buffs[k])}</span></div>`;
      }
    }
    if (this._lastBuffHtml !== buffHtml) {
      this.el.buffs.innerHTML = buffHtml;
      this._lastBuffHtml = buffHtml;
    }

    // патрони / 🔋 паливо (континуальні зброї — лазер/вогнемет)
    const w = p.weapon;
    this.el.weaponName.textContent = `${w.icon} ${t(w.name)}`;
    if (w.continuous) {
      // показуємо ПАЛИВО (секунди балона), а не mag/reserve; під час перезарядки — ⟳
      const fuel = p.fuel[p.cur] || 0;
      const frac = fuel / w.fuelMax;
      if (p.reloading > 0) {
        this.el.ammoMag.textContent = '⟳';
        this.el.ammoReserve.textContent = t('заряд…');
        this.el.ammoMag.classList.add('low');
        this.el.ammoReserve.classList.add('low');
      } else {
        this.el.ammoMag.textContent = '🔋';
        this.el.ammoReserve.textContent = fuel.toFixed(1) + t('с');
        this.el.ammoMag.classList.toggle('low', frac < 0.2);
        this.el.ammoReserve.classList.toggle('low', frac < 0.2);
      }
    } else {
      const a = p.curAmmo;
      this.el.ammoMag.textContent = p.reloading > 0 ? '⟳' : a.mag;
      this.el.ammoReserve.textContent = a.reserve === Infinity ? '∞' : a.reserve;
      this.el.ammoMag.classList.toggle('low', a.mag <= 4 && p.reloading <= 0);
      this.el.ammoReserve.classList.remove('low');
    }

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

    // монети (з підстрибуванням, коли зросли)
    const coinsNow = this.game.save.coins;
    if (coinsNow !== this._lastCoins) {
      this.el.coins.textContent = coinsNow;
      if (this._lastCoins >= 0 && coinsNow > this._lastCoins) this._bump(this.el.coins.parentElement || this.el.coins);
      this._lastCoins = coinsNow;
    }

    // зірковий рівень (XP)
    const prog = this.game.progress;
    if (prog) {
      const lvlTxt = `⭐ ${prog.level}`;
      if (this.el.xpLvl.textContent !== lvlTxt) this.el.xpLvl.textContent = lvlTxt;
      this.el.xpFill.style.width = (prog.levelFrac() * 100) + '%';
    }

    // чип активного гаджета (F) з перезарядкою
    const gadgets = level.gadgets;
    const activeG = this.game.save.activeGadget;
    let gHtml = '';
    if (activeG && gadgets) {
      const icon = GADGETS[activeG] ? GADGETS[activeG].icon : '';
      gHtml = gadgets.cd > 0
        ? `<span class="none">${icon} ${Math.ceil(gadgets.cd)}${t('с')}</span>`
        : `${icon} ${t('ГОТОВО (F)')}`;
    }
    if (this._lastGadgetHtml !== gHtml) {
      this.el.gadgetChips.innerHTML = gHtml;
      this._lastGadgetHtml = gHtml;
      const btn = document.getElementById('tb-gadget');
      if (btn && activeG) {
        btn.childNodes[0].textContent = GADGETS[activeG] ? GADGETS[activeG].icon : '';
      }
      const badge = document.getElementById('tb-gadget-n');
      if (badge) badge.textContent = gadgets && gadgets.cd > 0 ? Math.ceil(gadgets.cd) : '✓';
    }

    // 🔫 тач: на кнопці перемикання показуємо ПОТОЧНУ зброю — дитина бачить, що тримає
    if (this._lastWeaponBtn !== p.cur) {
      this._lastWeaponBtn = p.cur;
      const wbtn = document.getElementById('tb-weapon');
      if (wbtn) wbtn.firstChild ? (wbtn.firstChild.textContent = p.weapon.icon) : (wbtn.textContent = p.weapon.icon);
    }

    // стрілка-вказівник до поточної цілі
    this._updateWaypoint(level, p);

    // приціл: розліт
    const spread = 6 + p.gunKick * 14 + p.bobAmp * 6;
    this.el.crosshair.style.setProperty('--gap', spread + 'px');

    // 🔭 оптика снайперки
    const scopeOn = !!p.scoped;
    if (scopeOn !== this._lastScope) {
      this._lastScope = scopeOn;
      this.el.scope.classList.toggle('show', scopeOn);
      this.el.crosshair.style.display = scopeOn ? 'none' : '';
      if (this.el.tbScope) this.el.tbScope.classList.toggle('on', scopeOn);
    }
    if (this.el.tbScope && this.game.input.touchMode) {
      const avail = p.cur === 'sniper' && p.firstPerson;
      this.el.tbScope.classList.toggle('avail', avail);
      if (!avail && this.game.input.touchScope) this.game.input.touchScope = false;
    }
    // 📣 тач-кнопка пінгів — лише у кооп-рівні (як клавіша C)
    if (this.el.tbPing && this.game.input.touchMode) {
      const coopLevel = !!(this.game.coop && this.game.coop.session.state === 'level');
      this.el.tbPing.classList.toggle('avail', coopLevel);
    }

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

    // 🤝 панель команди (кооп)
    let teamHtml = '';
    if (level.net) {
      const esc = (str) => String(str).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      for (const [, rp] of level.net.remotes) {
        const pct = clamp(rp.health / (rp.maxHealth || 100), 0, 1);
        const dead = rp.health <= 0;
        teamHtml += `<div class="team-row"><div class="team-nick ${dead ? 'dead' : ''}">${dead ? '💀 ' : '🤝 '}${esc(rp.nick)}</div>`
          + `<div class="team-hp"><div class="${pct < 0.3 ? 'low' : ''}" style="width:${Math.round(pct * 100)}%"></div></div></div>`;
      }
    }
    if (this._lastTeamHtml !== teamHtml) {
      this.el.teamPanel.innerHTML = teamHtml;
      this._lastTeamHtml = teamHtml;
    }

    // мінікарта (15 разів/с достатньо)
    this.minimapT -= dt;
    if (this.minimapT <= 0) {
      this.minimapT = 1 / 15;
      this._drawMinimap();
    }
  }

  // ---------- стрілка-вказівник до цілі ----------
  _waypointTarget(level) {
    // шторм: якщо гравець поза колом — веди в безпечну зону
    if (level.storm && level.storm.isOutside()) {
      const s = level.storm;
      return { x: s.cx, z: s.cz, icon: '🟢', label: t('БІЖИ В КОЛО!') };
    }
    const ms = level.missions;
    const boss = level.zombies.boss;
    if (boss && boss.state !== 'dead') return { x: boss.x, z: boss.z, y: boss.y + boss.rig.height + 1, icon: '👑' };
    const mk = ms.getMarkers ? ms.getMarkers() : [];
    if (mk.length) return { x: mk[0].x, z: mk[0].z, icon: mk[0].icon };
    return null;
  }

  _updateWaypoint(level, p) {
    const wp = this.el.waypoint;
    const wt = this._waypointTarget(level);
    if (!wt || this.game.victoryShown || p.health <= 0) {
      wp.classList.remove('show');
      return;
    }
    const cam = p.camera;
    const ty = wt.y !== undefined ? wt.y : level.world.groundH(wt.x, wt.z) + 2.4;
    const v = this._v3.set(wt.x, ty, wt.z).project(cam);
    const behind = v.z > 1;
    let sx = (v.x * 0.5 + 0.5) * innerWidth;
    let sy = (-v.y * 0.5 + 0.5) * innerHeight;
    const dist = Math.hypot(wt.x - p.pos.x, wt.z - p.pos.z);
    const label = wt.label || `${wt.icon} ${Math.round(dist)}${t('м')}`;
    if (this._lastWpLabel !== label) {
      this.el.wpLabel.textContent = label;
      this._lastWpLabel = label;
    }
    wp.classList.add('show');
    // близько до цілі — ховаємо, щоб не миготіло перед носом
    if (dist < 7 && !wt.label) {
      wp.classList.remove('show');
      return;
    }
    const onScreen = !behind && Math.abs(v.x) < 0.88 && Math.abs(v.y) < 0.82;
    if (onScreen) {
      wp.classList.add('on');
      wp.classList.remove('edge');
      wp.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -100%)`;
    } else {
      // ціль поза екраном: стрілка на краю, повернута в її бік
      wp.classList.add('edge');
      wp.classList.remove('on');
      if (behind) { sx = innerWidth - sx; sy = innerHeight - sy; }
      const cx = innerWidth / 2, cy = innerHeight / 2;
      let dx = sx - cx, dy = sy - cy;
      if (behind) { dx = -dx || 0.01; dy = Math.abs(dy) + 40; } // позаду — стрілка вниз/убік
      // розтягуємо напрямок до краю екрана і клампимо з відступами
      const len = Math.hypot(dx, dy) || 1;
      const px2 = clamp(cx + (dx / len) * innerWidth, 80, innerWidth - 80);
      const py2 = clamp(cy + (dy / len) * innerHeight, 70, innerHeight - 120);
      const ang = Math.atan2(py2 - cy, px2 - cx);
      wp.style.transform = `translate(${Math.round(px2)}px, ${Math.round(py2)}px) translate(-50%, -50%)`;
      this.el.wpArrow.style.transform = `rotate(${ang}rad)`;
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
    ctx.arc(bx, by, level.world.layout.BOUND * k, 0, 6.29);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // дороги
    ctx.strokeStyle = 'rgba(185, 160, 120, 0.9)';
    ctx.lineWidth = 4;
    for (const line of level.world.roads) {
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
      if (z.golden) {
        // золотий видно завжди — полювання за скарбом!
        let [gx, gy] = toMap(z.x, z.z);
        const gdx = gx - C, gdy = gy - C;
        const gd = Math.hypot(gdx, gdy);
        if (gd > R - 10) {
          gx = C + (gdx / gd) * (R - 10);
          gy = C + (gdy / gd) * (R - 10);
        }
        ctx.font = '18px serif';
        ctx.textAlign = 'center';
        ctx.fillText('⭐', gx, gy + 5);
        continue;
      }
      const d = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
      if (d > VIEW) continue;
      const [mx, my] = toMap(z.x, z.z);
      if (z.type === 'boss') {
        ctx.font = '18px serif';
        ctx.textAlign = 'center';
        ctx.fillText('👑', mx, my + 5);
      } else {
        ctx.beginPath();
        ctx.arc(mx, my, 4.2, 0, 6.29);
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
      ctx.font = '18px serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.icon, mx, my + 5);
    }

    // 🤝 союзники — блакитні крапки (видно навіть за межами огляду)
    if (level.net) {
      for (const [, rp] of level.net.remotes) {
        let [ax, ay] = toMap(rp.pos.x, rp.pos.z);
        const adx = ax - C, ady = ay - C;
        const ad = Math.hypot(adx, ady);
        if (ad > R - 9) {
          ax = C + (adx / ad) * (R - 9);
          ay = C + (ady / ad) * (R - 9);
        }
        ctx.beginPath();
        ctx.arc(ax, ay, 4, 0, 6.29);
        ctx.fillStyle = rp.health > 0 ? '#4fd8ff' : '#8090a0';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
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

    // ⛈️ коло шторму
    if (level.storm) {
      const s = level.storm;
      const [sx, sy] = toMap(s.cx, s.cz);
      ctx.save();
      ctx.beginPath();
      ctx.arc(C, C, R, 0, 6.29);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(sx, sy, s.r * k, 0, 6.29);
      ctx.strokeStyle = 'rgba(176, 134, 242, 0.95)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    // рамка
    ctx.beginPath();
    ctx.arc(C, C, R, 0, 6.29);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}
