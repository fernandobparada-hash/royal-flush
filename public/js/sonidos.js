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
  function crearSonidos(opciones) {
    opciones = opciones || {};
    const Ctor = opciones.AudioContext ||
      (typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null);
    let ctx = null;
    let activo = opciones.activo !== false;

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
      const osc = c.createOscillator();
      const ganancia = c.createGain();
      osc.type = tipo || "sine";
      osc.frequency.setValueAtTime(frecuencia, inicio);
      ganancia.gain.setValueAtTime(0.0001, inicio);
      ganancia.gain.exponentialRampToValueAtTime(Math.max(0.0002, volumen), inicio + 0.008);
      ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
      osc.connect(ganancia);
      ganancia.connect(c.destination);
      osc.start(inicio);
      osc.stop(inicio + duracion + 0.02);
    }

    /** Un soplido corto de ruido filtrado (sonido de carta o de tela). */
    function ruido(c, inicio, duracion, volumen, frecuenciaFiltro) {
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
      fin: function (c, t) { tono(c, 392, t, 0.18, "sine", 0.15); tono(c, 330, t + 0.12, 0.22, "sine", 0.12); },
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

      activar: function (si) { activo = !!si; },
      estaActivo: function () { return activo; },
      alternar: function () { activo = !activo; return activo; },
      disponible: function () { return !!Ctor; }
    };
  }

  const api = { crearSonidos: crearSonidos };
  raiz.PokerSonidos = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
