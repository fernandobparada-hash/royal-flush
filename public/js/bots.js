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
    const per = personalidadDe(jugador);
    if (per) return per.estilo;
    if (jugador && jugador.estiloBot && ESTILOS[jugador.estiloBot]) return ESTILOS[jugador.estiloBot];
    const clave = jugador ? (jugador.nombre || jugador.id) : "";
    return ESTILOS[LISTA_ESTILOS[hashTexto(clave) % LISTA_ESTILOS.length]];
  }

  /* ---------------------------------------------------------
     PERSONALIDADES (v12)
     Cada bot es un personaje: nombre, carácter, forma de hablar
     y reglas de juego propias, encima de los parámetros de estilo.
     --------------------------------------------------------- */
  const PERSONALIDADES = {
    roca: {
      id: "roca", etiqueta: "🪨 Roca", tipo: "Tight-pasivo",
      descripcion: "Solo juega manos premium y casi nunca farolea. Si sube, tiene algo.",
      nombres: ["Roque", "Petrona", "Anselmo"],
      estilo: { nombre: "roca", selectividad: 0.17, agresion: 0.6, farol: 0.0, paga: -0.06 },
      frases: { saludo: ["Paciencia nomás.", "Buenas, a esperar cartas."], subir: ["Ahora sí, hermano."], pagar: ["Pago, pero con cuidado."], retirarse: ["Esa no es para mí.", "Me retiro, no hay apuro."], ganar: ["La paciencia paga.", "Te dije, cartas buenas nomás."], allin: ["Tengo todo, cumpa."] }
    },
    tiburon: {
      id: "tiburon", etiqueta: "🦈 Tiburón", tipo: "Tight-agresivo (pro)",
      descripcion: "Selectivo pero cuando entra, ataca. Usa la posición y lee la mesa.",
      nombres: ["Ximena", "Iván", "Rebeca"],
      estilo: { nombre: "tiburon", selectividad: 0.07, agresion: 1.5, farol: 0.08, paga: -0.02 },
      frases: { saludo: ["Que empiece la clase."], subir: ["Subo. Pensalo bien.", "Esto es matemática, ¿ya?"], pagar: ["Veo."], retirarse: ["Hoy te la dejo."], ganar: ["Gracias por las fichas.", "Te leí, cumpa."], allin: ["Todo adentro. Decidí."] }
    },
    maniaco: {
      id: "maniaco", etiqueta: "🤪 Loco", tipo: "Maniaco",
      descripcion: "Sube casi todo, con cualquier cosa. Imposible de leer y un peligro para su stack.",
      nombres: ["Wilber", "Jhoselin", "Tito"],
      estilo: { nombre: "maniaco", selectividad: -0.3, agresion: 2.2, farol: 0.35, paga: 0.1 },
      frases: { saludo: ["¡Hoy no me retiro ni a palos!"], subir: ["¡Subo! ¡Subo todo!", "¡A la carga, pues!"], pagar: ["Dale nomás."], retirarse: ["¡¿Qué?! Bueno, esta sí."], ganar: ["¡Jajaja, lo sabía!", "¡Así se juega, carajo!"], allin: ["¡ALL IN, wawitas!"] }
    },
    pagador: {
      id: "pagador", etiqueta: "📞 Pagador", tipo: "Calling station",
      descripcion: "Paga todo para ver qué tenés. Casi nunca se retira y casi nunca sube.",
      nombres: ["Gumercindo", "Chela", "Pancho"],
      estilo: { nombre: "pagador", selectividad: -0.2, agresion: 0.3, farol: 0.0, paga: 0.35 },
      frases: { saludo: ["Yo vengo a ver cartas."], subir: ["Bueno, ya, subo un poquito."], pagar: ["Te pago nomás, a ver qué tenés.", "Ya, ya, pago."], retirarse: ["Uy, esta vez no."], ganar: ["¡Capaz salía mi carta, viste!"], allin: ["Ya fue, pago todo."] }
    },
    farolero: {
      id: "farolero", etiqueta: "🎭 Farolero", tipo: "Farolero",
      descripcion: "Farolea seguido, sobre todo cuando la mesa da miedo (color o escalera posibles).",
      nombres: ["Chuto", "Marcela", "Cuentero"],
      estilo: { nombre: "farolero", selectividad: -0.03, agresion: 1.25, farol: 0.3, paga: -0.02 },
      frases: { saludo: ["Hoy vengo con suerte."], subir: ["¿Y si tengo color, eh?", "Creeme, tengo todo."], pagar: ["Te veo."], retirarse: ["No te creo, pero bueno."], ganar: ["¿Querés saber qué tenía? 😏", "Ni te imaginás."], allin: ["Mirá esa mesa. Da miedo, ¿no?"] }
    },
    lag: {
      id: "lag", etiqueta: "⚡ LAG", tipo: "Suelto-agresivo",
      descripcion: "Juega muchas manos y las juega fuerte, pero con cabeza.",
      nombres: ["René", "Kathia", "Dani"],
      estilo: { nombre: "lag", selectividad: -0.13, agresion: 1.65, farol: 0.15, paga: 0.03 },
      frases: { saludo: ["A jugar rápido."], subir: ["Subo. ¿Otra vez vos?", "Juego todas, pero con cabeza."], pagar: ["Voy."], retirarse: ["Esta pasa."], ganar: ["Presión, presión."], allin: ["¡Vamos con todo!"] }
    },
    miedoso: {
      id: "miedoso", etiqueta: "😰 Miedoso", tipo: "Tight-pasivo miedoso",
      descripcion: "Juega poco y suelta las manos en cuanto alguien aprieta.",
      nombres: ["Teodoro", "Asunta", "Juancito"],
      estilo: { nombre: "miedoso", selectividad: 0.1, agresion: 0.5, farol: 0.01, paga: -0.15 },
      frases: { saludo: ["Ay, juguemos tranquilos."], subir: ["Subo... ¿está bien?"], pagar: ["Pago, pero me da cosa."], retirarse: ["Uy, mucha plata... me voy.", "Ay, no sé, no sé."], ganar: ["¡¿Gané?! ¡Gané!"], allin: ["¡Ay, Diosito!"] }
    },
    trampero: {
      id: "trampero", etiqueta: "🕸️ Trampero", tipo: "Slow-play y check-raise",
      descripcion: "Con manos monstruo se hace el débil: pasa y después sube (check-raise).",
      nombres: ["Ramiro", "Zoraida", "Zorro"],
      estilo: { nombre: "trampero", selectividad: 0.04, agresion: 1.1, farol: 0.05, paga: 0.02 },
      frases: { saludo: ["Yo solo miro, nomás."], subir: ["¿Apostaste? Qué lástima... subo.", "Caíste, cumpa."], pagar: ["Pago nomás... 😏"], retirarse: ["Me ganaste esta."], ganar: ["La trampa estaba puesta."], allin: ["Te estaba esperando."] }
    },
    novato: {
      id: "novato", etiqueta: "🐣 Novato", tipo: "Novato",
      descripcion: "Está aprendiendo: a veces se equivoca de botón y paga lo que no debe.",
      nombres: ["Brayan", "Daniela", "Kevin"],
      estilo: { nombre: "novato", selectividad: -0.08, agresion: 0.9, farol: 0.08, paga: 0.12 },
      frases: { saludo: ["¿Escalera gana a color?"], subir: ["Ups, apreté mal.", "¿Así se sube?"], pagar: ["Pago, creo."], retirarse: ["¿Me retiré? Bueno."], ganar: ["¡Gané! ¿Gané?"], allin: ["¿Qué hace este botón? 😅"] }
    },
    calculador: {
      id: "calculador", etiqueta: "🧮 Calculador", tipo: "Probabilidades puras",
      descripcion: "Decide solo con números: paga si las odds del bote lo justifican, nunca farolea.",
      nombres: ["Gonzalo", "Carmen", "Odilón"],
      estilo: { nombre: "calculador", selectividad: 0.03, agresion: 1.0, farol: 0.0, paga: 0.0 },
      frases: { saludo: ["Que la estadística nos acompañe."], subir: ["Valor esperado positivo."], pagar: ["Las odds no mienten.", "Equidad suficiente. Pago."], retirarse: ["Matemáticamente, me retiro."], ganar: ["Matemáticamente correcto."], allin: ["Equidad a favor. Todo."] }
    }
  };
  const LISTA_PERSONALIDADES = ["roca", "tiburon", "maniaco", "pagador", "farolero", "lag", "miedoso", "trampero", "novato", "calculador"];

  function personalidadDe(jugador) {
    return jugador && jugador.personalidad && PERSONALIDADES[jugador.personalidad] ? PERSONALIDADES[jugador.personalidad] : null;
  }

  /** Mezcla variada de personalidades para n bots (sin repetir hasta agotar las 10). */
  function repartirPersonalidades(n, rnd) {
    rnd = rnd || Math.random;
    const res = [];
    while (res.length < n) {
      const bolsa = LISTA_PERSONALIDADES.slice();
      for (let i = bolsa.length - 1; i > 0; i--) {
        const k = Math.floor(rnd() * (i + 1));
        const t = bolsa[i]; bolsa[i] = bolsa[k]; bolsa[k] = t;
      }
      for (let i = 0; i < bolsa.length && res.length < n; i++) res.push(bolsa[i]);
    }
    return res;
  }

  /** Nombre y personalidad para un bot nuevo: { nombre, personalidad }. */
  function crearBot(usados, personalidad, rnd) {
    rnd = rnd || Math.random;
    usados = usados || [];
    const per = PERSONALIDADES[personalidad] || PERSONALIDADES[LISTA_PERSONALIDADES[Math.floor(rnd() * LISTA_PERSONALIDADES.length)]];
    const libres = per.nombres.filter(function (n) { return usados.indexOf(n) < 0; });
    let nombre = libres.length ? libres[Math.floor(rnd() * libres.length)] : per.nombres[0] + " " + (usados.length + 1);
    return { nombre: nombre, personalidad: per.id };
  }

  /** Frase corta según el momento: saludo, subir, pagar, retirarse, ganar, allin. */
  function fraseBot(personalidad, momento, rnd) {
    rnd = rnd || Math.random;
    const per = PERSONALIDADES[personalidad];
    if (!per) return null;
    const lista = per.frases[momento];
    if (!lista || !lista.length) return null;
    return lista[Math.floor(rnd() * lista.length)];
  }

  const PROB_CHAT = { saludo: 0.5, subir: 0.16, pagar: 0.08, retirarse: 0.08, ganar: 0.55, allin: 0.6 };
  /**
   * Frase que diría este bot ahora (o null). Respeta una probabilidad por
   * momento para no llenar la mesa de mensajes.
   */
  function chatDeBot(jugador, momento, rnd) {
    rnd = rnd || Math.random;
    if (!jugador || !jugador.personalidad || !PERSONALIDADES[jugador.personalidad]) return null;
    if (rnd() > (PROB_CHAT[momento] || 0)) return null;
    return fraseBot(jugador.personalidad, momento, rnd);
  }
  function momentoDeAccion(tipo) {
    return { igualar: "pagar", apostar: "subir", subir: "subir", "all-in": "allin", retirarse: "retirarse" }[tipo] || null;
  }

  /** ¿La mesa da miedo? (posible color, escalera o mesa doblada) */
  function tableroMiedoso(comunitarias) {
    if (!comunitarias || comunitarias.length < 3) return false;
    const palos = {};
    const nums = {};
    comunitarias.forEach(function (c) { palos[c.palo] = (palos[c.palo] || 0) + 1; nums[c.numero] = (nums[c.numero] || 0) + 1; });
    if (Object.keys(palos).some(function (p) { return palos[p] >= 3; })) return true;
    if (Object.keys(nums).some(function (n) { return nums[n] >= 2; })) return true;
    const orden = Object.keys(nums).map(Number).sort(function (a, b) { return a - b; });
    for (let i = 0; i + 2 < orden.length; i++) if (orden[i + 2] - orden[i] <= 4) return true;
    return false;
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

    // ---- Reglas propias de cada personalidad (antes de la lógica general) ----
    const per = personalidadDe(jugador);
    if (per) {
      const r = reglaPersonalidad(per.id, {
        legales: legales, preflop: preflop, fuerza: fuerza, equity: equity, rel: rel, proyecta: proyecta,
        porIgualar: porIgualar, bote: bote, bb: bb, potOdds: potOdds, azar2: rnd(), rnd: rnd,
        comunitarias: comunitarias, apuestaMaxima: apuestaMaxima,
        apuestaDe: apuestaDe, pagarOPasar: pagarOPasar, soltar: soltar
      });
      if (r) return r;
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

  /**
   * Devuelve una acción si la personalidad tiene una regla para esta situación,
   * o null para seguir con la lógica general (con los parámetros de su estilo).
   */
  function reglaPersonalidad(id, x) {
    const L = x.legales;
    const puedeAgredir = L.puedeApostar || L.puedeSubir;
    const enfrentaApuesta = !L.puedePasar && x.porIgualar > 0;
    const pagar = function () { return L.puedeIgualar ? { tipo: "igualar" } : x.pagarOPasar(); };
    const a = x.azar2;
    switch (id) {
      case "maniaco":
        if (puedeAgredir && a < (x.preflop ? 0.72 : 0.6)) return x.apuestaDe(x.preflop ? 0.9 : 0.8, a < 0.06);
        if (enfrentaApuesta && (x.preflop || x.equity > x.potOdds * 0.5 || a < 0.75)) return pagar();
        return null;
      case "pagador":
        if (enfrentaApuesta) {
          const muyMal = x.preflop ? x.fuerza < 0.14 : (x.equity < 0.06 && x.porIgualar > x.bote);
          if (!muyMal || a < 0.25) return pagar();
          return { tipo: "retirarse" };
        }
        if (x.preflop && L.puedeIgualar) return { tipo: "igualar" };
        if (puedeAgredir && !x.preflop && x.rel > 0.7 && a < 0.3) return x.apuestaDe(0.35, false);
        if (L.puedePasar) return { tipo: "pasar" };
        return null;
      case "calculador": {
        if (x.preflop) {
          if (x.fuerza >= 0.74 && puedeAgredir) return x.apuestaDe(0.7, false);
          if (enfrentaApuesta || L.puedeIgualar) return x.fuerza >= 0.46 + x.potOdds * 0.6 ? pagar() : x.soltar();
          return L.puedePasar ? { tipo: "pasar" } : null;
        }
        if (L.puedePasar) return (x.equity > 0.62 && puedeAgredir) ? x.apuestaDe(0.6, false) : { tipo: "pasar" };
        if (x.equity > 0.78 && puedeAgredir) return x.apuestaDe(0.75, false);
        return x.equity >= x.potOdds + 0.01 ? pagar() : { tipo: "retirarse" };
      }
      case "trampero":
        if (!x.preflop && L.puedePasar && x.rel >= 0.4 && a < 0.85) return { tipo: "pasar" };   // se hace el débil
        if (!x.preflop && enfrentaApuesta && x.rel >= 0.4 && puedeAgredir && a < 0.9) return x.apuestaDe(0.95, x.rel > 0.9 && a < 0.2); // check-raise
        if (x.preflop && x.fuerza >= 0.86 && L.puedeIgualar && x.apuestaMaxima <= x.bb && a < 0.6) return { tipo: "igualar" }; // limp con ases
        return null;
      case "miedoso":
        if (enfrentaApuesta) {
          const grande = x.preflop ? x.porIgualar >= x.bb * 3 : x.porIgualar >= x.bote * 0.35;
          const aguanta = x.preflop ? x.fuerza >= 0.88 : x.rel >= 0.72;
          if (grande && !aguanta) return { tipo: "retirarse" };
        }
        return null;
      case "farolero":
        if (!x.preflop && puedeAgredir && x.rel < 0.35) {
          const miedo = tableroMiedoso(x.comunitarias);
          if (L.puedePasar && a < (miedo ? 0.6 : 0.3)) return x.apuestaDe(miedo ? 0.75 : 0.55, false);
          if (enfrentaApuesta && miedo && a < 0.18) return x.apuestaDe(0.85, false);
        }
        if (x.preflop && puedeAgredir && x.apuestaMaxima <= x.bb && a < 0.25) return x.apuestaDe(0.6, false);
        return null;
      case "novato":
        if (a < 0.2) {
          // Error de principiante: un botón cualquiera de los permitidos (sin all-in)
          const ops = L.tipos.filter(function (t) { return t !== "all-in"; });
          const t = ops[Math.floor(x.rnd() * ops.length)] || "pasar";
          if (t === "apostar" || t === "subir") return x.apuestaDe(0.3 + x.rnd() * 0.7, false);
          return { tipo: t };
        }
        if (enfrentaApuesta && x.porIgualar <= x.bote && a < 0.55) return pagar();
        return null;
      case "lag":
        if (x.preflop && puedeAgredir && x.apuestaMaxima <= x.bb && x.fuerza >= 0.32 && a < 0.6) return x.apuestaDe(0.6, false);
        return null;
      case "tiburon":
        if (x.preflop) {
          if (puedeAgredir && x.fuerza >= 0.68 && a < 0.9) return x.apuestaDe(0.65, x.fuerza > 0.9 && a < 0.1);
          if (x.fuerza < 0.68 && !L.puedePasar) return x.soltar();
          return null;
        }
        if (puedeAgredir && L.puedePasar && (x.rel >= 0.2 || (x.proyecta && a < 0.6))) return x.apuestaDe(0.65, false);
        if (puedeAgredir && enfrentaApuesta && x.rel >= 0.4 && a < 0.8) return x.apuestaDe(0.8, false);
        return null;
      case "roca":
        if (x.preflop && x.fuerza < 0.66) return x.soltar();
        if (!x.preflop && L.puedePasar && x.rel < 0.45) return { tipo: "pasar" };
        return null;
    }
    return null;
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
    PERSONALIDADES: PERSONALIDADES,
    LISTA_PERSONALIDADES: LISTA_PERSONALIDADES,
    personalidadDe: personalidadDe,
    repartirPersonalidades: repartirPersonalidades,
    crearBot: crearBot,
    fraseBot: fraseBot,
    chatDeBot: chatDeBot,
    momentoDeAccion: momentoDeAccion,
    tableroMiedoso: tableroMiedoso,
    decidir: decidir
  };

  raiz.PokerBots = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
