// Procedural, positional audio built on WebAudio. No asset files needed.
const SHOT = {
  glock: { freq: 1400, q: 0.8, len: 0.16, gain: 0.55, thump: 140 },
  mp5: { freq: 900, q: 0.6, len: 0.1, gain: 0.3, thump: 110 },
  nova: { freq: 600, q: 0.5, len: 0.42, gain: 0.95, thump: 70 },
  ak47: { freq: 800, q: 0.7, len: 0.24, gain: 0.8, thump: 85 },
  m4a4: { freq: 1100, q: 0.7, len: 0.2, gain: 0.65, thump: 100 },
  awp: { freq: 500, q: 0.5, len: 0.7, gain: 1.1, thump: 55 },
  rpg: { freq: 350, q: 0.4, len: 0.5, gain: 0.9, thump: 50 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(pos, forward) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
      l.forwardX.value = forward.x; l.forwardY.value = forward.y; l.forwardZ.value = forward.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  out(pos) {
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 3;
    p.rolloffFactor = 1.1;
    p.maxDistance = 120;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    return p;
  }

  burst({ freq, q = 1, len, gain, type = 'bandpass', dest, sweep = 0, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + len);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + len);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5, len + 0.05);
  }

  tone({ freq, len, gain, type = 'sine', dest, to = 0.5, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * to), t + len);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + len);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + len + 0.05);
  }

  shot(type, pos) {
    if (!this.ensure()) return;
    const s = SHOT[type];
    const dest = this.out(pos);
    if (!s) { this.knife(pos); return; }
    this.burst({ freq: s.freq * 2.5, q: 0.4, len: 0.03, gain: s.gain * 0.9, type: 'highpass', dest });
    this.burst({ freq: s.freq, q: s.q, len: s.len, gain: s.gain, dest, sweep: 0.35 });
    this.tone({ freq: s.thump, len: s.len * 0.8, gain: s.gain * 0.9, dest, to: 0.4 });
    if (type === 'awp' || type === 'nova') this.burst({ freq: 300, q: 0.3, len: s.len * 1.5, gain: s.gain * 0.35, type: 'lowpass', dest, delay: 0.05 });
    if (type === 'mp5') this.burst({ freq: 3000, q: 1, len: 0.04, gain: 0.08, type: 'highpass', dest });
  }

  knife(pos) {
    if (!this.ensure()) return;
    this.burst({ freq: 2400, q: 1.5, len: 0.16, gain: 0.25, dest: this.out(pos), sweep: 0.4 });
  }

  explosion(pos) {
    if (!this.ensure()) return;
    const dest = this.out(pos);
    this.burst({ freq: 1200, q: 0.3, len: 1.6, gain: 1.4, type: 'lowpass', dest, sweep: 0.08 });
    this.tone({ freq: 70, len: 1.1, gain: 1.2, dest, to: 0.3 });
  }

  click() {
    if (!this.ensure()) return;
    this.burst({ freq: 3500, q: 3, len: 0.03, gain: 0.3, type: 'bandpass', dest: this.master });
  }

  reload(type) {
    if (!this.ensure()) return;
    const d = this.master;
    this.burst({ freq: 2200, q: 4, len: 0.05, gain: 0.35, dest: d, delay: 0.1 });
    this.burst({ freq: 1600, q: 4, len: 0.06, gain: 0.4, dest: d, delay: type === 'awp' ? 1.2 : 0.8 });
    this.burst({ freq: 2800, q: 5, len: 0.05, gain: 0.45, dest: d, delay: type === 'awp' ? 2.4 : 1.4 });
  }

  step(pos, surface = 'carpet') {
    if (!this.ensure()) return;
    const hard = surface === 'hard';
    this.burst({ freq: hard ? 900 : 380, q: 0.9, len: hard ? 0.09 : 0.12, gain: hard ? 0.22 : 0.16, dest: this.out(pos) });
  }

  land(pos) {
    if (!this.ensure()) return;
    this.burst({ freq: 260, q: 0.7, len: 0.16, gain: 0.35, dest: this.out(pos) });
  }

  hit(head) {
    if (!this.ensure()) return;
    if (head) {
      this.tone({ freq: 1900, len: 0.35, gain: 0.25, dest: this.master, to: 0.95 });
      this.tone({ freq: 2850, len: 0.25, gain: 0.12, dest: this.master, to: 0.95 });
    } else this.burst({ freq: 1800, q: 6, len: 0.05, gain: 0.35, dest: this.master });
  }

  hurt() {
    if (!this.ensure()) return;
    this.burst({ freq: 300, q: 0.8, len: 0.18, gain: 0.5, dest: this.master, sweep: 0.5 });
  }

  impact(pos, heavy) {
    if (!this.ensure()) return;
    const dest = this.out(pos);
    this.burst({ freq: heavy ? 220 : 700, q: 1, len: heavy ? 0.3 : 0.12, gain: heavy ? 0.7 : 0.35, dest });
    if (heavy) this.tone({ freq: 90, len: 0.25, gain: 0.5, dest, to: 0.5 });
  }

  whoosh(pos) {
    if (!this.ensure()) return;
    this.burst({ freq: 500, q: 0.8, len: 0.35, gain: 0.3, dest: this.out(pos), sweep: 3 });
  }

  bulletImpact(pos) {
    if (!this.ensure()) return;
    this.burst({ freq: 2500 + Math.random() * 1500, q: 2, len: 0.05, gain: 0.12, dest: this.out(pos) });
  }

  vape(pos) {
    if (!this.ensure()) return;
    this.burst({ freq: 5000, q: 0.5, len: 1.1, gain: 0.18, type: 'highpass', dest: this.out(pos) });
  }

  denied() {
    if (!this.ensure()) return;
    this.tone({ freq: 220, len: 0.18, gain: 0.35, type: 'square', dest: this.master, to: 0.9 });
    this.tone({ freq: 165, len: 0.3, gain: 0.35, type: 'square', dest: this.master, to: 0.9, delay: 0.18 });
  }

  ui() {
    if (!this.ensure()) return;
    this.tone({ freq: 900, len: 0.06, gain: 0.12, dest: this.master, to: 1.2 });
  }
}

export const audio = new Audio();
