// Meridian Run — synthesised sound.
// One clear job: every sound is made with WebAudio oscillators and filtered
// noise. No audio files, no network. Silent until the player first interacts.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.windGain = null;
    this.windFilter = null;
    this.started = false;
  }

  // Call from a user gesture (or a shot render, guarded). Never throws.
  ensure() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.started = true;
      this.buildLoops();
    } catch {
      this.ctx = null;
    }
  }

  buildLoops() {
    const ctx = this.ctx;
    // Engine: a sawtooth pair through a low-pass, pitch follows the throttle.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 62;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 31;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(osc2Gain);
    osc2Gain.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(ctx.destination);
    this.engineOsc.start();
    this.engineOsc2.start();

    // Wind: looped noise through a band-pass, louder and brighter with speed.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(ctx.destination);
    noise.start();
  }

  // Called every frame while flying: engine hum and wind follow the plane.
  update(throttle, speed, flying) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const engineLevel = flying ? 0.05 + throttle * 0.075 : 0.0;
    this.engineGain.gain.setTargetAtTime(engineLevel, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(52 + throttle * 88 + speed * 0.4, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(26 + throttle * 44 + speed * 0.2, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.15);
    const windLevel = flying ? Math.min(0.12, (speed / 62) * 0.12) : 0;
    this.windGain.gain.setTargetAtTime(windLevel, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(400 + speed * 22, t, 0.2);
  }

  blip(freq, dur, type = 'sine', level = 0.16) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(level, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  // Ring chime: a rising three-note arpeggio.
  chime() {
    if (!this.ctx || this.muted) return;
    [660, 880, 1320].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.35, 'sine', 0.18), i * 70);
    });
  }

  // Touchdown thud: a low sine drop plus a short noise burst.
  thud() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }

  // Crash: a burst of filtered noise and a low boom.
  crash() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 0.7;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
    this.blip(70, 0.6, 'sine', 0.4);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) {
      const level = this.muted ? 0 : 1;
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(level * 0.1, this.ctx.currentTime, 0.05);
      if (this.windGain) this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }
}
