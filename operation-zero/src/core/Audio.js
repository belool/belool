// ================================================================
// AUDIO — síntese procedural (WebAudio): disparos por arma, explosões,
// impactos por material, passos, chuva, trovões e vozes de rádio.
// Espacializado com PannerNode. Nenhum arquivo de áudio externo.
// ================================================================

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, sfx: 0.9, ambient: 0.6, voice: 0.8 };
    this.voiceTTS = true;
    this.ends = [];       // instantes de término das vozes ativas
    this.maxVoices = 40;
    this.perFrame = 8;    // orçamento de novos sons por quadro
    this.frameCount = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 6;
    this.comp.connect(this.master);
    this.sfx = c.createGain(); this.sfx.connect(this.comp);
    this.amb = c.createGain(); this.amb.connect(this.master);
    this.applyVolumes();
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Fundo: chuva e vento (loops de ruído filtrado)
    this.rain = this._loop('bandpass', 2400, 0.6);
    this.wind = this._loop('lowpass', 380, 1);
  }
  beginFrame() { this.frameCount = 0; }
  // Controle de polifonia: não cria nós se o contexto não estiver tocando,
  // se o orçamento do quadro acabou ou se já há vozes demais.
  _admit(dur, pos, maxDist = 220) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return false;
    if (this.frameCount >= this.perFrame) return false;
    if (pos && this.far(pos) > maxDist) return false;
    const now = c.currentTime;
    if (this.ends.length > this.maxVoices) this.ends = this.ends.filter((t) => t > now);
    if (this.ends.length >= this.maxVoices) return false;
    this.ends.push(now + dur);
    this.frameCount++;
    return true;
  }
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.sfx.gain.value = this.vol.sfx;
    this.amb.gain.value = this.vol.ambient;
  }
  _loop(type, freq, q) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.amb); src.start();
    return g;
  }
  setWeather(rain, wind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rain.gain.setTargetAtTime(rain * 0.35, t, 0.5);
    this.wind.gain.setTargetAtTime(wind * 0.25, t, 0.5);
  }
  setListener(pos, fwd) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
    this.listenerPos = pos;
  }
  _out(pos, gain = 1) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = gain;
    if (pos && !(isFinite(pos.x) && isFinite(pos.y) && isFinite(pos.z))) pos = null;
    if (pos) {
      const p = c.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
      p.refDistance = 4; p.rolloffFactor = 1.1; p.maxDistance = 400;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
      else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p); p.connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }
  _noiseBurst(out, t, dur, type, freq, q, gain, decay) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * 1.5); src.stop(t + dur);
  }
  _tone(out, t, f0, f1, dur, gain, type = 'sine') {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  far(pos) {
    if (!pos || !this.listenerPos) return 0;
    return Math.hypot(pos.x - this.listenerPos.x, pos.y - this.listenerPos.y, pos.z - this.listenerPos.z);
  }

  shot(snd, pos, suppressed = false) {
    if (!this._admit(0.6, pos, suppressed ? 60 : 300)) return;
    const t = this.ctx.currentTime;
    const dist = this.far(pos);
    const out = this._out(pos, 1);
    const k = suppressed ? 0.25 : 1;
    const lp = dist > 60 ? 900 : 8000;
    if (suppressed) {
      this._noiseBurst(out, t, 0.12, 'bandpass', 1800, 1.2, 0.5 * snd.gain, 0.08);
    } else {
      this._noiseBurst(out, t, snd.decay + 0.05, 'lowpass', lp, 0.7, snd.gain * snd.noise, snd.decay);
      this._noiseBurst(out, t, 0.04, 'highpass', 3000, 0.7, snd.gain * 0.5, 0.03);
    }
    this._tone(out, t, snd.freq * 0.25, 40, snd.decay * 1.2, snd.gain * 0.8 * k, 'triangle');
    if (dist > 25 && !suppressed) this._noiseBurst(out, t + 0.08, snd.decay * 3, 'lowpass', 500, 0.5, snd.gain * 0.25, snd.decay * 3); // eco
  }
  play(name, pos, vol = 1) {
    if (!this._admit(name === 'explosion' || name === 'thunder' ? 3 : 0.4, pos, name === 'explosion' || name === 'thunder' ? 600 : 90)) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, vol);
    switch (name) {
      case 'explosion':
        this._noiseBurst(out, t, 2.2, 'lowpass', 600, 0.6, 1.6, 2.0);
        this._noiseBurst(out, t, 0.3, 'lowpass', 3000, 0.5, 1.0, 0.25);
        this._tone(out, t, 90, 25, 1.2, 1.4, 'sine');
        break;
      case 'impact_hard': this._noiseBurst(out, t, 0.08, 'bandpass', 2500, 2, 0.4, 0.06); break;
      case 'impact_metal': this._tone(out, t, 2400 + Math.random() * 1200, 1800, 0.15, 0.25, 'square'); this._noiseBurst(out, t, 0.05, 'highpass', 4000, 1, 0.3, 0.04); break;
      case 'impact_wood': this._noiseBurst(out, t, 0.1, 'bandpass', 900, 3, 0.45, 0.08); break;
      case 'impact_soft': this._noiseBurst(out, t, 0.08, 'lowpass', 700, 1, 0.4, 0.07); break;
      case 'impact_glass': case 'glass':
        for (let i = 0; i < 5; i++) this._tone(out, t + i * 0.02, 3000 + Math.random() * 3000, 2500, 0.2, 0.12, 'sine');
        this._noiseBurst(out, t, 0.25, 'highpass', 5000, 1, 0.4, 0.2);
        break;
      case 'impact_flesh': this._noiseBurst(out, t, 0.08, 'lowpass', 500, 1, 0.7, 0.07); break;
      case 'break': this._noiseBurst(out, t, 0.6, 'lowpass', 1200, 0.8, 0.9, 0.5); this._tone(out, t, 120, 50, 0.4, 0.5, 'triangle'); break;
      case 'step': this._noiseBurst(out, t, 0.06, 'lowpass', 500 + Math.random() * 300, 1, 0.28, 0.05); break;
      case 'land': this._noiseBurst(out, t, 0.12, 'lowpass', 400, 1, 0.5, 0.1); break;
      case 'reload': this._tone(out, t, 1200, 900, 0.04, 0.3, 'square'); this._tone(out, t + 0.25, 800, 600, 0.05, 0.35, 'square'); break;
      case 'reload_end': this._tone(out, t, 1500, 1000, 0.05, 0.35, 'square'); break;
      case 'bolt': this._tone(out, t, 700, 500, 0.06, 0.3, 'square'); this._tone(out, t + 0.18, 900, 700, 0.06, 0.3, 'square'); break;
      case 'empty': this._tone(out, t, 2000, 1500, 0.03, 0.25, 'square'); break;
      case 'hit': this._tone(out, t, 1800, 1600, 0.05, 0.25, 'square'); break;
      case 'headshot': this._tone(out, t, 2600, 2200, 0.08, 0.3, 'square'); this._tone(out, t + 0.05, 1300, 1000, 0.1, 0.3, 'sine'); break;
      case 'kill': this._tone(out, t, 900, 1400, 0.12, 0.3, 'triangle'); break;
      case 'hurt': this._noiseBurst(out, t, 0.2, 'lowpass', 300, 1, 0.8, 0.18); break;
      case 'bounce': this._tone(out, t, 600, 300, 0.06, 0.3, 'triangle'); break;
      case 'pin': this._tone(out, t, 3000, 2800, 0.05, 0.2, 'square'); break;
      case 'flashbang':
        this._noiseBurst(out, t, 0.4, 'highpass', 2000, 0.5, 1.4, 0.3);
        break;
      case 'ring': this._tone(out, t, 3800, 3700, 3.0, 0.15, 'sine'); break;
      case 'thunder': this._noiseBurst(out, t, 4, 'lowpass', 200 + Math.random() * 150, 0.5, 1.6, 3.5); break;
      case 'ui': this._tone(out, t, 900, 1100, 0.05, 0.15, 'sine'); break;
      case 'radio': this._noiseBurst(out, t, 0.12, 'bandpass', 2000, 3, 0.25, 0.1); this._tone(out, t, 1400, 1400, 0.06, 0.08, 'square'); break;
      case 'capture': this._tone(out, t, 600, 900, 0.25, 0.3, 'triangle'); this._tone(out, t + 0.15, 900, 1300, 0.3, 0.3, 'triangle'); break;
      case 'wave': this._tone(out, t, 200, 150, 1.0, 0.5, 'sawtooth'); this._tone(out, t + 0.4, 220, 160, 1.0, 0.5, 'sawtooth'); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this._tone(out, t + i * 0.1, f, f, 0.25, 0.25, 'triangle')); break;
      case 'melee': this._noiseBurst(out, t, 0.12, 'bandpass', 1500, 1, 0.5, 0.1); break;
      case 'zone': this._tone(out, t, 300, 280, 0.6, 0.2, 'sawtooth'); break;
      case 'slide': this._noiseBurst(out, t, 0.6, 'bandpass', 900, 0.8, 0.35, 0.55); break;
      case 'whistle': this._tone(out, t, 1600, 500, 1.4, 0.18, 'sine'); break;
      case 'uav': [700, 900, 700, 900].forEach((f, i) => this._tone(out, t + i * 0.12, f, f, 0.1, 0.18, 'square')); break;
      case 'breath': this._noiseBurst(out, t, 0.5, 'lowpass', 600, 0.6, 0.25, 0.45); break;
      case 'engine': this._tone(out, t, 80, 60, 0.3, 0.2, 'sawtooth'); break;
      default: break;
    }
  }
  impact(mat, pos) {
    const map = { concrete: 'hard', brick: 'hard', rock: 'hard', metal: 'metal', sheetmetal: 'metal', wood: 'wood', glass: 'glass', sandbag: 'soft', dirt: 'soft', foliage: 'soft' };
    this.play('impact_' + (map[mat] || 'hard'), pos, 0.6);
  }
  say(text, voice = 0) {
    if (!this.voiceTTS || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'pt-BR'; u.rate = 1.12; u.pitch = 0.8 + voice * 0.15; u.volume = this.vol.voice * this.vol.master;
      window.speechSynthesis.speak(u);
    } catch (e) { /* sem TTS */ }
  }
  stopVoices() { try { window.speechSynthesis?.cancel(); } catch (e) { /* */ } }
}
