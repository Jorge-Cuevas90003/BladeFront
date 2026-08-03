// ============================================================================
//  La Partitura del Vacío — música y SFX 100 % procedurales (Web Audio API,
//  cero archivos de audio).
//
//  ── Qué se buscaba y qué faltaba ──
//
//  La versión anterior tenía las notas correctas —ostinato en re menor, taikos,
//  BRAAAM de metales— pero sonaba pequeña, como un chiptune sofisticado. Lo que
//  la separaba de una banda sonora de cine no era la armonía, era el ESPACIO y
//  las CAPAS:
//
//   1. NO HABÍA REVERBERACIÓN. Ninguna. Cada nota nacía y moría en seco, y eso
//      es lo primero que delata a un sintetizador: la música de orquesta suena
//      grande porque suena en una SALA grande. Ahora hay una convolución con
//      impulso generado a mano (ruido con caída exponencial) y un pre-retardo,
//      que es lo que da la sensación de estar a treinta metros de la orquesta.
//
//   2. LA ARMONÍA NO SE MOVÍA. Un solo acorde de re menor durante toda la
//      partida. Ahora hay una progresión de cuatro acordes (i–VI–III–VII, la
//      del cine épico) mientras el ostinato se queda CLAVADO encima: ese
//      choque entre algo que no se mueve y algo que sí es medio truco de
//      Zimmer, y es lo que hace que un bucle de ocho notas no canse.
//
//   3. ERA UNA SOLA VOZ POR REGISTRO. Ahora cada golpe es un montón de cosas a
//      la vez: cuerdas graves con ataque de arco, octava aguda doblando,
//      metales apilados en quintas abiertas, sub que se siente más que se oye,
//      y percusión en tres alturas. Es exactamente lo que hace una orquesta y
//      lo que un solo oscilador no puede fingir.
//
//   4. LA INTENSIDAD SOLO SUBÍA EL VOLUMEN. Ahora ORQUESTA: en calma quedan el
//      drone y el coro; con la caza entran metales, contratiempos, trémolo
//      agudo y la percusión completa. Instrumentos que entran y salen, no un
//      mando de volumen.
//
//  ── API pública (sin cambios) ──
//   ensure()        crear/reanudar el contexto (llamar en el primer gesto)
//   update()        programar el secuenciador (llamar cada frame)
//   setIntensity(x) 0 = calma (estandarte libre) · 1 = caza (jefe activo)
//   braam(), slamImpact(), riser(), whoosh(), clang(), arpUp(), fallCry(),
//   victory(), toggleMute()
// ============================================================================

// Frecuencias (Hz). Re menor: la tonalidad clásica del cine épico — bastante
// grave para que el sub se sienta en el pecho, y con las cuerdas al aire de un
// violonchelo cerca, que es donde la madera resuena de verdad.
const N = {
  Bb0: 29.14, C1: 32.70, D1: 36.71, F1: 43.65, G1: 49.00,
  Bb1: 58.27, C2: 65.41, D2: 73.42, F2: 87.31, G2: 98.00, A2: 110.00,
  Bb2: 116.54, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61,
  G3: 196.00, A3: 220.00, Bb3: 233.08, C4: 261.63, D4: 293.66,
  E4: 329.63, F4: 349.23, A4: 440.00, D5: 587.33,
  A1: 55.00, // raíz grave del la menor (v de la progresión B)
  Fs3: 185.00, Fs4: 370.00, // solo para la resolución a RE MAYOR de la victoria
};

// El ostinato NO se transporta con los acordes: se queda fijo mientras la
// armonía se mueve debajo. Esa fricción es la que sostiene el bucle.
//
// Pero UNA sola célula repitiéndose para siempre cansa, por muchas capas que
// tenga encima: el oído la memoriza en veinte segundos y a partir de ahí solo
// oye la repetición. Hay cuatro y rotan por frase, así que el bucle real pasa
// de 8 notas a 32 antes de volver al principio.
const OSTINATOS = [
  [N.D3, N.D3, N.F3, N.D3, N.C3, N.D3, N.A2, N.C3], // la original: insistente
  [N.D3, N.F3, N.A3, N.F3, N.D3, N.C3, N.D3, N.A2], // abre hacia arriba
  [N.A2, N.D3, N.F3, N.D3, N.A2, N.C3, N.E3, N.C3], // más grave, más ancha
  [N.D3, N.D3, N.C3, N.D3, N.F3, N.E3, N.D3, N.C3], // desciende: cierra la vuelta
];

// ── La melodía ─────────────────────────────────────────────────────────────
// Esto era LO QUE FALTABA. La partitura tenía ostinato, pads, percusión y
// metales, pero ninguna línea que durase más de un compás: todo lo que el oído
// podía seguir era un bucle corto, y por eso sonaba repetitiva por muchos
// instrumentos que hubiera encima. Una melodía de ocho compases da algo LARGO
// a lo que agarrarse, y de paso convierte los cuatro acordes en una frase con
// principio y final en vez de un ciclo sin forma.
//
// Forma de lamento descendente sobre la progresión: reposa en notas del acorde
// y usa las de paso para tirar hacia la siguiente. El si bemol del quinto
// compás cae sobre un fa mayor —es una suspensión, roza— y se resuelve al la:
// ese pequeño roce es lo que hace que la frase parezca ir a alguna parte.
//   p = paso dentro de la frase (0-63) · d = duración en corcheas
const MELODIA = [
  { p: 0,  n: N.A3,  d: 7 },
  { p: 8,  n: N.G3,  d: 3 },
  { p: 12, n: N.A3,  d: 3 },
  { p: 16, n: N.F3,  d: 11 },
  { p: 28, n: N.G3,  d: 3 },
  { p: 32, n: N.Bb3, d: 7 },   // la suspensión
  { p: 40, n: N.A3,  d: 7 },   // ...y su resolución
  { p: 48, n: N.G3,  d: 3 },
  { p: 52, n: N.F3,  d: 3 },
  { p: 56, n: N.E3,  d: 7 },
];

const PASOS_POR_FRASE = 64;  // ocho compases: la unidad musical de verdad

// i – VI – III – VII en re menor. Dos compases cada uno (16 corcheas).
const PROGRESION = [
  { nombre: 'Dm', sub: N.D1,  bajo: N.D2,  coro: [N.D3, N.F3, N.A3] },
  { nombre: 'Bb', sub: N.Bb0, bajo: N.Bb1, coro: [N.D3, N.F3, N.Bb3] },
  { nombre: 'F',  sub: N.F1,  bajo: N.F2,  coro: [N.C3, N.F3, N.A3] },
  { nombre: 'C',  sub: N.C1,  bajo: N.C2,  coro: [N.C3, N.E3, N.G3] },
];

// Segunda progresión: i – iv – VII – v. Diatónica de la misma tonalidad, pero
// con acordes que la primera nunca toca (sol y la menor), así que cuando entra
// se siente un giro real, no solo una repetición con otro timbre encima. Sin
// esto, por muchas capas y melodía que tuviera, la armonía era un único bucle
// de 4 acordes sonando para siempre: el oído lo aprende en veinte segundos y
// ya no suelta esa sensación de "está sonando lo mismo".
const PROGRESION_B = [
  { nombre: 'Dm', sub: N.D1, bajo: N.D2, coro: [N.D3, N.F3, N.A3] },
  { nombre: 'Gm', sub: N.G1, bajo: N.G2, coro: [N.G3, N.Bb3, N.D4] },
  { nombre: 'C',  sub: N.C1, bajo: N.C2, coro: [N.C3, N.E3, N.G3] },
  { nombre: 'Am', sub: N.A1, bajo: N.A2, coro: [N.A3, N.C4, N.E4] },
];

const BPM = 96;              // algo más lento que antes: pesa más
const PASOS_POR_ACORDE = 16; // dos compases de 4/4 en corcheas

export class VoidScore {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.intensity = 0;
    this._step = 0;
    this._nextNote = 0;
    this._victoryPlayed = false;
    this._acordeActual = -1;
    this._acordeObj = PROGRESION[0];
  }

  ensure() {
    if (!this.ctx) this._build();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ---------------------------------------------------------------------------
  //  Grafo de audio
  //
  //    fuentes ──┬─ seco ─────────────────────────┐
  //              └─ envío ─► pre-retardo ─► sala ─┴─► compresor ─► salida
  //
  //  Cada voz decide cuánta sala quiere: la percusión poca (si no, se
  //  emborrona el pulso), el coro y los metales mucha (es lo que los hace
  //  sonar lejos y enormes).
  // ---------------------------------------------------------------------------
  _build() {
    const ctx = new AudioContext();
    this.ctx = ctx;

    // Compresor de mezcla: con tantas capas a la vez, sin esto los picos
    // recortan y suena a distorsión sucia en vez de a fuerza.
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.22;
    this.comp.connect(ctx.destination);

    this.bus = ctx.createGain();
    this.bus.gain.value = 0.82;
    this.bus.connect(this.comp);

    // ── La sala ──
    this.sala = ctx.createConvolver();
    this.sala.buffer = this._hacerImpulso(3.4, 2.3);
    this.salaRetorno = ctx.createGain();
    this.salaRetorno.gain.value = 0.9;
    // Pre-retardo: el hueco entre el sonido directo y la primera reflexión es
    // lo que el oído lee como "tamaño". Sin él la reverb se pega al ataque y
    // suena a lata, no a catedral.
    this.preRetardo = ctx.createDelay(0.2);
    this.preRetardo.delayTime.value = 0.028;
    // Recortar los graves ANTES de la sala: reverberar el sub solo produce
    // barro que se come el pulso de la percusión.
    this.salaFiltro = ctx.createBiquadFilter();
    this.salaFiltro.type = 'highpass';
    this.salaFiltro.frequency.value = 180;
    this.preRetardo.connect(this.salaFiltro);
    this.salaFiltro.connect(this.sala);
    this.sala.connect(this.salaRetorno);
    this.salaRetorno.connect(this.bus);

    this.music = ctx.createGain();
    this.music.gain.value = 0.62;
    this.music.connect(this.bus);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.bus);

    // Ruido blanco compartido (percusión, risers, whooshes)
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Saturación suave: es lo que convierte unas sierras apiladas en algo con
    // cuerpo de metal. Sin ella los BRAAAM suenan a zumbido.
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 512) - 1;
      curve[i] = Math.tanh(x * 2.6);
    }
    this.shaper.curve = curve;
    this.shaper.oversample = '2x';
    this.shaperOut = ctx.createGain();
    this.shaperOut.gain.value = 0.42;
    this.shaper.connect(this.shaperOut);
    this.shaperOut.connect(this.sfx);
    this._enviar(this.shaperOut, 0.5);

    this._construirDrone();
    this._construirCoro();

    this._nextNote = ctx.currentTime + 0.12;
  }

  // Impulso de sala: ruido que se apaga exponencialmente. Es la receta mínima
  // de una reverb de convolución, y con estéreo descorrelacionado (cada canal
  // con su propio ruido) la cola se abre a los lados sola.
  _hacerImpulso(segundos, caida) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * segundos);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const x = i / n;
        // El arranque suave evita el "clic" de una reflexión instantánea.
        const entrada = Math.min(1, i / (ctx.sampleRate * 0.006));
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, caida) * entrada;
      }
    }
    return buf;
  }

  // Envía una señal a la sala sin quitarla de la salida directa.
  _enviar(nodo, cantidad) {
    const g = this.ctx.createGain();
    g.gain.value = cantidad;
    nodo.connect(g);
    g.connect(this.preRetardo);
    return g;
  }

  // ── Drone del abismo: quintas abiertas, sin tercera ──
  // Sin tercera el acorde no es ni mayor ni menor: no dice si va a acabar bien
  // o mal. Es el sonido de "algo enorme ahí abajo" y aguanta debajo de
  // cualquier acorde de la progresión sin pelearse con él.
  _construirDrone() {
    const ctx = this.ctx;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 150;
    this.droneFilter.Q.value = 1.2;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.11;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.music);

    for (const [f, det] of [[N.D1, -7], [N.D1, 6], [N.A2 / 2, -4]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(this.droneFilter);
      o.start();
    }
    // El filtro respira muy despacio: nunca suena dos veces igual.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoAmp = ctx.createGain();
    lfoAmp.gain.value = 60;
    lfo.connect(lfoAmp);
    lfoAmp.connect(this.droneFilter.frequency);
    lfo.start();
  }

  // ── Coro / cuerdas sostenidas ──
  // Tres voces que NO se reinician en cada acorde: se deslizan de una nota a
  // la siguiente. Ese portamento lento es la diferencia entre un teclado
  // cambiando de acorde y una sección respirando.
  _construirCoro() {
    const ctx = this.ctx;
    this.coroFiltro = ctx.createBiquadFilter();
    this.coroFiltro.type = 'lowpass';
    this.coroFiltro.frequency.value = 620;
    this.coroFiltro.Q.value = 0.8;
    this.coroGain = ctx.createGain();
    this.coroGain.gain.value = 0.0;
    this.coroFiltro.connect(this.coroGain);
    this.coroGain.connect(this.music);
    this._enviar(this.coroGain, 0.85); // mucha sala: es lo que lo hace enorme

    this.coroVoces = [];
    for (let v = 0; v < 3; v++) {
      const voz = [];
      // Dos osciladores por voz, ligeramente desafinados: un coro son muchas
      // gargantas que nunca afinan exactamente igual, y ese batido es el
      // "grosor" que un oscilador solo no tiene.
      for (const det of [-8, 7]) {
        const o = ctx.createOscillator();
        o.type = v === 0 ? 'sawtooth' : 'triangle';
        o.frequency.value = PROGRESION[0].coro[v];
        o.detune.value = det;
        o.connect(this.coroFiltro);
        o.start();
        voz.push(o);
      }
      // Vibrato lento y distinto en cada voz.
      const vib = ctx.createOscillator();
      vib.frequency.value = 4.1 + v * 0.7;
      const vibAmp = ctx.createGain();
      vibAmp.gain.value = 2.4;
      vib.connect(vibAmp);
      for (const o of voz) vibAmp.connect(o.detune);
      vib.start();
      this.coroVoces.push(voz);
    }

    // Bajo del acorde: una sola nota larga, la que sostiene la armonía.
    this.bajoGain = ctx.createGain();
    this.bajoGain.gain.value = 0.0;
    this.bajoGain.connect(this.music);
    this.bajoOsc = [];
    for (const det of [-5, 4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = PROGRESION[0].bajo;
      o.detune.value = det;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      o.connect(f); f.connect(this.bajoGain);
      o.start();
      this.bajoOsc.push(o);
    }
  }

  // ---------- utilidades ----------
  _env(t, a, peak, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  _noise(t, dur, filterType, f0, f1, peak, dest, sala = 0) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this._env(t, Math.min(0.02, dur * 0.2), peak, dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfx);
    if (sala > 0) this._enviar(g, sala);
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
    const paso = this._step;
    const enCompas = paso % 8;

    // ── Dónde estamos dentro de la FRASE ──
    // La forma no es "un compás que se repite": son ocho compases con
    // principio, medio y final, y cada vuelta cambia de célula y de peso.
    const frase = Math.floor(paso / PASOS_POR_FRASE);
    const enFrase = paso % PASOS_POR_FRASE;
    const ostinato = OSTINATOS[frase % OSTINATOS.length];
    const n = ostinato[paso % 8];
    const ultimoCompas = enFrase >= 56;

    // Respiración de la frase: crece hacia el compás 6 y afloja al cerrar. Un
    // nivel plano durante ocho compases es lo que hace que la música suene a
    // bucle aunque las notas cambien.
    const respiro = 0.82 + 0.18 * Math.sin((enFrase / PASOS_POR_FRASE) * Math.PI);

    // Rotación de orquestación: no todas las frases suenan igual. La primera
    // deja respirar (sin melodía), y a partir de ahí entra y se refuerza.
    const capa = frase % 4;
    const conMelodia = i > 0.25 && capa !== 0;

    // ── Cambio de acorde cada dos compases ──
    // La progresión también rota, no solo el acorde dentro de ella: cada 4
    // frases se cambia a la otra tabla armónica, así el bucle de verdad no es
    // "4 acordes para siempre" sino "8 acordes en dos bloques de 4 frases".
    const progresion = Math.floor(frase / 4) % 2 === 0 ? PROGRESION : PROGRESION_B;
    const idx = Math.floor(paso / PASOS_POR_ACORDE) % progresion.length;
    const claveAcorde = progresion === PROGRESION ? idx : idx + 100;
    if (claveAcorde !== this._acordeActual) {
      this._acordeActual = claveAcorde;
      this._acordeObj = progresion[idx];
      this._cambiarAcorde(progresion[idx], t);
      // Golpe grave que marca la llegada del acorde nuevo: es lo que hace que
      // el cambio se SIENTA además de oírse.
      if (i > 0.35) this._sub(progresion[idx].sub, t, 1.6, 0.42);
    }

    // ── La melodía de la frase ──
    // Se dispara en su paso exacto y dura lo que diga la tabla: es la única
    // voz que cruza los compases de largo.
    if (conMelodia) {
      for (const nota of MELODIA) {
        if (nota.p !== enFrase) continue;
        const fuerte = capa >= 2 ? 1.25 : 1;
        this._melodia(nota.n, t, nota.d * stepDur, (0.075 + i * 0.05) * fuerte * respiro);
        // Desde la tercera vuelta la dobla una octava abajo: la misma línea,
        // pero con el peso de una sección entera detrás.
        if (capa === 3) this._melodia(nota.n / 2, t, nota.d * stepDur, 0.05 * respiro);
      }
    }

    // ── Cuerdas: el ostinato, siempre ──
    this._cuerdaGrave(n, t, (0.15 + i * 0.13) * respiro);
    // Octava aguda doblando: el brillo que hace que se oiga por encima de todo.
    if (i > 0.3) this._cuerdaAguda(n * 2, t, (0.045 + i * 0.05) * respiro);

    // ── Metales: solo en la caza, y solo en tiempos fuertes ──
    // Un metal en cada corchea sería una pared de ruido; en el 1 y el 3 es un
    // acento y se nota mucho más.
    if (i > 0.55) {
      const ac = this._acordeObj;
      if (enCompas === 0) this._metal([ac.bajo, ac.bajo * 1.5], t, 0.75, (0.10 + i * 0.05) * respiro);
      if (enCompas === 4 && capa >= 2 && i > 0.8) this._metal([ac.bajo * 2], t, 0.4, 0.07);
    }

    // ── Percusión ──
    if (i > 0.5) {
      // Patrón completo de caza: bombo en 1 y 3, contratiempo, y redoble
      // agudo llenando — el "boom · boom-BOOM" de la percusión de cine.
      if (enCompas === 0) this._taiko(t, 0.85 * respiro);
      if (enCompas === 4) this._taiko(t, 0.62 * respiro);
      if (enCompas === 6) this._taiko(t + stepDur * 0.5, 0.3);
      if (i > 0.75 && (enCompas === 2 || enCompas === 5 || enCompas === 7)) {
        this._marco(t, 0.16 + Math.random() * 0.06);
      }
      // Redoble de cierre en el último compás: es lo que marca que la frase se
      // acaba y viene otra. Sin él, ocho compases y los ocho siguientes suenan
      // pegados sin costura y todo se vuelve una masa uniforme.
      if (ultimoCompas && i > 0.6) {
        const avance = (enFrase - 56) / 8;           // 0 → 1 a lo largo del compás
        this._marco(t, 0.12 + avance * 0.3);
        this._marco(t + stepDur * 0.5, 0.1 + avance * 0.26);
        if (enFrase === 63) this._taiko(t + stepDur * 0.5, 0.5);
      }
    } else if (enCompas === 0 && paso % 16 === 0) {
      // En calma queda un pulso lejano, cada dos compases: un latido, no ritmo.
      this._taiko(t, 0.26);
    }

    this._step++;
  }

  // Desliza coro y bajo al acorde nuevo. Nada se reinicia: solo cambian de
  // altura, como una sección que respira y sigue sonando.
  _cambiarAcorde(acorde, t) {
    const glis = 0.55;
    this.coroVoces.forEach((voz, v) => {
      for (const o of voz) {
        o.frequency.cancelScheduledValues(t);
        o.frequency.setValueAtTime(o.frequency.value, t);
        o.frequency.linearRampToValueAtTime(acorde.coro[v], t + glis);
      }
    });
    for (const o of this.bajoOsc) {
      o.frequency.cancelScheduledValues(t);
      o.frequency.setValueAtTime(o.frequency.value, t);
      o.frequency.linearRampToValueAtTime(acorde.bajo, t + glis);
    }
  }

  // ── Voces ──

  // Cuerda grave con ataque de arco: el filtro se abre en los primeros 40 ms.
  // Un arco no arranca al máximo de brillo, "muerde" y luego canta; sin esa
  // apertura suena a pulsación de sintetizador.
  _cuerdaGrave(freq, t, vel) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();     // segunda cuerda desafinada
    o2.type = 'sawtooth';
    o2.frequency.value = freq;
    o2.detune.value = 9;

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3.5;
    f.frequency.setValueAtTime(freq * 1.6, t);
    f.frequency.linearRampToValueAtTime(freq * 6.5, t + 0.04);
    f.frequency.exponentialRampToValueAtTime(freq * 2.2, t + 0.4);

    const g = this._env(t, 0.012, vel, 0.46);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.music);
    this._enviar(g, 0.35);
    o.start(t); o2.start(t);
    o.stop(t + 0.6); o2.stop(t + 0.6);
  }

  // ── La voz que canta la melodía ──
  // Mitad chelo, mitad trompa: sierra filtrada, ataque lento y vibrato que
  // ENTRA con la nota en vez de estar desde el principio, que es como toca un
  // intérprete de verdad —primero afina el sonido, luego lo adorna—. Va muy
  // cargada de sala porque tiene que sonar por encima de todo sin gritar.
  _melodia(freq, t, dur, vel) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + Math.min(0.16, dur * 0.28)); // arco entrando
    g.gain.setValueAtTime(vel, t + dur * 0.72);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(freq * 2.4, t);
    f.frequency.linearRampToValueAtTime(freq * 5.5, t + dur * 0.35);
    f.frequency.exponentialRampToValueAtTime(freq * 2.6, t + dur);
    f.connect(g);
    g.connect(this.music);
    this._enviar(g, 0.75);

    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibAmp = ctx.createGain();
    vibAmp.gain.setValueAtTime(0, t);                       // sin vibrato al atacar
    vibAmp.gain.linearRampToValueAtTime(6, t + dur * 0.45); // ...y creciendo
    vib.connect(vibAmp);

    for (const det of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      vibAmp.connect(o.detune);
      o.connect(f);
      o.start(t); o.stop(t + dur + 0.15);
    }
    vib.start(t); vib.stop(t + dur + 0.2);
  }

  // Octava aguda, corta y con más aire: dobla la línea sin engordarla.
  _cuerdaAguda(freq, t, vel) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq * 2.6;
    f.Q.value = 1.6;
    const g = this._env(t, 0.006, vel, 0.3);
    o.connect(f); f.connect(g); g.connect(this.music);
    this._enviar(g, 0.6);
    o.start(t); o.stop(t + 0.4);
  }

  // Metales: sierras apiladas por saturación, con ataque lento. El ataque es
  // lo que los distingue de una cuerda — un metal CRECE, no pulsa.
  _metal(freqs, t, dur, vel) {
    const ctx = this.ctx;
    for (const base of freqs) {
      for (const det of [-11, 0, 10]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = base;
        o.detune.value = det;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(base * 3, t);
        f.frequency.linearRampToValueAtTime(base * 9, t + dur * 0.35);
        f.frequency.exponentialRampToValueAtTime(base * 3, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vel, t + dur * 0.3); // crece
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(this.shaper);
        o.start(t); o.stop(t + dur + 0.1);
      }
    }
  }

  // Sub: más se siente que se oye. Es el suelo de todo lo épico.
  _sub(freq, t, dur, vel) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.4);
    const g = this._env(t, 0.02, vel, dur);
    o.connect(g); g.connect(this.music);
    o.start(t); o.stop(t + dur + 0.1);
  }

  // Taiko en tres capas: el sub que empuja, el cuerpo de madera y el golpe del
  // parche. Una sola capa suena a "bip grave"; las tres suenan a tambor.
  _taiko(t, vel) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.26);
    const g = this._env(t, 0.004, vel, 0.38);
    o.connect(g); g.connect(this.music);

    const cuerpo = ctx.createOscillator();
    cuerpo.type = 'triangle';
    cuerpo.frequency.setValueAtTime(230, t);
    cuerpo.frequency.exponentialRampToValueAtTime(90, t + 0.14);
    const cg = this._env(t, 0.003, vel * 0.42, 0.18);
    cuerpo.connect(cg); cg.connect(this.music);

    o.start(t); o.stop(t + 0.5);
    cuerpo.start(t); cuerpo.stop(t + 0.25);
    // Poca sala en la percusión: reverberarla se come el pulso.
    this._noise(t, 0.1, 'lowpass', 500, 190, vel * 0.4, this.music, 0.22);
    this._enviar(g, 0.18);
  }

  // Tambor de marco: el redoble agudo que rellena entre los golpes grandes.
  _marco(t, vel) {
    this._noise(t, 0.09, 'bandpass', 1600, 900, vel, this.music, 0.3);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(330, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.07);
    const g = this._env(t, 0.002, vel * 0.5, 0.1);
    o.connect(g); g.connect(this.music);
    o.start(t); o.stop(t + 0.15);
  }

  // ---------- stingers ----------

  // El nacimiento del Juggernaut. Un BRAAAM de verdad no es un acorde: es un
  // acorde que CRECE y se dobla con un sub que cae. Aquí además el ataque va
  // escalonado por registro —los graves entran antes— que es como suena una
  // sección de metales de verdad, y no todos a la vez como un teclado.
  braam() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const registros = [
      { f: N.D1, retardo: 0.00, pico: 0.20 },
      { f: N.D2, retardo: 0.03, pico: 0.17 },
      { f: N.A2, retardo: 0.06, pico: 0.13 },
      { f: N.D3, retardo: 0.09, pico: 0.11 },
      { f: N.F3, retardo: 0.13, pico: 0.07 },
    ];
    for (const r of registros) {
      for (const det of [-13, 0, 12]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = r.f;
        o.detune.value = det;
        const g = this.ctx.createGain();
        const t0 = t + r.retardo;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(r.pico, t0 + 0.42);   // el crescendo
        g.gain.setValueAtTime(r.pico, t0 + 0.9);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);
        o.connect(g); g.connect(this.shaper);
        o.start(t0); o.stop(t0 + 3.4);
      }
    }
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(58, t);
    sub.frequency.exponentialRampToValueAtTime(26, t + 2.2);
    const sg = this._env(t, 0.06, 0.55, 2.6);
    sub.connect(sg); sg.connect(this.sfx);
    sub.start(t); sub.stop(t + 2.8);
    this._taiko(t, 1.0);
  }

  // Carga del slam: ruido que sube + una sirena grave. Las dos a la vez hacen
  // que el oído no sepa dónde acaba de subir, que es el truco del riser.
  riser(dur = 0.75) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, dur, 'bandpass', 320, 4200, 0.3, this.sfx, 0.4);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(360, t + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + dur);
    const g = this._env(t, dur * 0.6, 0.16, dur + 0.06);
    o.connect(f); f.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.1);
  }

  slamImpact() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._taiko(t, 1.0);
    this._taiko(t + 0.035, 0.75);
    this._noise(t, 1.3, 'highpass', 1000, 260, 0.32, this.sfx, 0.75);
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(78, t);
    sub.frequency.exponentialRampToValueAtTime(27, t + 0.7);
    const g = this._env(t, 0.008, 0.68, 1.0);
    sub.connect(g); g.connect(this.sfx);
    sub.start(t); sub.stop(t + 1.1);
  }

  whoosh() { // placaje
    if (!this.ctx) return;
    this._noise(this.ctx.currentTime, 0.3, 'bandpass', 1200, 240, 0.22, this.sfx, 0.35);
  }

  clang() { // el estandarte cae: campana metálica inarmónica (FM)
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const car = this.ctx.createOscillator();
    car.frequency.value = 620;
    const mod = this.ctx.createOscillator();
    mod.frequency.value = 1137; // ratio inarmónico → metal
    const idx = this.ctx.createGain();
    idx.gain.setValueAtTime(950, t);
    idx.gain.exponentialRampToValueAtTime(8, t + 0.55);
    mod.connect(idx); idx.connect(car.frequency);
    const g = this._env(t, 0.004, 0.3, 0.9);
    car.connect(g); g.connect(this.sfx);
    this._enviar(g, 0.8); // la campana es lo que más sala pide: cuelga en el aire
    car.start(t); mod.start(t);
    car.stop(t + 1.0); mod.stop(t + 1.0);
  }

  arpUp() { // captura del estandarte
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [N.D3, N.F3, N.A3, N.D4, N.F4].forEach((f, i) => {
      this._cuerdaAguda(f, t + i * 0.06, 0.2);
    });
  }

  fallCry() { // ring-out: caída al abismo
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(340, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.9);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = this._env(t, 0.02, 0.13, 0.95);
    o.connect(f); f.connect(g); g.connect(this.sfx);
    this._enviar(g, 0.65); // se aleja hacia abajo: mucha cola
    o.start(t); o.stop(t + 1.1);
  }

  // Resolución a RE MAYOR: la única luz de toda la partitura. Toda la pieza ha
  // estado en menor y sin tercera; aquí aparece el fa sostenido y por fin dice
  // algo. Es el truco más viejo del cine y sigue funcionando.
  victory() {
    if (!this.ctx || this._victoryPlayed) return;
    this._victoryPlayed = true;
    const t = this.ctx.currentTime;

    // El coro sube al acorde mayor y se queda.
    const mayor = [N.D3, N.Fs3, N.A3];
    this.coroVoces.forEach((voz, v) => {
      for (const o of voz) {
        o.frequency.cancelScheduledValues(t);
        o.frequency.setValueAtTime(o.frequency.value, t);
        o.frequency.linearRampToValueAtTime(mayor[v], t + 0.9);
      }
    });
    this.coroGain.gain.cancelScheduledValues(t);
    this.coroGain.gain.linearRampToValueAtTime(0.16, t + 1.2);
    this.coroFiltro.frequency.linearRampToValueAtTime(2200, t + 2.0);

    for (const f of [N.D3, N.Fs3, N.A3, N.D4, N.Fs4]) {
      for (const det of [-6, 5]) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = det;
        const g = this._env(t, 0.35, 0.10, 5);
        o.connect(g); g.connect(this.music);
        this._enviar(g, 0.7);
        o.start(t); o.stop(t + 5.2);
      }
    }
    this._metal([N.D2, N.A2, N.D3], t + 0.1, 2.4, 0.13);
    this._taiko(t, 0.95);
    this._taiko(t + 0.45, 0.6);
    this._taiko(t + 0.9, 1.0);
  }

  // La intensidad ORQUESTA, no sube el volumen: instrumentos que entran y
  // salen. En calma quedan el drone y un coro apagado; con la caza se abre el
  // filtro del coro, entra el bajo y el drone se destapa.
  setIntensity(x) {
    if (!this.ctx || Math.abs(x - this.intensity) < 0.01) return;
    this.intensity = x;
    const t = this.ctx.currentTime;
    const suave = (param, v, seg = 1.6) => {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(v, t + seg);
    };
    suave(this.droneFilter.frequency, 150 + x * 300);
    suave(this.droneGain.gain, 0.11 + x * 0.05);
    suave(this.coroGain.gain, 0.05 + x * 0.09);
    suave(this.coroFiltro.frequency, 620 + x * 1500);
    suave(this.bajoGain.gain, x * 0.1);
  }

  toggleMute() {
    if (!this.ctx) return false;
    this.muted = !this.muted;
    this.bus.gain.linearRampToValueAtTime(
      this.muted ? 0.0001 : 0.82, this.ctx.currentTime + 0.15
    );
    return this.muted;
  }
}
