// Процедурний звук через Web Audio API — без жодного аудіофайлу

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioMan {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.mode = null; // 'globe' | 'calm' | 'battle' | 'boss' | null
    this.bpm = 92;
    this.musStep = 0;
    this.nextT = 0;
    this._groanCd = 0;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.musGain = this.ctx.createGain();
      this.musGain.gain.value = 0.14;
      this.musGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 1.0;
      this.sfxGain.connect(this.master);
      // буфер білого шуму
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      setInterval(() => this._schedule(), 80);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  // ---------- примітиви ----------
  _osc(type, freq, t0, dur, vol, freqEnd = null, dest = null) {
    if (!this.ctx) return null;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest || this.sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return { o, g };
  }

  _noise(t0, dur, vol, filterType = 'lowpass', freq = 1000, q = 1, freqEnd = null) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.sfxGain);
    s.start(t0);
    s.stop(t0 + dur + 0.05);
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  // ---------- ефекти ----------
  shot(kind) {
    if (!this.ctx) return;
    const t = this.t;
    if (kind === 'rifle') {
      this._noise(t, 0.09, 0.5, 'lowpass', 2800, 1, 400);
      this._noise(t, 0.03, 0.35, 'highpass', 3000, 1);
      this._osc('sine', 160, t, 0.08, 0.5, 50);
    } else if (kind === 'shotgun') {
      this._noise(t, 0.22, 0.6, 'lowpass', 1100, 1, 140);
      this._noise(t, 0.06, 0.4, 'highpass', 1800, 1);
      this._osc('sine', 110, t, 0.18, 0.6, 32);
    } else {
      this._noise(t, 0.12, 0.55, 'lowpass', 1900, 1, 250);
      this._osc('sine', 180, t, 0.1, 0.55, 45);
    }
  }

  step() {
    if (!this.ctx) return;
    this._noise(this.t, 0.05, 0.07, 'lowpass', 350 + Math.random() * 150);
  }

  shriek(vol = 1, pitch = 1) {
    if (!this.ctx || (this._shriekCd || 0) > this.t) return;
    this._shriekCd = this.t + 0.6;
    const t = this.t;
    this._osc('sawtooth', 280 * pitch, t, 0.45, 0.25 * Math.min(1, vol), 850 * pitch);
  }

  bounce() {
    this._osc('square', 500, this.t, 0.04, 0.1, 300);
  }

  explosion() {
    const t = this.t;
    this._osc('sine', 80, t, 0.6, 0.7, 24);
    this._noise(t, 0.5, 0.55, 'lowpass', 600, 1, 90);
    this._noise(t, 0.15, 0.3, 'highpass', 1500, 1);
  }

  throwWhoosh(vol = 1) {
    this._noise(this.t, 0.25, 0.18 * Math.min(1, vol), 'bandpass', 600, 2, 1800);
  }

  comboDing(level = 1) {
    const t = this.t;
    const base = 72 + Math.min(level, 6) * 2;
    this._osc('triangle', midi(base), t, 0.12, 0.25);
    this._osc('triangle', midi(base + 4), t + 0.07, 0.12, 0.25);
    this._osc('triangle', midi(base + 7), t + 0.14, 0.25, 0.28);
  }

  empty() { this._osc('square', 900, this.t, 0.05, 0.12, 500); }

  reload(kind) {
    if (!this.ctx) return;
    const t = this.t;
    this._noise(t, 0.05, 0.2, 'bandpass', 2500, 4);
    this._noise(t + (kind === 'rifle' ? 0.5 : 0.35), 0.06, 0.25, 'bandpass', 1800, 4);
  }

  hit(crit) {
    const t = this.t;
    this._osc('square', crit ? 1500 : 1000, t, 0.05, 0.18, crit ? 2200 : 1200);
  }

  zgroan(vol = 1, pitch = 1) {
    if (!this.ctx || this._groanCd > this.t) return;
    this._groanCd = this.t + 0.25;
    const t = this.t;
    const dur = 0.6 + Math.random() * 0.5;
    const base = (60 + Math.random() * 50) * pitch;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * (0.8 + Math.random() * 0.6), t + dur);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 4 + Math.random() * 4;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = base * 0.18;
    lfo.connect(lfoG).connect(o.frequency);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 320; f.Q.value = 1.6;
    const g = this.ctx.createGain();
    const v = 0.35 * Math.min(1, vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.15);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  }

  zdie(vol = 1) {
    const t = this.t;
    this._osc('sawtooth', 130, t, 0.45, 0.3 * Math.min(1, vol), 35);
    this._noise(t + 0.25, 0.15, 0.15 * Math.min(1, vol), 'lowpass', 500);
  }

  zattack(vol = 1) {
    this._noise(this.t, 0.12, 0.3 * Math.min(1, vol), 'bandpass', 1200, 2, 300);
  }

  hurt() {
    const t = this.t;
    this._osc('square', 220, t, 0.15, 0.3, 110);
    this._noise(t, 0.1, 0.2, 'lowpass', 800);
  }

  heal() {
    const t = this.t;
    [72, 76, 79].forEach((m, i) => this._osc('sine', midi(m), t + i * 0.07, 0.18, 0.18));
  }

  coin() {
    const t = this.t;
    this._osc('sine', 988, t, 0.07, 0.22);
    this._osc('sine', 1319, t + 0.07, 0.16, 0.22);
  }

  pickup() {
    const t = this.t;
    this._osc('triangle', 523, t, 0.08, 0.25, 660);
    this._osc('triangle', 784, t + 0.08, 0.12, 0.25);
  }

  mission() {
    const t = this.t;
    [60, 64, 67, 72].forEach((m, i) => this._osc('triangle', midi(m), t + i * 0.11, 0.3, 0.3));
    this._osc('triangle', midi(76), t + 0.44, 0.5, 0.3);
  }

  horde() {
    const t = this.t;
    this._osc('sawtooth', 80, t, 1.2, 0.4, 50);
    this._osc('sawtooth', 84, t, 1.2, 0.3, 52);
    this._noise(t, 1.0, 0.2, 'lowpass', 300);
  }

  bossRoar() {
    const t = this.t;
    this._osc('sawtooth', 70, t, 1.6, 0.55, 40);
    this._osc('sawtooth', 95, t + 0.1, 1.4, 0.4, 55);
    this._noise(t, 1.2, 0.35, 'lowpass', 400, 1, 100);
  }

  slam() {
    const t = this.t;
    this._osc('sine', 70, t, 0.5, 0.6, 28);
    this._noise(t, 0.4, 0.4, 'lowpass', 250);
  }

  chargeWarn() {
    const t = this.t;
    this._osc('sawtooth', 150, t, 0.5, 0.35, 300);
  }

  purchase() {
    const t = this.t;
    [76, 81].forEach((m, i) => this._osc('sine', midi(m), t + i * 0.08, 0.15, 0.25));
  }

  denied() { this._osc('square', 200, this.t, 0.2, 0.2, 140); }
  click() { this._osc('sine', 700, this.t, 0.05, 0.12); }
  door() { this._noise(this.t, 0.4, 0.3, 'lowpass', 400, 1, 150); }
  repairTick() { this._osc('square', 1200 + Math.random() * 600, this.t, 0.04, 0.08); }

  victory() {
    const t = this.t;
    const seq = [60, 64, 67, 72, 67, 72, 76, 79];
    seq.forEach((m, i) => {
      this._osc('triangle', midi(m), t + i * 0.16, 0.4, 0.3);
      this._osc('triangle', midi(m + 12), t + i * 0.16, 0.3, 0.12);
    });
    this._osc('triangle', midi(84), t + seq.length * 0.16, 1.2, 0.35);
  }

  defeat() {
    const t = this.t;
    [55, 51, 48].forEach((m, i) => this._osc('triangle', midi(m), t + i * 0.3, 0.5, 0.3));
  }

  // ---------- музика ----------
  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.bpm = mode === 'battle' ? 132 : mode === 'boss' ? 140 : 92;
  }

  _note(m, t0, dur, vol, type = 'triangle') {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = midi(m);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.musGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  _drum(kind, t0) {
    if (!this.ctx) return;
    if (kind === 'kick') {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.frequency.setValueAtTime(120, t0);
      o.frequency.exponentialRampToValueAtTime(40, t0 + 0.12);
      g.gain.setValueAtTime(0.5, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
      o.connect(g).connect(this.musGain);
      o.start(t0); o.stop(t0 + 0.2);
    } else {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuf; s.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 6000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.12, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.04);
      s.connect(f).connect(g).connect(this.musGain);
      s.start(t0); s.stop(t0 + 0.08);
    }
  }

  _schedule() {
    if (!this.ctx || !this.mode || this.muted) return;
    const step16 = (60 / this.bpm) / 4;
    if (this.nextT < this.ctx.currentTime) this.nextT = this.ctx.currentTime + 0.05;
    while (this.nextT < this.ctx.currentTime + 0.3) {
      this._playStep(this.musStep % 64, this.nextT);
      this.musStep++;
      this.nextT += step16;
    }
  }

  _playStep(s, t) {
    const mode = this.mode;
    const bar = Math.floor(s / 16); // 0..3
    const st = s % 16;
    if (mode === 'globe' || mode === 'calm') {
      // спокійна пригодницька тема — A-мінорна пентатоніка
      const bassLine = [45, 45, 41, 43]; // A2 A2 F2 G2
      if (st === 0) this._note(bassLine[bar], t, 1.6, 0.22, 'triangle');
      if (st === 8) this._note(bassLine[bar] + 7, t, 0.8, 0.12, 'triangle');
      const mel = [69, 0, 72, 0, 74, 0, 76, 0, 79, 0, 76, 0, 74, 0, 72, 0];
      const phr = [1, 0, 1, 1]; // у яких тактах грає мелодія
      if (phr[bar] && mel[st] && ((st + bar) % 3 !== 1)) {
        this._note(mel[st] - (bar === 2 ? 2 : 0), t, 0.35, 0.1, 'sine');
      }
      if (mode === 'calm' && st % 8 === 4) this._drum('hat', t);
    } else {
      // бойова тема — швидкий пульс
      const root = mode === 'boss' ? 43 : 45; // G2 для боса, A2 для бою
      if (st % 4 === 0) this._drum('kick', t);
      if (st % 4 === 2) this._drum('hat', t);
      if (st % 2 === 0) this._note(root + (st % 8 === 6 ? 3 : 0), t, 0.16, 0.2, 'sawtooth');
      const riff = [57, 0, 60, 57, 0, 62, 0, 60, 57, 0, 63, 62, 0, 60, 57, 0];
      if (riff[st] && bar % 2 === 1) {
        this._note(riff[st] + (mode === 'boss' ? -2 : 0), t, 0.2, 0.12, 'square');
      }
    }
  }
}
