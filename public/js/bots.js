/* =========================================================
   INTELIGENCIA DE LOS BOTS
   ---------------------------------------------------------
   Los bots NO hacen trampas: no miran las cartas ocultas
   de nadie ni las cartas que todavía no han salido.

   Su decisión se basa en:
     1) Lo fuerte que es SU mano (o lo buena que era al
        empezar, si todavía no hay flop)
     2) Si tiene "proyectadas" (casi un color o una escalera)
     3) Un poco de azar, para que no sean predecibles
        (a veces farolean, a veces se asustan)
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

  /**
   * Elige una acción legal. Devuelve { tipo, cantidad }.
   * "cantidad" es el total de la ronda (subir a X).
   */
  function decidir(legales, jugador, estado) {
    if (!legales || !legales.tipos || legales.tipos.length === 0) {
      return { tipo: "pasar" };
    }

    const privadas = (jugador.cartas || []).filter(function (c) { return !c.oculta; });
    const comunitarias = estado.comunitarias || [];
    const fase = estado.fase;
    const fuerza = (fase === "preflop" || comunitarias.length < 3)
      ? fuerzaPreflop(privadas)
      : fuerzaPostflop(privadas, comunitarias);

    const azar = Math.random();
    const farol = azar < 0.06;
    const asustado = azar > 0.88;
    const porIgualar = legales.porIgualar || 0;
    const bote = estado.boteTotal || 0;
    const potOdds = porIgualar / (bote + porIgualar + 1);
    const apuestaGrande = porIgualar >= Math.max(estado.ciegaGrande * 6, jugador.fichas * 0.25);

    function subirAlgo(agresivo) {
      const min = legales.minSubida || (estado.apuestaMaxima + (estado.subidaMinima || estado.ciegaGrande));
      const max = legales.maxSubida;
      if (!isFinite(min) || !isFinite(max) || max <= 0) return { tipo: legales.puedeIgualar ? "igualar" : (legales.puedePasar ? "pasar" : "retirarse") };
      let objetivo;
      // All-in solo con manos realmente fuertes y muy de vez en cuando
      if (agresivo && fuerza > 0.93 && azar < 0.12) {
        objetivo = max;
      } else if ((estado.fase === "preflop" || (estado.comunitarias || []).length === 0) && (estado.apuestaMaxima || 0) <= (estado.ciegaGrande || 10)) {
        // Apertura clásica: entre 2.5 y 4 ciegas grandes
        const bb = estado.ciegaGrande || 10;
        objetivo = bb * (agresivo ? 4 : 3);
      } else {
        const boteTras = bote + porIgualar;
        const tamano = agresivo ? 0.65 : 0.45;
        objetivo = Math.round((estado.apuestaMaxima || 0) + Math.max(estado.ciegaGrande, boteTras * tamano));
        // Tope: no más de un tercio de las fichas en una sola subida (salvo all-in raro de arriba)
        const tope = jugador.apuestaRonda + Math.max(min, Math.floor(jugador.fichas * 0.35));
        objetivo = Math.min(objetivo, tope);
      }
      objetivo = Math.max(min, Math.min(max, objetivo));
      if (objetivo >= max && fuerza < 0.9) objetivo = Math.max(min, max - 1);
      if (objetivo >= max) return { tipo: "all-in" };
      return { tipo: legales.puedeApostar ? "apostar" : "subir", cantidad: objetivo };
    }

    // Si puede pasar (nadie ha apostado, o ya está igualado)
    if (legales.puedePasar) {
      if (asustado) return { tipo: "pasar" };
      const umbralApuesta = (estado.fase === "preflop") ? 0.72 : 0.62;
      if ((fuerza > umbralApuesta || farol) && (legales.puedeApostar || legales.puedeSubir) && azar < 0.4 + fuerza * 0.25) {
        return subirAlgo(fuerza > 0.8);
      }
      return { tipo: "pasar" };
    }

    // Alguien ha apostado: ¿igualamos, subimos o nos retiramos?
    if (asustado && fuerza < 0.75 && apuestaGrande) {
      return { tipo: "retirarse" };
    }

    if (fuerza < 0.22 && !farol) {
      if (apuestaGrande || (potOdds > 0.35 && fuerza < 0.3)) {
        return { tipo: "retirarse" };
      }
    }

    if (fuerza < 0.35 && apuestaGrande && !farol && azar < 0.7) {
      return { tipo: "retirarse" };
    }

    if ((fuerza > 0.78 || farol) && (legales.puedeSubir || legales.puedeApostar) && azar < 0.5 + fuerza * 0.25) {
      return subirAlgo(true);
    }

    if (legales.puedeIgualar) return { tipo: "igualar" };
    if (legales.puedePasar) return { tipo: "pasar" };
    if (legales.puedeAllIn && fuerza > 0.92 && apuestaGrande) return { tipo: "all-in" };
    return { tipo: "retirarse" };
  }

  const api = {
    NOMBRES_BOT: NOMBRES_BOT,
    nombreBot: nombreBot,
    fuerzaPreflop: fuerzaPreflop,
    fuerzaPostflop: fuerzaPostflop,
    decidir: decidir
  };

  raiz.PokerBots = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
