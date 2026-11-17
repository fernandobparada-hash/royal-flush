/* =========================================================
   MONEDAS Y TIENDA (solo cosmético, sin dinero real)
   ---------------------------------------------------------
   Monedero: { saldo, comprados[], tema, dorso, sonido, ganadoTotal,
   racha, mejorRacha }.
   Se guarda en el aparato (localStorage) y, como respaldo, en
   el servidor (Key Value) con un código de monedero.
   ========================================================= */
(function (raiz, factory) {
  const Avatar = (typeof module === "object" && module.exports) ? require("./avatar.js") : raiz.PokerAvatar;
  const api = factory(Avatar);
  if (typeof module === "object" && module.exports) module.exports = api;
  raiz.PokerTienda = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Avatar) {
  "use strict";

  const SALDO_INICIAL = 100;
  const CODIGO_TRUCO = "3174";        // +1000 monedas cada vez que se escribe (sin límite)
  const PREMIO_TRUCO = 1000;
  const MAX_SALDO = 1e9;

  /* Reglas de monedas (v12.1, las de Fernando) */
  const REGLAS = {
    inicial: 100,
    porMano: 1, topeManosDia: 100,        // +1 por mano jugada, hasta 100 al día por manos
    ganarMano: 5, showdownTrioOMas: 10,   // +5 por ganar; +10 más si fue en showdown con trío o mejor
    partida1: 25, partida2: 10,           // ganar la partida o el torneo / 2.º puesto
    bonoDiario: 50, bonoPorDia: 10, bonoMax: 100,
    logros: { poker: 100, "escalera-color": 200, "escalera-real": 500 }
  };
  const TRIO = 3, POKER = 7, ESCALERA_COLOR = 8, ESCALERA_REAL = 9;
  const NOMBRE_LOGRO = { poker: "Primer póker", "escalera-color": "Primera escalera de color", "escalera-real": "Primer Royal Flush" };

  const TEMAS = [
    { id: "tema:clasico", nombre: "Paño clásico", precio: 0, pano: "#1f8a50", pano2: "#0f5a32", borde: "#5a2e14" },
    { id: "tema:azul", nombre: "Azul casino", precio: 150, pano: "#1f6fb2", pano2: "#0d3a66", borde: "#2a2f3a" },
    { id: "tema:vino", nombre: "Vino tinto", precio: 150, pano: "#9b2335", pano2: "#56101c", borde: "#3a1a10" },
    { id: "tema:purpura", nombre: "Noche púrpura", precio: 200, pano: "#6a3fb5", pano2: "#2e1563", borde: "#1c1430" },
    { id: "tema:aguayo", nombre: "Aguayo andino", precio: 300, pano: "#c0392b", pano2: "#7b1f16", borde: "#2b5f3a", aguayo: true },
    { id: "tema:oro", nombre: "Negro y oro", precio: 400, pano: "#2a2a2a", pano2: "#0b0b0b", borde: "#b8860b" }
  ];
  const DORSOS = [
    { id: "dorso:azul", nombre: "Azul clásico", precio: 0, c1: "#1d3f8f", c2: "#0f2357", linea: "#e9c46a" },
    { id: "dorso:rojo", nombre: "Rojo", precio: 100, c1: "#b3202f", c2: "#5e0e17", linea: "#f4e3b2" },
    { id: "dorso:verde", nombre: "Verde", precio: 100, c1: "#1f7a46", c2: "#0c3d22", linea: "#e9c46a" },
    { id: "dorso:negro", nombre: "Negro", precio: 150, c1: "#2b2b2b", c2: "#0a0a0a", linea: "#c0c0c0" },
    { id: "dorso:aguayo", nombre: "Aguayo", precio: 250, c1: "#c0392b", c2: "#1e8449", linea: "#f1c40f", aguayo: true },
    { id: "dorso:oro", nombre: "Dorado", precio: 300, c1: "#f2c14e", c2: "#9a6b06", linea: "#fff6c8" }
  ];

  // Temas de sonido: se fabrican con Web Audio (ver sonidos.js), no hay archivos
  const SONIDOS = [
    { id: "sonido:clasico", nombre: "Clásico", precio: 0, desc: "Clics de cartas y fichas de siempre." },
    { id: "sonido:vegas", nombre: "Casino Vegas", precio: 200, desc: "Campanitas brillantes con eco de salón." },
    { id: "sonido:retro", nombre: "Retro 8-bit", precio: 150, desc: "Pitidos de consola de los 80." },
    { id: "sonido:fiesta", nombre: "Fiesta", precio: 250, desc: "Alegre, con silbato y matracas." },
    { id: "sonido:minimal", nombre: "Minimal", precio: 100, desc: "Tonos suaves y bajitos, sin adornos." }
  ];
  // Temas viejos de la v12 (por si alguien ya los compró): se pasan a los nuevos
  const SONIDOS_VIEJOS = { "sonido:casino": "sonido:vegas", "sonido:arcade": "sonido:retro", "sonido:suave": "sonido:minimal", "sonido:andino": "sonido:fiesta" };

  function catalogo() {
    const lista = [];
    Avatar.piezasDePago().forEach(function (p) { lista.push(Object.assign({ tipo: "avatar" }, p)); });
    TEMAS.forEach(function (t) { lista.push(Object.assign({ tipo: "tema" }, t)); });
    DORSOS.forEach(function (d) { lista.push(Object.assign({ tipo: "dorso" }, d)); });
    SONIDOS.forEach(function (d) { lista.push(Object.assign({ tipo: "sonido" }, d)); });
    return lista;
  }
  const POR_ID = {};
  catalogo().forEach(function (it) { POR_ID[it.id] = it; });

  function item(id) { return POR_ID[id] || null; }
  function precioDe(id) { const it = item(id); return it ? it.precio : null; }

  function nuevoMonedero() {
    return { v: 1, saldo: SALDO_INICIAL, comprados: [], tema: "tema:clasico", dorso: "dorso:azul", sonido: "sonido:clasico", ganadoTotal: 0, manos: 0, racha: 0, mejorRacha: 0,
      dia: "", manosHoy: 0, ultimoBono: "", diasSeguidos: 0, logros: [], restoSolo: 0 };
  }

  /** Limpia un monedero que viene de afuera (localStorage o servidor). */
  function normalizar(m) {
    const base = nuevoMonedero();
    if (!m || typeof m !== "object") return base;
    const saldo = Math.floor(Number(m.saldo));
    base.saldo = isFinite(saldo) ? Math.max(0, Math.min(MAX_SALDO, saldo)) : SALDO_INICIAL;
    base.comprados = Array.isArray(m.comprados)
      ? m.comprados.map(function (id) { return SONIDOS_VIEJOS[id] || id; }).filter(function (id, i, arr) { return typeof id === "string" && POR_ID[id] && arr.indexOf(id) === i; })
      : [];
    base.tema = tiene(base, m.tema) ? m.tema : "tema:clasico";
    base.dorso = tiene(base, m.dorso) ? m.dorso : "dorso:azul";
    const son = SONIDOS_VIEJOS[m.sonido] || m.sonido;
    base.sonido = tiene(base, son) ? son : "sonido:clasico";
    const fecha = function (x) { return typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : ""; };
    const entero = function (x, max) { return Math.max(0, Math.min(max, Math.floor(Number(x) || 0))); };
    base.dia = fecha(m.dia);
    base.manosHoy = entero(m.manosHoy, REGLAS.topeManosDia);
    base.ultimoBono = fecha(m.ultimoBono);
    base.diasSeguidos = entero(m.diasSeguidos, 100000);
    base.logros = Array.isArray(m.logros) ? m.logros.filter(function (l, i, arr) { return REGLAS.logros[l] && arr.indexOf(l) === i; }) : [];
    base.restoSolo = entero(m.restoSolo, 1);
    base.ganadoTotal = Math.max(0, Math.floor(Number(m.ganadoTotal) || 0));
    base.racha = Math.max(0, Math.min(1e6, Math.floor(Number(m.racha) || 0)));
    base.mejorRacha = Math.max(base.racha, Math.min(1e6, Math.floor(Number(m.mejorRacha) || 0)));
    base.manos = Math.max(0, Math.floor(Number(m.manos) || 0));
    return base;
  }

  function tiene(m, id) {
    const it = item(id);
    if (!it) return false;
    return it.precio === 0 || (m.comprados || []).indexOf(id) >= 0;
  }

  function tienePieza(m, campo, valor) {
    const p = Avatar.precio(campo, valor);
    return p === 0 || (m.comprados || []).indexOf("avatar:" + campo + ":" + valor) >= 0;
  }

  /** Piezas del avatar que todavía no se compraron. */
  function piezasBloqueadas(m, avatar) {
    const a = Avatar.normalizar(avatar);
    return Avatar.ORDEN.filter(function (c) { return !tienePieza(m, c, a[c]); })
      .map(function (c) { return { campo: c, valor: a[c], id: "avatar:" + c + ":" + a[c], precio: Avatar.precio(c, a[c]) }; });
  }

  /** Avatar sin lo que no se compró (se usa al sentarse en la mesa). */
  function avatarPermitido(m, avatar) {
    const a = Avatar.normalizar(avatar);
    piezasBloqueadas(m, a).forEach(function (p) { a[p.campo] = 0; });
    return a;
  }

  function ganar(m, cantidad) {
    cantidad = Math.max(0, Math.floor(Number(cantidad) || 0));
    m.saldo = Math.min(MAX_SALDO, m.saldo + cantidad);
    m.ganadoTotal += cantidad;
    return m;
  }

  /** Fecha local "AAAA-MM-DD" (el día cambia a medianoche del aparato). */
  function fechaLocal(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function diaAnterior(hoy) {
    const p = hoy.split("-").map(Number);
    return fechaLocal(new Date(p[0], p[1] - 1, p[2] - 1));
  }

  /**
   * En solo se gana la mitad, redondeando hacia abajo. La media moneda que sobra
   * se guarda (restoSolo) para la próxima: dos manos solo = 1 moneda.
   */
  function mitadSolo(m, n) {
    const total = (m.restoSolo || 0) + n;
    m.restoSolo = total % 2;
    return Math.floor(total / 2);
  }

  function acreditar(m, partes, solo) {
    const bruto = partes.reduce(function (s, p) { return s + p.n; }, 0);
    const n = solo ? mitadSolo(m, bruto) : bruto;
    if (n > 0) ganar(m, n);
    return { n: n, bruto: bruto, partes: partes, solo: !!solo };
  }

  /**
   * Monedas de una mano terminada. r = {
   *   jugo: te repartieron cartas, gano: ganaste (o repartiste) un bote,
   *   showdown: se mostraron las cartas, categoria: tu mejor jugada (0-9) o -1 si te retiraste,
   *   solo: partida contra bots }.  hoy: "AAAA-MM-DD".
   * Cambia el monedero y devuelve { n, partes: [{ motivo, n }], logros: [...] }.
   */
  function premioMano(m, r, hoy) {
    hoy = hoy || fechaLocal();
    const partes = [];
    const logros = [];
    if (!r || !r.jugo) return { n: 0, bruto: 0, partes: partes, logros: logros };
    if (m.dia !== hoy) { m.dia = hoy; m.manosHoy = 0; }
    if (m.manosHoy < REGLAS.topeManosDia) {
      m.manosHoy++;
      partes.push({ motivo: "mano jugada", n: REGLAS.porMano });
    }
    const cat = typeof r.categoria === "number" ? r.categoria : -1;
    if (r.gano) {
      partes.push({ motivo: "ganaste la mano", n: REGLAS.ganarMano });
      if (r.showdown && cat >= TRIO) partes.push({ motivo: "showdown con trío o mejor", n: REGLAS.showdownTrioOMas });
    }
    // Logros: la primera vez que llegás al final de una mano con esa jugada
    const logro = cat === ESCALERA_REAL ? "escalera-real" : cat === ESCALERA_COLOR ? "escalera-color" : cat === POKER ? "poker" : null;
    if (logro && m.logros.indexOf(logro) < 0) {
      m.logros.push(logro);
      logros.push(logro);
      partes.push({ motivo: "logro: " + NOMBRE_LOGRO[logro], n: REGLAS.logros[logro] });
    }
    m.manos++;
    const res = acreditar(m, partes, r.solo);
    res.logros = logros;
    return res;
  }

  /** Puesto final en una partida o torneo: 1 → +25, 2 → +10 (la mitad en solo). */
  function premioPartida(m, puesto, solo) {
    const n = puesto === 1 ? REGLAS.partida1 : puesto === 2 ? REGLAS.partida2 : 0;
    if (!n) return { n: 0, bruto: 0, partes: [] };
    return acreditar(m, [{ motivo: puesto === 1 ? "ganaste la partida" : "2.º puesto", n: n }], solo);
  }

  /**
   * Bono diario: +50 el primer día; cada día seguido suma +10 más, hasta +100.
   * Devuelve null si hoy ya se cobró.
   */
  function bonoDiario(m, hoy) {
    hoy = hoy || fechaLocal();
    if (m.ultimoBono === hoy) return null;
    m.diasSeguidos = m.ultimoBono === diaAnterior(hoy) ? (m.diasSeguidos || 0) + 1 : 1;
    m.ultimoBono = hoy;
    const n = Math.min(REGLAS.bonoMax, REGLAS.bonoDiario + REGLAS.bonoPorDia * (m.diasSeguidos - 1));
    ganar(m, n);
    return { n: n, dias: m.diasSeguidos };
  }

  function comprar(m, id) {
    const it = item(id);
    if (!it) return { ok: false, error: "Ese artículo no existe." };
    if (tiene(m, id)) return { ok: false, error: "Ya lo tenés." };
    if (m.saldo < it.precio) return { ok: false, error: "Te faltan " + (it.precio - m.saldo) + " monedas.", falta: it.precio - m.saldo };
    m.saldo -= it.precio;
    m.comprados.push(id);
    return { ok: true, item: it };
  }

  function equipar(m, id) {
    const it = item(id);
    if (!it || !tiene(m, id)) return false;
    if (it.tipo === "tema") m.tema = id;
    else if (it.tipo === "dorso") m.dorso = id;
    else if (it.tipo === "sonido") m.sonido = id;
    else return false;
    return true;
  }

  /**
   * Racha de manos ganadas seguidas (no da monedas extra: solo se cuenta).
   * r = { jugo, gano, retiro, gratis }:
   *  - ganar (o repartir el bote) suma 1;
   *  - perder en showdown o retirarse después de poner fichas por voluntad corta la racha;
   *  - retirarse "gratis" (sin poner más que la ciega obligatoria) no la corta ni la suma;
   *  - las manos en que no te repartieron cartas no cuentan.
   * Devuelve { racha, mejor, nueva: true si es un récord, cambio: "+1" | "corte" | "igual" }.
   */
  function registrarRacha(m, r) {
    let cambio = "igual";
    if (r && r.jugo) {
      if (r.gano) { m.racha = (m.racha || 0) + 1; cambio = "+1"; }
      else if (!(r.retiro && r.gratis)) { if (m.racha) cambio = "corte"; m.racha = 0; }
    }
    const nueva = m.racha > (m.mejorRacha || 0);
    if (nueva) m.mejorRacha = m.racha;
    return { racha: m.racha, mejor: m.mejorRacha, nueva: nueva, cambio: cambio };
  }

  /** Códigos: 3174 da +1000 cada vez, sin límite. */
  function canjear(m, codigo) {
    const c = String(codigo || "").replace(/\s+/g, "");
    if (c === CODIGO_TRUCO) {
      ganar(m, PREMIO_TRUCO);
      return { ok: true, monedas: PREMIO_TRUCO, mensaje: "¡+" + PREMIO_TRUCO + " monedas!" };
    }
    return { ok: false, mensaje: "Ese código no existe." };
  }

  function formatear(n) {
    return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  return {
    SALDO_INICIAL: SALDO_INICIAL, TEMAS: TEMAS, DORSOS: DORSOS, SONIDOS: SONIDOS, CODIGO_TRUCO: CODIGO_TRUCO,
    registrarRacha: registrarRacha, REGLAS: REGLAS, NOMBRE_LOGRO: NOMBRE_LOGRO,
    fechaLocal: fechaLocal, premioPartida: premioPartida, bonoDiario: bonoDiario,
    catalogo: catalogo, item: item, precioDe: precioDe,
    nuevoMonedero: nuevoMonedero, normalizar: normalizar, tiene: tiene, tienePieza: tienePieza,
    piezasBloqueadas: piezasBloqueadas, avatarPermitido: avatarPermitido,
    ganar: ganar, premioMano: premioMano, comprar: comprar, equipar: equipar, canjear: canjear, formatear: formatear
  };
});
