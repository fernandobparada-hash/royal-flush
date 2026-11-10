/* =========================================================
   EVALUADOR DE MANOS — Texas Hold'em
   ---------------------------------------------------------
   En el Hold'em cada jugador tiene 2 cartas privadas y
   comparte 5 cartas comunitarias (7 en total). Gana quien
   forme la MEJOR mano de 5 cartas con esas 7.

   Este archivo:
   - Crea y baraja el mazo de 52 cartas
   - Puntúa una mano de 5 cartas
   - Elige la mejor combinación de 5 entre 5, 6 o 7 cartas
   - Compara dos manos para decidir un ganador (o un empate)

   Funciona en el navegador y también en Node.js (pruebas
   y servidor), sin librerías externas.
   ========================================================= */

(function (raiz) {
  "use strict";

  const PALOS = [
    { simbolo: "♠", color: "negra", nombre: "picas" },
    { simbolo: "♥", color: "roja", nombre: "corazones" },
    { simbolo: "♦", color: "roja", nombre: "diamantes" },
    { simbolo: "♣", color: "negra", nombre: "tréboles" }
  ];

  const VALORES = [
    { numero: 2, texto: "2" },
    { numero: 3, texto: "3" },
    { numero: 4, texto: "4" },
    { numero: 5, texto: "5" },
    { numero: 6, texto: "6" },
    { numero: 7, texto: "7" },
    { numero: 8, texto: "8" },
    { numero: 9, texto: "9" },
    { numero: 10, texto: "10" },
    { numero: 11, texto: "J" },
    { numero: 12, texto: "Q" },
    { numero: 13, texto: "K" },
    { numero: 14, texto: "A" }
  ];

  // De menor a mayor. El número se usa para comparar manos.
  const CATEGORIAS = {
    CARTA_ALTA: 0,
    PAR: 1,
    DOBLE_PAR: 2,
    TRIO: 3,
    ESCALERA: 4,
    COLOR: 5,
    FULL: 6,
    POKER: 7,
    ESCALERA_COLOR: 8,
    ESCALERA_REAL: 9
  };

  const NOMBRES_CATEGORIA = {
    0: "Carta alta",
    1: "Par",
    2: "Doble par",
    3: "Trío",
    4: "Escalera",
    5: "Color",
    6: "Full",
    7: "Póker",
    8: "Escalera de color",
    9: "Escalera real"
  };

  function crearMazo() {
    const mazo = [];
    for (let i = 0; i < PALOS.length; i++) {
      for (let j = 0; j < VALORES.length; j++) {
        mazo.push({
          numero: VALORES[j].numero,
          texto: VALORES[j].texto,
          palo: PALOS[i].simbolo,
          color: PALOS[i].color,
          nombrePalo: PALOS[i].nombre
        });
      }
    }
    return mazo;
  }

  /** Baraja una copia del mazo (algoritmo de Fisher-Yates). */
  function barajar(mazo, aleatorio) {
    const rnd = aleatorio || Math.random;
    const mezclado = mazo.slice();
    for (let i = mezclado.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = mezclado[i];
      mezclado[i] = mezclado[j];
      mezclado[j] = tmp;
    }
    return mezclado;
  }

  function numerosOrdenados(cartas) {
    const nums = [];
    for (let i = 0; i < cartas.length; i++) nums.push(cartas[i].numero);
    nums.sort(function (a, b) { return b - a; });
    return nums;
  }

  function contarValores(cartas) {
    const conteo = {};
    for (let i = 0; i < cartas.length; i++) {
      const n = cartas[i].numero;
      conteo[n] = (conteo[n] || 0) + 1;
    }
    return conteo;
  }

  function esMismoPalo(cartas) {
    const palo = cartas[0].palo;
    for (let i = 1; i < cartas.length; i++) {
      if (cartas[i].palo !== palo) return false;
    }
    return true;
  }

  /**
   * Devuelve la carta más alta de la escalera, o 0 si no lo es.
   * La escalera A-2-3-4-5 cuenta como 5 (el As es bajo).
   * K-A-2-3-4 NO es escalera.
   */
  function altoDeEscalera(cartas) {
    const unicos = [];
    const visto = {};
    for (let i = 0; i < cartas.length; i++) {
      const n = cartas[i].numero;
      if (!visto[n]) {
        visto[n] = true;
        unicos.push(n);
      }
    }
    if (unicos.length !== 5) return 0;
    unicos.sort(function (a, b) { return a - b; });

    if (unicos[4] - unicos[0] === 4) return unicos[4];

    // Rueda: 2, 3, 4, 5, 14 (As)
    if (
      unicos[0] === 2 &&
      unicos[1] === 3 &&
      unicos[2] === 4 &&
      unicos[3] === 5 &&
      unicos[4] === 14
    ) {
      return 5;
    }
    return 0;
  }

  /**
   * Puntúa exactamente 5 cartas.
   * "clave" es un array que sirve para desempatar:
   * primero la categoría y luego los valores en orden de importancia.
   */
  function puntuarCinco(cartas) {
    if (!cartas || cartas.length !== 5) {
      throw new Error("puntuarCinco necesita exactamente 5 cartas.");
    }

    const conteo = contarValores(cartas);
    const grupos = [];
    for (const numTexto in conteo) {
      grupos.push({ numero: Number(numTexto), cantidad: conteo[numTexto] });
    }
    // Primero los grupos más grandes; si empatan, el valor más alto
    grupos.sort(function (a, b) {
      if (b.cantidad !== a.cantidad) return b.cantidad - a.cantidad;
      return b.numero - a.numero;
    });

    const color = esMismoPalo(cartas);
    const altoEsc = altoDeEscalera(cartas);
    const escalera = altoEsc > 0;

    let categoria;
    let desempate;

    if (color && escalera && altoEsc === 14) {
      categoria = CATEGORIAS.ESCALERA_REAL;
      desempate = [14];
    } else if (color && escalera) {
      categoria = CATEGORIAS.ESCALERA_COLOR;
      desempate = [altoEsc];
    } else if (grupos[0].cantidad === 4) {
      categoria = CATEGORIAS.POKER;
      desempate = [grupos[0].numero, grupos[1].numero];
    } else if (grupos[0].cantidad === 3 && grupos[1] && grupos[1].cantidad === 2) {
      categoria = CATEGORIAS.FULL;
      desempate = [grupos[0].numero, grupos[1].numero];
    } else if (color) {
      categoria = CATEGORIAS.COLOR;
      desempate = numerosOrdenados(cartas);
    } else if (escalera) {
      categoria = CATEGORIAS.ESCALERA;
      desempate = [altoEsc];
    } else if (grupos[0].cantidad === 3) {
      categoria = CATEGORIAS.TRIO;
      desempate = [grupos[0].numero, grupos[1].numero, grupos[2].numero];
    } else if (grupos[0].cantidad === 2 && grupos[1] && grupos[1].cantidad === 2) {
      categoria = CATEGORIAS.DOBLE_PAR;
      // grupos ya tiene el par más alto primero (mismo tamaño, mayor valor)
      desempate = [grupos[0].numero, grupos[1].numero, grupos[2].numero];
    } else if (grupos[0].cantidad === 2) {
      categoria = CATEGORIAS.PAR;
      desempate = [grupos[0].numero];
      for (let i = 1; i < grupos.length; i++) desempate.push(grupos[i].numero);
    } else {
      categoria = CATEGORIAS.CARTA_ALTA;
      desempate = numerosOrdenados(cartas);
    }

    return {
      categoria: categoria,
      nombre: NOMBRES_CATEGORIA[categoria],
      desempate: desempate,
      cartas: cartas.slice()
    };
  }

  /** Compara dos resultados de puntuarCinco. >0 gana A, <0 gana B, 0 empate. */
  function compararPuntuaciones(a, b) {
    if (a.categoria !== b.categoria) return a.categoria - b.categoria;
    const n = Math.max(a.desempate.length, b.desempate.length);
    for (let i = 0; i < n; i++) {
      const va = a.desempate[i] || 0;
      const vb = b.desempate[i] || 0;
      if (va !== vb) return va - vb;
    }
    return 0;
  }

  /** Todas las formas de elegir k elementos de un array (sin repetir). */
  function combinaciones(arr, k) {
    const out = [];
    function rec(inicio, combo) {
      if (combo.length === k) {
        out.push(combo.slice());
        return;
      }
      for (let i = inicio; i <= arr.length - (k - combo.length); i++) {
        combo.push(arr[i]);
        rec(i + 1, combo);
        combo.pop();
      }
    }
    rec(0, []);
    return out;
  }

  /**
   * Mejor mano de 5 cartas posible usando 5, 6 o 7 cartas.
   * En Hold'em se llama con las 2 privadas + las comunitarias.
   */
  function mejorMano(cartas) {
    if (!cartas || cartas.length < 5) {
      throw new Error("Se necesitan al menos 5 cartas para evaluar la mano.");
    }
    if (cartas.length === 5) return puntuarCinco(cartas);

    const combos = combinaciones(cartas, 5);
    let mejor = puntuarCinco(combos[0]);
    for (let i = 1; i < combos.length; i++) {
      const actual = puntuarCinco(combos[i]);
      if (compararPuntuaciones(actual, mejor) > 0) mejor = actual;
    }
    return mejor;
  }

  /** Nombre más descriptivo: "Par de ases", "Full de reyes y doses", etc. */
  function describirMano(resultado) {
    if (!resultado) return "Sin mano";
    const d = resultado.desempate;
    const t = textoDeNumero;

    switch (resultado.categoria) {
      case CATEGORIAS.ESCALERA_REAL:
        return "Escalera real";
      case CATEGORIAS.ESCALERA_COLOR:
        return "Escalera de color al " + t(d[0]);
      case CATEGORIAS.POKER:
        return "Póker de " + t(d[0], true);
      case CATEGORIAS.FULL:
        return "Full de " + t(d[0], true) + " y " + t(d[1], true);
      case CATEGORIAS.COLOR:
        return "Color al " + t(d[0]);
      case CATEGORIAS.ESCALERA:
        return "Escalera al " + t(d[0]);
      case CATEGORIAS.TRIO:
        return "Trío de " + t(d[0], true);
      case CATEGORIAS.DOBLE_PAR:
        return "Doble par de " + t(d[0], true) + " y " + t(d[1], true);
      case CATEGORIAS.PAR:
        return "Par de " + t(d[0], true);
      default:
        return "Carta alta: " + t(d[0]);
    }
  }

  function textoDeNumero(n, plural) {
    const mapa = {
      14: plural ? "ases" : "as",
      13: plural ? "reyes" : "rey",
      12: plural ? "reinas" : "reina",
      11: plural ? "jotas" : "jota",
      10: plural ? "dieces" : "diez"
    };
    if (mapa[n]) return mapa[n];
    return String(n);
  }

  /**
   * Detecta posibles proyectadas (draws) con 5 o 6 cartas:
   * color (4 del mismo palo) o escalera abierta / gutshot.
   * Sirve para que los bots tomen decisiones más razonables.
   */
  function detectarProyectadas(cartas) {
    const info = { color: false, escaleraAbierta: false, gutshot: false, palos: {}, outs: 0 };
    if (!cartas || cartas.length < 5) return info;

    const porPalo = {};
    for (let i = 0; i < cartas.length; i++) {
      const p = cartas[i].palo;
      porPalo[p] = (porPalo[p] || 0) + 1;
    }
    info.palos = porPalo;
    for (const p in porPalo) {
      if (porPalo[p] === 4) info.color = true;
    }

    const unicos = [];
    const visto = {};
    for (let i = 0; i < cartas.length; i++) {
      if (!visto[cartas[i].numero]) {
        visto[cartas[i].numero] = true;
        unicos.push(cartas[i].numero);
      }
    }
    unicos.sort(function (a, b) { return a - b; });

    // El As también cuenta como 1 para la rueda
    if (visto[14] && !visto[1]) unicos.unshift(1);

    // Buscamos 4 valores en una ventana de 5 (abierta o gutshot)
    for (let alto = 5; alto <= 14; alto++) {
      const bajo = alto - 4;
      let dentro = 0;
      for (let v = bajo; v <= alto; v++) {
        const real = v === 1 ? 1 : v;
        if (visto[real] || (real === 1 && visto[14])) dentro += 1;
      }
      if (dentro === 4) {
        // Si faltan los extremos (o uno de ellos es hueco interior)
        const faltaBajo = !(visto[bajo] || (bajo === 1 && visto[14]));
        const faltaAlto = !visto[alto];
        if (faltaBajo || faltaAlto) {
          // Si el hueco está en un extremo y el otro extremo está, es abierta
          // (excepto A-alta / rueda, que nunca es realmente abierta por los dos lados)
          if ((faltaBajo && !faltaAlto) || (!faltaBajo && faltaAlto)) {
            if (alto !== 14 && bajo !== 1) info.escaleraAbierta = true;
            else info.gutshot = true;
          } else {
            info.gutshot = true;
          }
        }
      }
    }

    if (info.color) info.outs += 9;
    if (info.escaleraAbierta) info.outs += 8;
    else if (info.gutshot) info.outs += 4;
    return info;
  }

  const api = {
    PALOS: PALOS,
    VALORES: VALORES,
    CATEGORIAS: CATEGORIAS,
    NOMBRES_CATEGORIA: NOMBRES_CATEGORIA,
    crearMazo: crearMazo,
    barajar: barajar,
    puntuarCinco: puntuarCinco,
    compararPuntuaciones: compararPuntuaciones,
    mejorMano: mejorMano,
    describirMano: describirMano,
    detectarProyectadas: detectarProyectadas,
    combinaciones: combinaciones,
    textoDeNumero: textoDeNumero
  };

  raiz.PokerEvaluador = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
