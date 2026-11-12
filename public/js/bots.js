/* =========================================================
   INTELIGENCIA DE LOS BOTS
   ---------------------------------------------------------
   Los bots NO hacen trampas: no miran las cartas ocultas
   de nadie ni las cartas que todavía no han salido.

   Su decisión se basa en:
     1) Su probabilidad real de ganar (equidad), calculada
        simulando miles de repartos posibles (Monte Carlo)
     2) Lo que cuesta igualar frente a lo que hay en el bote
        (pot odds)
     3) Su posición en la mesa y cuántos rivales quedan
     4) Su estilo de juego (tight, agresivo, suelto o
        equilibrado), distinto para cada bot
     5) Un poco de azar, para que no sean predecibles
        (a veces farolean)
   ========================================================= */

(function (raiz) {
  "use strict";

  const Ev = (typeof module !== "undefined" && typeof document === "undefined")
    ? require("./evaluador.js")
    : raiz.PokerEvaluador;

  const NOMBRES_BOT = [
    "Lucía", "Carlos", "Sofía", "Miguel", "Ana",
    "Diego", "Marta", "Javier", "Elena", "Pablo",
    "Laura", "Andrés", "Valentina", "Hugo", "Camila",
    "Mateo", "Isabel", "Nicolás", "Rosa", "Felipe"
  ];

  function nombreBot(yaUsados) {
    yaUsados = yaUsados || [];
    const libres = NOMBRES_BOT.filter(function (n) { return yaUsados.indexOf(n) === -1; });
    if (libres.length === 0) {
      return "Bot " + (yaUsados.length + 1);
    }
    return libres[Math.floor(Math.random() * libres.length)];
  }

  /** Puntuación de 0 a 1 para las 2 cartas iniciales. */
  function fuerzaPreflop(cartas) {
    if (!cartas || cartas.length < 2) return 0;
    const a = Math.max(cartas[0].numero, cartas[1].numero);
    const b = Math.min(cartas[0].numero, cartas[1].numero);
    const par = a === b;
    const mismoPalo = cartas[0].palo === cartas[1].palo;
    const hueco = a - b;

    if (par) {
      if (a >= 13) return 0.96;
      if (a >= 11) return 0.88;
      if (a >= 9) return 0.76;
      if (a >= 6) return 0.62;
      return 0.48 + a * 0.015;
    }

    let s = (a * 0.045) + (b * 0.02);
    if (a === 14 && b === 13) s = 0.9;
    else if (a === 14 && b === 12) s = 0.84;
    else if (a === 14 && b === 11) s = 0.78;
    else if (a === 13 && b === 12) s = 0.74;
    else if (a === 14 && b >= 10) s = 0.7;

    if (mismoPalo) s += 0.06;
    if (hueco === 1) s += 0.05;
    else if (hueco === 2) s += 0.02;
    else if (hueco >= 5) s -= 0.08;

    return Math.max(0.05, Math.min(0.95, s));
  }

  /** Puntuación de 0 a 1 con flop, turn o river ya en la mesa. */
  function fuerzaPostflop(privadas, comunitarias) {
    const cartas = privadas.concat(comunitarias);
    if (cartas.length < 5) return fuerzaPreflop(privadas);

    const mano = Ev.mejorMano(cartas);
    const cat = mano.categoria;
    let s = 0.12;
    if (cat === 0) s = 0.12 + (mano.desempate[0] / 14) * 0.1;
    else if (cat === 1) s = 0.38 + (mano.desempate[0] >= 11 ? 0.14 : mano.desempate[0] * 0.015);
    else if (cat === 2) s = 0.66;
    else if (cat === 3) s = 0.8;
    else if (cat === 4) s = 0.86;
    else if (cat === 5) s = 0.9;
    else if (cat === 6) s = 0.94;
    else s = 0.98;

    const draws = Ev.detectarProyectadas(cartas);
    if (draws.color) s = Math.max(s, 0.58);
    if (draws.escaleraAbierta) s = Math.max(s, 0.54);
    else if (draws.gutshot) s += 0.08;

    return Math.max(0.05, Math.min(0.99, s));
  }

  /* ---------------------------------------------------------
     ESTILOS DE JUEGO
     Cada bot tiene un estilo fijo (según su nombre), así en la
     mesa no todos juegan igual:
       selectividad: suma = más exigente con las manos que juega
       agresion:     multiplica las ganas de apostar y subir
       farol:        probabilidad base de farolear
       paga:         cuánto le cuesta retirarse (paga más con dudas)
     --------------------------------------------------------- */
  const ESTILOS = {
    tight:       { nombre: "tight",       selectividad:  0.07, agresion: 0.9,  farol: 0.03, paga: -0.03 },
    agresivo:    { nombre: "agresivo",    selectividad: -0.02, agresion: 1.4,  farol: 0.13, paga:  0.00 },
    suelto:      { nombre: "suelto",      selectividad: -0.08, agresion: 0.85, farol: 0.06, paga:  0.05 },
    equilibrado: { nombre: "equilibrado", selectividad:  0.00, agresion: 1.0,  farol: 0.07, paga:  0.00 }
  };
  const LISTA_ESTILOS = ["tight", "agresivo", "suelto", "equilibrado"];

  function hashTexto(t) {
    let h = 2166136261;
    t = String(t || "");
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /** Estilo de un bot: siempre el mismo para el mismo jugador. */
  function estiloDe(jugador) {
    if (jugador && jugador.estiloBot && ESTILOS[jugador.estiloBot]) return ESTILOS[jugador.estiloBot];
    const clave = jugador ? (jugador.nombre || jugador.id) : "";
    return ESTILOS[LISTA_ESTILOS[hashTexto(clave) % LISTA_ESTILOS.length]];
  }

  /* ---------------------------------------------------------
     POSICIÓN Y RIVALES
     --------------------------------------------------------- */

  /** Rivales que siguen en la mano (sin contarse a sí mismo). */
  function contarRivales(jugador, estado) {
    const lista = estado.jugadores || [];
    let n = 0;
    for (let i = 0; i < lista.length; i++) {
      if (lista[i].id !== jugador.id && lista[i].enMano && !lista[i].retirado) n++;
    }
    return n;
  }

  /**
   * Posición del 0 al 1 entre los jugadores que siguen en la mano:
   * 1 = último en hablar después del flop (el botón), 0 = el primero.
   * Hablar al final es una ventaja: ya viste qué hicieron los demás.
   */
  function posicionRelativa(jugador, estado) {
    const lista = (estado.jugadores || []).filter(function (j) { return j.enMano && !j.retirado; });
    if (lista.length < 2 || estado.botonDealer == null) return 0.5;
    const total = estado.asientosTotales || 9;
    const boton = estado.botonDealer;
    function distancia(j) {
      const d = ((j.asiento - boton) % total + total) % total;
      return d === 0 ? total : d; // el botón habla el último
    }
    lista.sort(function (a, b) { return distancia(a) - distancia(b); });
    const idx = lista.findIndex(function (j) { return j.id === jugador.id; });
    if (idx < 0) return 0.5;
    return idx / (lista.length - 1);
  }

  /* ---------------------------------------------------------
     EQUIDAD (probabilidad real de ganar), por simulación Monte Carlo
     Repartimos al azar las cartas que faltan y las manos de los rivales
     muchas veces, y contamos cuántas veces ganaría el bot.
     --------------------------------------------------------- */
  function equidad(privadas, comunitarias, rivales, iteraciones, aleatorio) {
    const rnd = aleatorio || Math.random;
    rivales = Math.max(1, Math.min(rivales || 1, 9));
    iteraciones = iteraciones || 160;
    const conocidas = privadas.concat(comunitarias);
    const mazo = Ev.crearMazo().filter(function (c) {
      return !conocidas.some(function (k) { return k.numero === c.numero && k.palo === c.palo; });
    });
    const faltan = 5 - comunitarias.length;
    const necesarias = faltan + rivales * 2;
    if (necesarias > mazo.length) return 0.5;

    let puntos = 0;
    for (let it = 0; it < iteraciones; it++) {
      // Fisher-Yates parcial: basta con mezclar las cartas que vamos a usar
      for (let i = 0; i < necesarias; i++) {
        const j = i + Math.floor(rnd() * (mazo.length - i));
        const tmp = mazo[i]; mazo[i] = mazo[j]; mazo[j] = tmp;
      }
      const mesa = comunitarias.concat(mazo.slice(0, faltan));
      const mia = Ev.mejorMano(privadas.concat(mesa));
      let gana = true;
      let empates = 0;
      for (let r = 0; r < rivales; r++) {
        const base = faltan + r * 2;
        const su = Ev.mejorMano([mazo[base], mazo[base + 1]].concat(mesa));
        const c = Ev.compararPuntuaciones(mia, su);
        if (c < 0) { gana = false; break; }
        if (c === 0) empates++;
      }
      if (gana) puntos += 1 / (empates + 1);
    }
    return puntos / iteraciones;
  }

  /**
   * Elige una acción legal. Devuelve { tipo, cantidad }.
   * "cantidad" es el total de la ronda (subir a X).
   * opciones (para pruebas): { aleatorio: fn, iteraciones: n }
   */
  function decidir(legales, jugador, estado, opciones) {
    if (!legales || !legales.tipos || legales.tipos.length === 0) {
      return { tipo: "pasar" };
    }
    opciones = opciones || {};
    const rnd = opciones.aleatorio || Math.random;

    const privadas = (jugador.cartas || []).filter(function (c) { return !c.oculta; });
    const comunitarias = estado.comunitarias || [];
    const preflop = estado.fase === "preflop" || comunitarias.length < 3;
    const estilo = estiloDe(jugador);
    const rivales = Math.max(1, contarRivales(jugador, estado));
    const pos = posicionRelativa(jugador, estado);

    const bb = estado.ciegaGrande || 10;
    const bote = estado.boteTotal || 0;
    const porIgualar = legales.porIgualar || 0;
    const apuestaMaxima = estado.apuestaMaxima || 0;
    const potOdds = porIgualar / (bote + porIgualar + 1);
    const azar = rnd();
    const stackEnCiegas = (jugador.fichas || 0) / bb;

    // ---- Fuerza de la mano ----
    let fuerza;      // 0 a 1, solo para preflop
    let equity = 0;  // probabilidad de ganar, solo postflop
    let rel = 0;     // equity respecto a lo "normal" con ese número de rivales (-1 a 1)
    let proyecta = false;
    if (preflop) {
      fuerza = fuerzaPreflop(privadas);
      // Con muchos rivales hay que exigir más; en buena posición se puede jugar más
      fuerza += (pos - 0.5) * 0.08 - Math.max(0, rivales - 2) * 0.012;
      fuerza = Math.max(0.03, Math.min(0.99, fuerza));
    } else {
      equity = equidad(privadas, comunitarias, rivales, opciones.iteraciones, rnd);
      const justo = 1 / (rivales + 1);
      rel = (equity - justo) / (1 - justo);
      const draws = Ev.detectarProyectadas(privadas.concat(comunitarias));
      proyecta = !!(draws.color || draws.escaleraAbierta) && comunitarias.length < 5;
    }

    // ---- Tamaños de apuesta ----
    // "frac" es la fracción del bote. Devuelve la acción lista para enviar.
    function apuestaDe(frac, permitirAllIn) {
      const min = legales.minSubida || (apuestaMaxima + (estado.subidaMinima || bb));
      const max = legales.maxSubida;
      const alternativa = legales.puedeIgualar ? { tipo: "igualar" } : (legales.puedePasar ? { tipo: "pasar" } : { tipo: "retirarse" });
      if (!isFinite(min) || !isFinite(max) || max <= 0) return alternativa;
      if (!(legales.puedeApostar || legales.puedeSubir)) {
        return (permitirAllIn && legales.puedeAllIn) ? { tipo: "all-in" } : alternativa;
      }
      const boteTras = bote + porIgualar;
      let objetivo = Math.round(apuestaMaxima + Math.max(bb, boteTras * frac));
      if (preflop && apuestaMaxima <= bb) {
        objetivo = Math.round(bb * (2.5 + frac * 2)); // apertura clásica: 2,5 a 4 ciegas
      }
      if (!permitirAllIn) {
        // No más de un tercio del stack en una sola apuesta, salvo que ya esté muy comprometido
        const tope = jugador.apuestaRonda + Math.max(min, Math.floor(jugador.fichas * 0.35));
        objetivo = Math.min(objetivo, tope);
      }
      objetivo = Math.max(min, Math.min(max, objetivo));
      if (objetivo >= max) {
        if (permitirAllIn && legales.puedeAllIn) return { tipo: "all-in" };
        if (max - 1 >= min) objetivo = max - 1;
        else return legales.puedeAllIn ? { tipo: "all-in" } : alternativa;
      }
      return { tipo: legales.puedeApostar ? "apostar" : "subir", cantidad: objetivo };
    }

    function pagarOPasar() {
      if (legales.puedePasar) return { tipo: "pasar" };
      if (legales.puedeIgualar) return { tipo: "igualar" };
      if (legales.puedeAllIn) return { tipo: "all-in" };
      return { tipo: "retirarse" };
    }
    function soltar() {
      if (legales.puedePasar) return { tipo: "pasar" };
      return { tipo: "retirarse" };
    }

    // =====================================================
    // PREFLOP
    // =====================================================
    if (preflop) {
      // Stack corto (menos de 12 ciegas): se juega "todo o nada"
      if (stackEnCiegas <= 12 && legales.puedeAllIn) {
        const umbralEmpuje = 0.62 + estilo.selectividad - (12 - stackEnCiegas) * 0.015 - (pos * 0.04);
        if (fuerza >= umbralEmpuje) return { tipo: "all-in" };
        if (!legales.puedePasar && porIgualar > jugador.fichas * 0.5 && fuerza < umbralEmpuje - 0.1) return { tipo: "retirarse" };
      }

      const premium = fuerza >= 0.86;
      const buena = fuerza >= 0.62 + estilo.selectividad;

      // Nadie ha subido (solo ciegas): abrimos, limpeamos o pasamos
      if (apuestaMaxima <= bb) {
        const umbralAbrir = 0.56 + estilo.selectividad - pos * 0.06;
        if (legales.puedePasar) {
          // estamos en la ciega grande: no hace falta pagar
          if ((fuerza > umbralAbrir + 0.08 || azar < estilo.farol * 0.5) && (legales.puedeApostar || legales.puedeSubir) && azar < 0.65 * estilo.agresion) {
            return apuestaDe(0.5 + fuerza * 0.4, false);
          }
          return { tipo: "pasar" };
        }
        if (fuerza >= umbralAbrir && (legales.puedeApostar || legales.puedeSubir) && azar < Math.min(0.92, 0.5 + 0.4 * estilo.agresion)) {
          return apuestaDe(0.5 + fuerza * 0.5, premium && azar < 0.05);
        }
        if (legales.puedeIgualar && fuerza >= 0.34 + estilo.selectividad * 0.5 && porIgualar <= bb) {
          return { tipo: "igualar" }; // limp barato
        }
        return soltar();
      }

      // Alguien subió: ¿cuánto nos cuesta? (en ciegas)
      const costeEnCiegas = porIgualar / bb;
      if (premium && (legales.puedeSubir || legales.puedeApostar) && azar < 0.7 * estilo.agresion) {
        return apuestaDe(0.9, fuerza >= 0.94 && azar < 0.35);
      }
      if (buena && (legales.puedeSubir || legales.puedeApostar) && fuerza >= 0.74 && azar < 0.25 * estilo.agresion) {
        return apuestaDe(0.75, false);
      }
      // Pagar si la mano aguanta el precio; cuanto más cara la subida, más fuerza pide
      const precio = Math.min(0.28, costeEnCiegas * 0.025);
      const umbralPago = 0.42 + estilo.selectividad - estilo.paga + precio;
      if (fuerza >= umbralPago || (potOdds < 0.12 && fuerza > 0.3)) {
        return legales.puedeIgualar ? { tipo: "igualar" } : pagarOPasar();
      }
      if (azar < estilo.farol * 0.4 && (legales.puedeSubir) && costeEnCiegas <= 6) {
        return apuestaDe(0.8, false); // farol de 3-bet, muy de vez en cuando
      }
      return soltar();
    }

    // =====================================================
    // POSTFLOP (flop, turn, river)
    // =====================================================
    const enRiver = comunitarias.length === 5;
    const valorMin = 0.34 + estilo.selectividad;   // "rel" mínima para apostar por valor
    const subirMin = 0.60 + estilo.selectividad;   // "rel" mínima para subir

    // Nadie ha apostado: pasamos o apostamos
    if (legales.puedePasar) {
      const puedeApostar = legales.puedeApostar || legales.puedeSubir;
      if (!puedeApostar) return { tipo: "pasar" };

      if (rel >= valorMin && azar < Math.min(0.95, 0.55 + 0.35 * estilo.agresion + pos * 0.1)) {
        // Cuanto más fuerte, más grande la apuesta
        const frac = rel > 0.75 ? 0.8 : (rel > 0.55 ? 0.62 : 0.45);
        return apuestaDe(frac, rel > 0.92 && azar < 0.15);
      }
      if (proyecta && !enRiver && azar < 0.32 * estilo.agresion) {
        return apuestaDe(0.5, false); // semi-farol con proyecto
      }
      if (rel < 0.1 && rivales <= 2 && azar < estilo.farol * (0.6 + pos)) {
        return apuestaDe(0.6, false); // farol, sobre todo en posición y contra pocos
      }
      return { tipo: "pasar" };
    }

    // Alguien apostó: comparamos nuestra probabilidad de ganar con lo que cuesta igualar
    const margen = 0.02 + (0.04 * (1 - estilo.agresion / 1.4)) - estilo.paga;
    const necesaria = potOdds + Math.max(-0.02, margen);
    const puedeSubir = legales.puedeSubir || legales.puedeApostar;

    // Mano muy fuerte: subir por valor (y a veces todo el stack)
    if (rel >= subirMin && puedeSubir && azar < 0.45 * estilo.agresion + 0.15) {
      return apuestaDe(rel > 0.8 ? 0.9 : 0.65, rel > 0.88 && azar < 0.18);
    }
    // Semi-farol: subir con un proyecto fuerte
    if (proyecta && !enRiver && puedeSubir && equity >= necesaria && azar < 0.18 * estilo.agresion) {
      return apuestaDe(0.7, false);
    }
    // Con las cuentas a favor, igualamos
    if (equity >= necesaria) {
      return legales.puedeIgualar ? { tipo: "igualar" } : pagarOPasar();
    }
    // Proyecto que con las probabilidades implícitas casi compensa
    if (proyecta && !enRiver && equity + 0.07 >= necesaria && porIgualar <= (bote + 1) * 0.5) {
      return legales.puedeIgualar ? { tipo: "igualar" } : pagarOPasar();
    }
    // Pagar "por curiosidad" a veces cuando la apuesta es pequeña
    if (porIgualar <= bb && azar < 0.2 + estilo.paga * 2) {
      return legales.puedeIgualar ? { tipo: "igualar" } : pagarOPasar();
    }
    return { tipo: "retirarse" };
  }

  const api = {
    NOMBRES_BOT: NOMBRES_BOT,
    nombreBot: nombreBot,
    fuerzaPreflop: fuerzaPreflop,
    fuerzaPostflop: fuerzaPostflop,
    equidad: equidad,
    estiloDe: estiloDe,
    posicionRelativa: posicionRelativa,
    ESTILOS: ESTILOS,
    decidir: decidir
  };

  raiz.PokerBots = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
