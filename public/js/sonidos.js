/* =========================================================
   SONIDOS
   ---------------------------------------------------------
   Los sonidos se fabrican al vuelo con la Web Audio API
   (no hay archivos de audio que descargar): un "clic" para
   las cartas, un "tintineo" para las fichas, un aviso suave
   cuando te toca y una melodía corta cuando ganas.

   Si el navegador no soporta audio, no pasa nada: todas las
   funciones simplemente no hacen nada.
   ========================================================= */

(function (raiz) {
  "use strict";

  /**
   * opciones.AudioContext: constructor del contexto (para pruebas).
   * opciones.activo:       si empiezan encendidos (por defecto sí).
   */
  // Escala pentatónica (do re mi sol la): el tema andino "afina" todo a esas notas
  const PENTA = [0, 2, 4, 7, 9];
  function afinar(f, escala) {
    if (!escala || !(f > 0)) return f;
    const semis = Math.round(12 * Math.log2(f / 261.63));
    const oct = Math.floor(semis / 12);
    const dentro = ((semis % 12) + 12) % 12;
    let mejor = PENTA[0];
    PENTA.forEach(function (p) { if (Math.abs(p - dentro) < Math.abs(mejor - dentro)) mejor = p; });
    return 261.63 * Math.pow(2, (oct * 12 + mejor) / 12);
  }

  const TEMAS = {
    clasico: { tono: 1, vol: 1, largo: 1 },
    suave: { tono: 0.75, vol: 0.6, largo: 1.4, onda: "sine" },
    casino: { tono: 1.25, vol: 0.85, largo: 1.2, onda: "sine", armonico: 0.45, eco: 0.12 },
    arcade: { tono: 1, vol: 0.55, largo: 0.8, onda: "square", ruidoComoTono: true },
    andino: { tono: 1, vol: 0.9, largo: 1.5, onda: "sine", escala: true, vibrato: 0.012, eco: 0.18 }
  };

  function crearSonidos(opciones) {
    opciones = opciones || {};
    const Ctor = opciones.AudioContext ||
      (typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null);
    let ctx = null;
    let activo = opciones.activo !== false;
    let tema = TEMAS[opciones.tema] ? opciones.tema : "clasico";

    function contexto() {
      if (!Ctor) return null;
      if (!ctx) {
        try { ctx = new Ctor(); } catch (e) { return null; }
      }
      // Los navegadores arrancan el audio "dormido" hasta que el usuario toca algo
      if (ctx.state === "suspended" && typeof ctx.resume === "function") {
        try { ctx.resume(); } catch (e) { /* */ }
      }
      return ctx;
    }

    /** Un tono con forma de "pluck": sube rápido y se apaga. */
    function tono(c, frecuencia, inicio, duracion, tipo, volumen) {
      const T = TEMAS[tema];
      frecuencia = afinar(frecuencia * T.tono, T.escala);
      tipo = T.onda || tipo;
      volumen = volumen * T.vol;
      duracion = duracion * T.largo;
      tonoCrudo(c, frecuencia, inicio, duracion, tipo, volumen, T.vibrato);
      if (T.armonico) tonoCrudo(c, frecuencia * 2, inicio, duracion * 0.7, "sine", volumen * T.armonico, 0);
      if (T.eco) tonoCrudo(c, frecuencia, inicio + T.eco, duracion, tipo, volumen * 0.35, T.vibrato);
    }

    function tonoCrudo(c, frecuencia, inicio, duracion, tipo, volumen, vibrato) {
      const osc = c.createOscillator();
      const ganancia = c.createGain();
      osc.type = tipo || "sine";
      osc.frequency.setValueAtTime(frecuencia, inicio);
      ganancia.gain.setValueAtTime(0.0001, inicio);
      ganancia.gain.exponentialRampToValueAtTime(Math.max(0.0002, volumen), inicio + 0.008);
      ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
      if (vibrato && c.createOscillator) {
        const lfo = c.createOscillator();
        const prof = c.createGain();
        lfo.frequency.value = 5.5;
        prof.gain.value = frecuencia * vibrato;
        lfo.connect(prof);
        prof.connect(osc.frequency);
        lfo.start(inicio);
        lfo.stop(inicio + duracion + 0.02);
      }
      osc.connect(ganancia);
      ganancia.connect(c.destination);
      osc.start(inicio);
      osc.stop(inicio + duracion + 0.02);
    }

    /** Un soplido corto de ruido filtrado (sonido de carta o de tela). */
    function ruido(c, inicio, duracion, volumen, frecuenciaFiltro) {
      const T = TEMAS[tema];
      // En arcade las cartas y el paño suenan como un "blip" de consola
      if (T.ruidoComoTono) { tonoCrudo(c, (frecuenciaFiltro || 2500) / 3, inicio, Math.min(0.06, duracion), "square", volumen * 0.25, 0); return; }
      volumen = volumen * T.vol;
      frecuenciaFiltro = (frecuenciaFiltro || 2500) * T.tono;
      const muestras = Math.max(1, Math.floor(c.sampleRate * duracion));
      const buffer = c.createBuffer(1, muestras, c.sampleRate);
      const datos = buffer.getChannelData(0);
      for (let i = 0; i < muestras; i++) {
        datos[i] = (Math.random() * 2 - 1) * (1 - i / muestras);
      }
      const fuente = c.createBufferSource();
      fuente.buffer = buffer;
      const filtro = c.createBiquadFilter();
      filtro.type = "bandpass";
      filtro.frequency.value = frecuenciaFiltro || 2500;
      const ganancia = c.createGain();
      ganancia.gain.value = volumen;
      fuente.connect(filtro);
      filtro.connect(ganancia);
      ganancia.connect(c.destination);
      fuente.start(inicio);
    }

    const SONIDOS = {
      carta: function (c, t) { ruido(c, t, 0.07, 0.35, 3200); },
      ficha: function (c, t) {
        tono(c, 2100, t, 0.07, "triangle", 0.18);
        tono(c, 2800, t + 0.045, 0.09, "triangle", 0.14);
      },
      pasar: function (c, t) { tono(c, 320, t, 0.06, "sine", 0.25); tono(c, 320, t + 0.09, 0.06, "sine", 0.2); },
      retirarse: function (c, t) { ruido(c, t, 0.16, 0.18, 900); },
      turno: function (c, t) {
        tono(c, 880, t, 0.14, "sine", 0.22);
        tono(c, 1320, t + 0.11, 0.2, "sine", 0.18);
      },
      ganar: function (c, t) {
        [523, 659, 784, 1047].forEach(function (f, i) { tono(c, f, t + i * 0.09, 0.28, "triangle", 0.2); });
      },
      // Escalera real / de color / póker: fanfarria más larga
      jugadon: function (c, t) {
        [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { tono(c, f, t + i * 0.11, i === 6 ? 0.6 : 0.22, "triangle", 0.22); });
        tono(c, 262, t, 0.9, "sine", 0.12);
      },
      fin: function (c, t) { tono(c, 392, t, 0.18, "sine", 0.15); tono(c, 330, t + 0.12, 0.22, "sine", 0.12); },
      apostar: function (c, t) {
        [1250, 1650, 2100].forEach(function (f, i) { tono(c, f, t + i * 0.045, 0.10, "triangle", 0.12); });
      },
      igualar: function (c, t) {
        tono(c, 1400, t, 0.09, "triangle", 0.13);
        tono(c, 1900, t + 0.055, 0.11, "triangle", 0.11);
      },
      subir: function (c, t) {
        [850, 1150, 1550, 2200].forEach(function (f, i) { tono(c, f, t + i * 0.055, 0.12, "triangle", 0.13); });
      },
      allin: function (c, t) {
        [392, 523, 659, 784].forEach(function (f, i) { tono(c, f, t + i * 0.09, 0.24, "sawtooth", 0.07); });
      },
      bote: function (c, t) {
        [1600, 2000, 2400].forEach(function (f, i) { tono(c, f, t + i * 0.07, 0.12, "triangle", 0.11); });
      },
      premio: function (c, t) {
        [784, 988, 1175, 1568].forEach(function (f, i) { tono(c, f, t + i * 0.075, 0.23, "sine", 0.16); });
      },
      // Riffle: dos mitades del mazo que se entrelazan (ráfaga de clics)
      barajar: function (c, t) {
        for (let i = 0; i < 14; i++) ruido(c, t + i * 0.035 + (i % 2) * 0.008, 0.03, 0.22, 2600 + (i % 3) * 500);
        ruido(c, t + 0.56, 0.09, 0.3, 1800);
      },
      ciegas: function (c, t) { [660, 660, 990].forEach(function (f, i) { tono(c, f, t + i * 0.12, 0.14, "square", 0.08); }); }
    };

    return {
      NOMBRES: Object.keys(SONIDOS),

      /**
       * reproducir("carta", { veces: 4, cada: 0.12 }) suena 4 veces seguidas.
       * Devuelve true si realmente programó algún sonido.
       */
      reproducir: function (nombre, op) {
        if (!activo) return false;
        const f = SONIDOS[nombre];
        if (!f) return false;
        const c = contexto();
        if (!c) return false;
        const veces = Math.max(1, Math.min(12, (op && op.veces) || 1));
        const cada = (op && op.cada) || 0.12;
        try {
          for (let i = 0; i < veces; i++) f(c, c.currentTime + i * cada);
        } catch (e) {
          return false;
        }
        return true;
      },

      /** Tema de sonido: "clasico", "suave", "casino", "arcade" o "andino" (acepta "sonido:x"). */
      ponerTema: function (id) {
        const k = String(id || "").replace(/^sonido:/, "");
        tema = TEMAS[k] ? k : "clasico";
        return tema;
      },
      tema: function () { return tema; },
      TEMAS: Object.keys(TEMAS),

      activar: function (si) { activo = !!si; },
      estaActivo: function () { return activo; },
      alternar: function () { activo = !activo; return activo; },
      disponible: function () { return !!Ctor; }
    };
  }

  const api = { crearSonidos: crearSonidos, TEMAS: Object.keys(TEMAS), afinar: afinar };
  raiz.PokerSonidos = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
