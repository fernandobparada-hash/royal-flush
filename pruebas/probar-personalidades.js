/* Personalidades de los bots (v12): se simulan muchas manos con las 10
   personalidades en la misma mesa y se comprueba que juegan distinto
   (VPIP, agresión, retiradas ante apuestas, faroles, check-raise).
   Ejecutar: node pruebas/probar-personalidades.js */
"use strict";
const Bots = require("../public/js/bots.js");
const Motor = require("../public/js/motor.js");
const Ev = require("../public/js/evaluador.js");

let aciertos = 0, fallos = 0;
function ok(desc, cond, extra) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc + (extra ? "  -> " + extra : "")); }
}
function semilla(n) { let s = n >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

console.log("--- Lista de personalidades ---");
const L = Bots.LISTA_PERSONALIDADES;
ok("Hay al menos 8 personalidades (" + L.length + ")", L.length >= 8);
["roca", "tiburon", "maniaco", "pagador", "farolero", "lag", "miedoso", "trampero"].forEach(function (id) {
  ok("Existe la personalidad " + id, !!Bots.PERSONALIDADES[id]);
});
L.forEach(function (id) {
  const p = Bots.PERSONALIDADES[id];
  const momentos = ["saludo", "subir", "pagar", "retirarse", "ganar", "allin"];
  ok(p.etiqueta + ": nombres, descripción y frases para cada momento",
    p.nombres.length >= 2 && p.descripcion.length > 10 && momentos.every(function (m) { return (p.frases[m] || []).length > 0; }));
});
const mezcla = Bots.repartirPersonalidades(9, semilla(3));
ok("En una mesa de 10 (9 bots) no se repite ninguna personalidad", new Set(mezcla).size === 9, mezcla.join(","));
const mezcla14 = Bots.repartirPersonalidades(14, semilla(4));
ok("En una mesa de 15 (14 bots) aparecen las 10 personalidades", new Set(mezcla14).size === 10);
const b1 = Bots.crearBot([], "maniaco", semilla(1));
ok("crearBot da un nombre del personaje", Bots.PERSONALIDADES.maniaco.nombres.indexOf(b1.nombre) >= 0 && b1.personalidad === "maniaco");
const b2 = Bots.crearBot(Bots.PERSONALIDADES.roca.nombres.slice(), "roca", semilla(1));
ok("crearBot no repite nombres aunque se agoten", Bots.PERSONALIDADES.roca.nombres.indexOf(b2.nombre) < 0);
ok("Las frases de chat son cortas (≤ 40 letras)", L.every(function (id) {
  const f = Bots.PERSONALIDADES[id].frases; return Object.keys(f).every(function (m) { return f[m].every(function (t) { return t.length <= 40; }); });
}));
ok("La personalidad se guarda en el jugador y en el estado público", (function () {
  const m = new Motor.Mesa({ asientos: 9 });
  m.sentar({ id: "x", nombre: "Loco Tito", tipo: "bot", asiento: 0, personalidad: "maniaco" });
  return m.jugadorPorId("x").personalidad === "maniaco" && m.estadoPublico(null).jugadores[0].personalidad === "maniaco";
})());

ok("La personalidad se guarda en la copia de la sala (persistencia)", (function () {
  const Persistencia = require("../servidor/persistencia.js");
  const m = new Motor.Mesa({ asientos: 15 });
  m.sentar({ id: "bot-X-1", nombre: "Tito", tipo: "bot", asiento: 1, personalidad: "maniaco" });
  const datos = Persistencia.serializarSala({ mesa: m, codigo: "ABCDE", publica: true, cuentas: [] }, false);
  return datos.jugadores[0].personalidad === "maniaco" && datos.mesa.asientos === 15;
})());

console.log("\n--- Simulación: 10 personalidades en la misma mesa ---");
const rnd = semilla(2026 + (Number(process.env.POKER_SEMILLA) || 0));
const st = {};
L.forEach(function (id) { st[id] = { manos: 0, vpip: 0, pfr: 0, agresivas: 0, pagos: 0, frenteApuesta: 0, retirosFrente: 0, faroles: 0, postAcciones: 0, checkRaise: 0, retiroGratis: 0, monstruoLibre: 0, monstruoPasa: 0 }; });
let ilegales = 0, desajustes = 0, manos = 0;
const MESAS = 30, MANOS = 30;
// Repartos con semilla: la prueba da siempre lo mismo (POKER_SEMILLA=n prueba otra semilla)
const SEMILLA_MAZO = Number(process.env.POKER_SEMILLA) || 777;
for (let t = 0; t < MESAS; t++) {
  const mesa = new Motor.Mesa({ asientos: 10, fichasIniciales: 1000, aleatorioMazo: semilla(SEMILLA_MAZO + t) });
  const orden = Bots.repartirPersonalidades(10, rnd);
  orden.forEach(function (p, i) { mesa.sentar({ id: "b" + i, nombre: p, tipo: "bot", asiento: i, personalidad: p }); });
  for (let k = 0; k < MANOS; k++) {
    mesa.jugadores().forEach(function (j) { if (j.fichas < 200) j.fichas = 1000; });
    const antes = mesa.jugadores().reduce(function (s, j) { return s + j.fichas; }, 0);
    if (mesa.iniciarMano().error) break;
    mesa.empezarApuestas();
    manos++;
    const vpip = {}, pfr = {}, pasoEnCalle = {};
    let calle = "preflop";
    mesa.jugadores().forEach(function (j) { st[j.personalidad].manos++; });
    let guarda = 0;
    while (mesa.turnoId && guarda++ < 500) {
      const id = mesa.turnoId;
      const j = mesa.jugadorPorId(id);
      const est = mesa.estadoPublico(id);
      if (est.fase !== calle) { calle = est.fase; Object.keys(pasoEnCalle).forEach(function (x) { delete pasoEnCalle[x]; }); }
      const legales = mesa.accionesLegales(id);
      const d = Bots.decidir(legales, j, est, { aleatorio: rnd, iteraciones: 40 });
      const s = st[j.personalidad];
      const agresiva = d.tipo === "apostar" || d.tipo === "subir" || d.tipo === "all-in";
      if (est.fase === "preflop") {
        if (agresiva || d.tipo === "igualar") vpip[id] = true;
        if (agresiva) pfr[id] = true;
      } else {
        s.postAcciones++;
        if (agresiva) {
          s.agresivas++;
          if (pasoEnCalle[id]) s.checkRaise++;
          // farol: apuesta con mano débil (sin par con el tablero)
          const priv = j.cartas.map(function (c) { return c.numero; });
          const mesaN = est.comunitarias.map(function (c) { return c.numero; });
          const tienePar = priv[0] === priv[1] || priv.some(function (n) { return mesaN.indexOf(n) >= 0; });
          if (!tienePar) s.faroles++;
        }
        if (d.tipo === "igualar") s.pagos++;
        // slow-play: con trío o más (usando sus cartas) y pudiendo apostar, ¿pasa?
        if (legales.puedePasar && (legales.puedeApostar || legales.puedeSubir)) {
          const mano = Ev.mejorMano(j.cartas.concat(est.comunitarias));
          if (mano.categoria >= Ev.CATEGORIAS.TRIO) { s.monstruoLibre++; if (d.tipo === "pasar") s.monstruoPasa++; }
        }
        if (d.tipo === "pasar") pasoEnCalle[id] = true;
      }
      if (!legales.puedePasar && legales.porIgualar > 0 && est.fase !== "preflop") {
        s.frenteApuesta++;
        if (d.tipo === "retirarse") s.retirosFrente++;
      }
      if (legales.puedePasar && d.tipo === "retirarse") s.retiroGratis++;
      const r = mesa.accion(id, d.tipo, d.cantidad);
      if (r && r.error) { ilegales++; mesa.accion(id, legales.puedePasar ? "pasar" : "retirarse"); }
    }
    Object.keys(vpip).forEach(function (id) { st[mesa.jugadorPorId(id).personalidad].vpip++; });
    Object.keys(pfr).forEach(function (id) { st[mesa.jugadorPorId(id).personalidad].pfr++; });
    const despues = mesa.jugadores().reduce(function (s, j) { return s + j.fichas; }, 0);
    if (antes !== despues) desajustes++;
  }
}
const M = {};
console.log("    personalidad   VPIP   PFR    AF    retiro-ante-apuesta  faroles  check-raise  slow-play");
L.forEach(function (id) {
  const s = st[id];
  M[id] = {
    vpip: s.vpip / s.manos, pfr: s.pfr / s.manos, af: s.agresivas / Math.max(1, s.pagos),
    fold: s.retirosFrente / Math.max(1, s.frenteApuesta), slow: s.monstruoPasa / Math.max(1, s.monstruoLibre), farol: s.faroles / s.manos, cr: s.checkRaise / s.manos, gratis: s.retiroGratis
  };
  const m = M[id];
  console.log("    " + (id + "            ").slice(0, 13) + "  " + m.vpip.toFixed(2) + "   " + m.pfr.toFixed(2) + "   " + m.af.toFixed(2) + "   " + m.fold.toFixed(2) + "                 " + m.farol.toFixed(3) + "    " + m.cr.toFixed(3) + "        " + m.slow.toFixed(2));
});
ok("Se jugaron " + manos + " manos sin jugadas rechazadas (" + ilegales + ")", manos >= 600 && ilegales === 0);
ok("Las fichas se conservan en todas las manos", desajustes === 0);
const max = function (k) { return L.reduce(function (a, id) { return M[id][k] > M[a][k] ? id : a; }, L[0]); };
const min = function (k) { return L.reduce(function (a, id) { return M[id][k] < M[a][k] ? id : a; }, L[0]); };
ok("La Roca es la que menos manos juega (VPIP " + M.roca.vpip.toFixed(2) + ")", min("vpip") === "roca" && M.roca.vpip < 0.2);
ok("El Loco juega más manos que la Roca, el Tiburón y el Miedoso (por lo menos el triple)", M.maniaco.vpip > 3 * Math.max(M.roca.vpip, M.tiburon.vpip, M.miedoso.vpip));
ok("El Loco es el que más sube preflop (PFR " + M.maniaco.pfr.toFixed(2) + ")", max("pfr") === "maniaco");
ok("El Loco tiene la mayor agresión (AF " + M.maniaco.af.toFixed(2) + ")", max("af") === "maniaco" && M.maniaco.af > 2);
ok("El Pagador juega muchísimas manos (VPIP " + M.pagador.vpip.toFixed(2) + " > 0.6)", M.pagador.vpip > 0.6);
ok("El Pagador casi no sube: AF " + M.pagador.af.toFixed(2) + " < 0.1 y el que menos sube preflop", M.pagador.af < 0.1 && min("pfr") === "pagador");
ok("El Pagador es el que menos se retira ante apuestas", min("fold") === "pagador");
ok("El Miedoso se retira ante apuestas más que el Tiburón, el Loco y el Pagador",
  M.miedoso.fold > M.tiburon.fold && M.miedoso.fold > M.maniaco.fold && M.miedoso.fold > M.pagador.fold * 2);
ok("El Tiburón es agresivo (AF " + M.tiburon.af.toFixed(2) + " > 1) y más que la Roca, el Pagador y el Calculador",
  M.tiburon.af > 1 && M.tiburon.af > M.roca.af && M.tiburon.af > M.pagador.af && M.tiburon.af > M.calculador.af);
ok("El Tiburón es selectivo (VPIP " + M.tiburon.vpip.toFixed(2) + " < 0.3)", M.tiburon.vpip < 0.3);
ok("El Tiburón juega menos manos que el LAG", M.tiburon.vpip < M.lag.vpip);
ok("El LAG juega más manos que el Tiburón y es más agresivo que el Pagador", M.lag.vpip > M.tiburon.vpip && M.lag.af > M.pagador.af * 2);
ok("El Farolero farolea más que la Roca, el Tiburón y el Calculador", M.farolero.farol > M.roca.farol && M.farolero.farol > M.tiburon.farol && M.farolero.farol > M.calculador.farol);
ok("El Trampero hace más check-raise que los que juegan con lógica (todos menos el Loco y el Novato, que suben al azar)",
  L.every(function (id) { return id === "trampero" || id === "maniaco" || id === "novato" || M.trampero.cr > M[id].cr; }));
ok("El Trampero se hace el débil con monstruos (slow-play " + M.trampero.slow.toFixed(2) + ") mucho más que los agresivos",
  M.trampero.slow > 0.4 && ["tiburon", "maniaco", "lag", "farolero", "calculador"].every(function (id) { return M.trampero.slow > M[id].slow + 0.2; }));
ok("El Novato a veces se retira cuando podía pasar gratis (" + M.novato.gratis + " veces)", M.novato.gratis > 0);
ok("El Calculador nunca se retira cuando podía pasar gratis", M.calculador.gratis === 0);

console.log("\n--- Chat de los bots ---");
const r = semilla(9);
let dichos = 0;
for (let i = 0; i < 200; i++) if (Bots.chatDeBot({ personalidad: "maniaco" }, "allin", r)) dichos++;
ok("Los bots hablan a veces, no siempre (" + dichos + "/200 en all-in)", dichos > 60 && dichos < 180);
ok("Un bot sin personalidad no habla", Bots.chatDeBot({ nombre: "Lucía" }, "allin", r) === null);
ok("La mesa da miedo con tres del mismo palo", Bots.tableroMiedoso([{ numero: 2, palo: "♠" }, { numero: 9, palo: "♠" }, { numero: 13, palo: "♠" }]));
ok("Una mesa seca no da miedo", !Bots.tableroMiedoso([{ numero: 2, palo: "♠" }, { numero: 9, palo: "♥" }, { numero: 13, palo: "♦" }]));

console.log("\n" + aciertos + " aciertos, " + fallos + " fallos");
if (fallos) process.exit(1);
console.log("Todas las pruebas de personalidades pasaron.");
