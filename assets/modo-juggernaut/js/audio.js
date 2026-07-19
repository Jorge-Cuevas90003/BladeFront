// La Partitura del Vacío — música y SFX 100% procedurales (Web Audio API,
// cero archivos). Estética: ostinato épico en re menor con taikos, drone
// del abismo, y el BRAAAM de metales al nacer el Juggernaut.
//
// VoidScore:
//   ensure()        crear/reanudar el contexto (llamar en el primer gesto)
//   update()        programar el secuenciador (llamar cada frame)
//   setIntensity(x) 0 = calma (estandarte libre) · 1 = caza (jefe activo)
//   braam(), slamImpact(), riser(), whoosh(), clang(), arpUp(), fallCry(),
//   victory(), toggleMute()

const D = {
  D2: 73.42, F2: 87.31, A2: 110.0, C3: 130.81,
  D3: 146.83, F3: 174.61, A3: 220.0, C4: 261.63,
  D4: 293.66, Fs3: 185.0,
};
// Ostinato: D-D-F-D-C-D-A-C (re menor, corcheas)
const OSTINATO = [D.D3, D.D3, D.F3, D.D3, D.C3, D.D3, D.A2, D.C3];
const BPM = 104;

export class VoidScore {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.intensity = 0;
    this._step = 0;
    this._nextNote = 0;
    this._victoryPlayed = false;
  }

  ensure() {
    if (!this.ctx) this._build();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _build() {
    const ctx = new AudioContext();
    this.ctx = ctx;

    // Máster: compresor de mezcla → salida
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 6;
    this.comp.connect(ctx.destination);

    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(this.comp);

    this.music = ctx.createGain();
    this.music.gain.value = 0.5;
    this.music.connect(this.bus);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.bus);

    // Ruido blanco compartido (percusión, risers, whooshes)
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Waveshaper de saturación suave (para el BRAAAM)
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    this.shaper.curve = curve;
    this.shaperOut = ctx.createGain();
    this.shaperOut.gain.value = 0.5;
    this.shaper.connect(this.shaperOut);
    this.shaperOut.connect(this.sfx);

    // Drone del abismo: dos sierras graves desafinadas + filtro respirando
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 160;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.1;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.music);
    for (const det of [-6, 5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = D.D2 / 2; // D1
      o.detune.value = det;
      o.connect(this.droneFilter);
      o.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoAmp = ctx.createGain();
    lfoAmp.gain.value = 70;
    lfo.connect(lfoAmp);
    lfoAmp.connect(this.droneFilter.frequency);
    lfo.start();

    this._nextNote = ctx.currentTime + 0.1;
  }

  // ---------- utilidades ----------
  _env(t, a, peak, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  _noise(t, dur, filterType, f0, f1, peak, dest) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this._env(t, Math.min(0.02, dur * 0.2), peak, dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfx);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // ---------- secuenciador (lookahead) ----------
  update() {
    if (!this.ctx || this.muted) return;
    const stepDur = 60 / BPM / 2; // corcheas
    const now = this.ctx.currentTime;
    // guardia anti-avalancha: si el reloj nos dejó atrás (pestaña
    // suspendida), saltamos al presente en vez de rellenar lo perdido
    if (this._nextNote < now - stepDur) {
      const missed = Math.ceil((now - this._nextNote) / stepDur);
      this._step += missed;
      this._nextNote += missed * stepDur;
    }
    while (this._nextNote < now + 0.15) {
      this._schedule(this._nextNote, stepDur);
      this._nextNote += stepDur;
    }
  }

  _schedule(t, stepDur) {
    const i = this.intensity;
    const n = OSTINATO[this._step % 8];

    // pizzicato de cuerda oscura (siempre; más brillante con la caza)
    this._pluck(n, t, 0.16 + i * 0.14, 1.5 + i * 2.2);
    // octava doblada + empuje rítmico cuando el jefe está activo
    if (i > 0.5) {
      this._pluck(n * 2, t, 0.07, 4);
      if (this._step % 4 === 0) this._taiko(t, 0.7);
      if (this._step % 8 === 6) this._taiko(t + stepDur / 2, 0.35); // síncopa
    } else if (this._step % 8 === 0) {
      this._taiko(t, 0.28); // pulso lejano en la calma
    }
    this._step++;
  }

  _pluck(freq, t, vel, brightness) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq * brightness;
    f.Q.value = 2.5;
    const g = this._env(t, 0.008, vel, 0.22);
    o.connect(f); f.connect(g); g.connect(this.music);
    o.start(t); o.stop(t + 0.3);
  }

  _taiko(t, vel) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.22);
    const g = this._env(t, 0.005, vel, 0.32);
    o.connect(g); g.connect(this.music);
    o.start(t); o.stop(t + 0.4);
    this._noise(t, 0.12, 'lowpass', 420, 200, vel * 0.4, this.music);
  }

  // ---------- stingers ----------
  braam() { // el nacimiento del Juggernaut: metales apilados + sub
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const base of [D.D2, D.A2, D.D3]) {
      for (const det of [-9, 8]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = base;
        o.detune.value = det;
        const g = this._env(t, 0.14, 0.16, 2.6);
        o.connect(g); g.connect(this.shaper);
        o.start(t); o.stop(t + 2.8);
      }
    }
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(55, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 1.8);
    const sg = this._env(t, 0.05, 0.5, 2.2);
    sub.connect(sg); sg.connect(this.sfx);
    sub.start(t); sub.stop(t + 2.4);
  }

  riser(dur = 0.75) { // carga del slam
    if (!this.ctx) return;
    this._noise(this.ctx.currentTime, dur, 'bandpass', 300, 3400, 0.3);
  }

  slamImpact() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._taiko(t, 1.0);
    this._taiko(t + 0.03, 0.8);
    this._noise(t, 1.1, 'highpass', 900, 300, 0.35);
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(70, t);
    sub.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    const g = this._env(t, 0.01, 0.6, 0.9);
    sub.connect(g); g.connect(this.sfx);
    sub.start(t); sub.stop(t + 1);
  }

  whoosh() { // placaje
    if (!this.ctx) return;
    this._noise(this.ctx.currentTime, 0.28, 'bandpass', 1100, 260, 0.22);
  }

  clang() { // el estandarte cae: campana metálica inarmónica (FM)
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const car = this.ctx.createOscillator();
    car.frequency.value = 620;
    const mod = this.ctx.createOscillator();
    mod.frequency.value = 1137; // ratio inarmónico → metal
    const idx = this.ctx.createGain();
    idx.gain.setValueAtTime(900, t);
    idx.gain.exponentialRampToValueAtTime(8, t + 0.5);
    mod.connect(idx); idx.connect(car.frequency);
    const g = this._env(t, 0.004, 0.3, 0.7);
    car.connect(g); g.connect(this.sfx);
    car.start(t); mod.start(t);
    car.stop(t + 0.8); mod.stop(t + 0.8);
  }

  arpUp() { // captura del estandarte
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [D.D3, D.F3, D.A3, D.D4].forEach((f, i) => {
      this._pluck(f, t + i * 0.07, 0.2, 3);
    });
  }

  fallCry() { // ring-out: caída al abismo
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.8);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = this._env(t, 0.02, 0.12, 0.85);
    o.connect(f); f.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + 1);
  }

  victory() { // resolución a re MAYOR: la única luz de toda la partitura
    if (!this.ctx || this._victoryPlayed) return;
    this._victoryPlayed = true;
    const t = this.ctx.currentTime;
    [D.D3, D.Fs3, D.A3, D.D4].forEach((f) => {
      for (const det of [-5, 4]) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = det;
        const g = this._env(t, 0.3, 0.12, 4);
        o.connect(g); g.connect(this.music);
        o.start(t); o.stop(t + 4.2);
      }
    });
    this._taiko(t, 0.9);
    this._taiko(t + 0.4, 0.6);
    this._taiko(t + 0.8, 0.9);
  }

  setIntensity(x) {
    if (!this.ctx || Math.abs(x - this.intensity) < 0.01) return;
    this.intensity = x;
    const t = this.ctx.currentTime;
    // el drone se abre con la caza
    this.droneFilter.frequency.cancelScheduledValues(t);
    this.droneFilter.frequency.linearRampToValueAtTime(160 + x * 260, t + 1.5);
    this.droneGain.gain.linearRampToValueAtTime(0.1 + x * 0.06, t + 1.5);
  }

  toggleMute() {
    if (!this.ctx) return false;
    this.muted = !this.muted;
    this.bus.gain.linearRampToValueAtTime(
      this.muted ? 0.0001 : 0.9, this.ctx.currentTime + 0.15
    );
    return this.muted;
  }
}
