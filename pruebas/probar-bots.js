/* Pruebas de los bots: equidad, estilos, posición, decisiones razonables
   y partidas completas simuladas (jugadas legales, fichas que se conservan).
   Ejecutar: node pruebas/probar-bots.js */
"use strict";
const Bots = require("../public/js/bots.js");
const Motor = require("../public/js/motor.js");
const Ev = require("../public/js/evaluador.js");

let aciertos = 0, fallos = 0;
function ok(desc, cond, extra) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc + (extra ? "  -> " + extra : "")); }
}
function carta(t, palo) {
  const numero = ({ A: 14, K: 13, Q: 12, J: 11 })[t] || Number(t);
  return { numero: numero, texto: String(t), palo: palo, color: (palo === "♥" || palo === "♦") ? "roja" : "negra" };
}
// Generador con semilla: las pruebas dan siempre el mismo resultado
function semilla(n) {
  let s = n >>> 0;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

console.log("--- Equidad (Monte Carlo) ---");
const rnd = semilla(7);
const eAA = Bots.equidad([carta("A", "♠"), carta("A", "♥")], [], 1, 3000, rnd);
const e72 = Bots.equidad([carta("7", "♠"), carta("2", "♥")], [], 1, 3000, rnd);
ok("AA contra 1 mano al azar gana ~85% (obtenido " + eAA.toFixed(3) + ")", eAA > 0.82 && eAA < 0.89);
ok("7-2 contra 1 mano al azar gana ~35% (obtenido " + e72.toFixed(3) + ")", e72 > 0.31 && e72 < 0.39);
const eMuchos = Bots.equidad([carta("A", "♠"), carta("A", "♥")], [], 8, 2000, rnd);
ok("AA contra 8 rivales gana bastante menos que contra 1 (" + eMuchos.toFixed(3) + ")", eMuchos < eAA - 0.2 && eMuchos > 0.3);
const eEscalera = Bots.equidad([carta("9", "♠"), carta("10", "♥")], [carta("J", "♦"), carta("Q", "♣"), carta("K", "♠")], 1, 1500, rnd);
ok("Escalera hecha en el flop contra 1 rival gana casi siempre (" + eEscalera.toFixed(3) + ")", eEscalera > 0.9);
ok("La equidad no cambia el mazo ni las cartas dadas",
  (function () { const p = [carta("A", "♠"), carta("K", "♠")]; Bots.equidad(p, [], 2, 50, rnd); return p.length === 2 && p[0].texto === "A"; })());

console.log("\n--- Estilos y posición ---");
const nombres = Bots.NOMBRES_BOT;
const estilosVistos = {};
nombres.forEach(function (n) { estilosVistos[Bots.estiloDe({ nombre: n }).nombre] = true; });
ok("Entre los 20 nombres aparecen los 4 estilos", Object.keys(estilosVistos).length === 4, Object.keys(estilosVistos).join(","));
ok("El estilo de un bot es siempre el mismo", Bots.estiloDe({ nombre: "Lucía" }).nombre === Bots.estiloDe({ nombre: "Lucía" }).nombre);
const estado6 = {
  asientosTotales: 9, botonDealer: 2,
  jugadores: [0, 1, 2, 3, 4, 5].map(function (a) { return { id: "j" + a, asiento: a, enMano: true, retirado: false }; })
};
ok("El botón es la mejor posición (1)", Bots.posicionRelativa({ id: "j2" }, estado6) === 1);
ok("La ciega pequeña (justo después del botón) es la peor (0)", Bots.posicionRelativa({ id: "j3" }, estado6) === 0);
estado6.jugadores[0].retirado = true;
ok("Los jugadores retirados no cuentan para la posición", Bots.posicionRelativa({ id: "j2" }, estado6) === 1);

console.log("\n--- Decisiones razonables (100 repeticiones cada una) ---");
function escenario(opt) {
  const jugador = { id: "yo", nombre: opt.nombre || "Lucía", cartas: opt.cartas, fichas: opt.fichas || 1000, apuestaRonda: opt.apuestaRonda || 0 };
  const estado = {
    fase: opt.fase, comunitarias: opt.comunitarias || [], boteTotal: opt.bote, ciegaGrande: 10, ciegaPequena: 5,
    apuestaMaxima: opt.apuestaMaxima || 0, subidaMinima: 10, asientosTotales: 9, botonDealer: 0,
    jugadores: [
      { id: "yo", asiento: 4, enMano: true, retirado: false },
      { id: "r1", asiento: 5, enMano: true, retirado: false },
      { id: "r2", asiento: 0, enMano: true, retirado: false }
    ]
  };
  const por = opt.porIgualar || 0;
  const legales = {
    tipos: ["retirarse"], puedeRetirarse: true, puedePasar: por === 0, puedeIgualar: por > 0,
    puedeApostar: (opt.apuestaMaxima || 0) === 0, puedeSubir: (opt.apuestaMaxima || 0) > 0, puedeAllIn: true,
    porIgualar: por, minSubida: (opt.apuestaMaxima || 0) === 0 ? 10 : (opt.apuestaMaxima + 10), maxSubida: jugador.apuestaRonda + jugador.fichas
  };
  legales.tipos.push(por === 0 ? "pasar" : "igualar", "all-in");
  return { legales: legales, jugador: jugador, estado: estado };
}
function frecuencia(opt, filtro, n) {
  const r = semilla(99);
  let cuenta = 0;
  for (let i = 0; i < (n || 100); i++) {
    const e = escenario(opt);
    const d = Bots.decidir(e.legales, e.jugador, e.estado, { aleatorio: r, iteraciones: 60 });
    if (filtro(d)) cuenta++;
  }
  return cuenta / (n || 100);
}
const esSubida = function (d) { return d.tipo === "apostar" || d.tipo === "subir" || d.tipo === "all-in"; };

const fAAabre = frecuencia({ fase: "preflop", cartas: [carta("A", "♠"), carta("A", "♥")], bote: 15, apuestaMaxima: 10, porIgualar: 10 }, esSubida);
ok("Con AA preflop casi siempre sube (" + Math.round(fAAabre * 100) + "%)", fAAabre >= 0.6);
const f72retira = frecuencia({ fase: "preflop", cartas: [carta("7", "♠"), carta("2", "♥")], bote: 75, apuestaMaxima: 60, porIgualar: 60 }, function (d) { return d.tipo === "retirarse"; });
ok("Con 7-2 ante una subida grande casi siempre se retira (" + Math.round(f72retira * 100) + "%)", f72retira >= 0.9);
const com1 = [carta("A", "♦"), carta("A", "♣"), carta("K", "♥")];
const fPoker = frecuencia({ fase: "flop", cartas: [carta("A", "♠"), carta("A", "♥")], comunitarias: com1, bote: 100 }, esSubida);
ok("Con trío de ases en el flop y la opción de pasar, suele apostar (" + Math.round(fPoker * 100) + "%)", fPoker >= 0.6);
const com2 = [carta("K", "♦"), carta("9", "♣"), carta("4", "♥"), carta("J", "♠"), carta("2", "♦")];
const fAire = frecuencia({ fase: "river", cartas: [carta("3", "♠"), carta("7", "♥")], comunitarias: com2, bote: 200, apuestaMaxima: 200, porIgualar: 200 }, function (d) { return d.tipo === "retirarse"; });
ok("Sin nada en el river ante una apuesta del tamaño del bote se retira (" + Math.round(fAire * 100) + "%)", fAire >= 0.85);
const fNuts = frecuencia({ fase: "river", cartas: [carta("A", "♠"), carta("K", "♠")], comunitarias: [carta("Q", "♠"), carta("J", "♠"), carta("10", "♠"), carta("2", "♦"), carta("3", "♣")], bote: 200, apuestaMaxima: 100, porIgualar: 100 }, function (d) { return d.tipo !== "retirarse"; });
ok("Con escalera real nunca se retira (" + Math.round(fNuts * 100) + "% sigue)", fNuts === 1);
const fGratis = frecuencia({ fase: "flop", cartas: [carta("2", "♠"), carta("7", "♥")], comunitarias: [carta("K", "♦"), carta("9", "♣"), carta("J", "♥")], bote: 40 }, function (d) { return d.tipo === "retirarse"; });
ok("Nunca se retira si puede pasar gratis (" + Math.round(fGratis * 100) + "%)", fGratis === 0);

console.log("\n--- Partidas completas simuladas ---");
let manosTotales = 0, ilegales = 0, desajustes = 0, atascos = 0;
const acciones = {};
const netoPorEstilo = {};
const conteoPorEstilo = {};
const reparto = semilla(2026);
for (let partida = 0; partida < 20; partida++) {
  const jugadoresN = 2 + (partida % 8);                       // de 2 a 9 jugadores
  const fichas = [10, 100, 1000, 5000][partida % 4];
  const mesa = new Motor.Mesa({ asientos: 9, fichasIniciales: fichas });
  const usados = [];
  for (let i = 0; i < jugadoresN; i++) {
    const nombre = Bots.nombreBot(usados); usados.push(nombre);
    mesa.sentar({ id: "b" + i, nombre: nombre, tipo: "bot", asiento: i });
  }
  for (let mano = 0; mano < 20; mano++) {
    // Rellenamos a los que se quedaron sin fichas para que la partida siga
    mesa.jugadores().forEach(function (j) { if (j.fichas === 0) j.fichas = fichas; });
    const antes = mesa.jugadores().reduce(function (s, j) { return s + j.fichas; }, 0);
    const inicial = {};
    mesa.jugadores().forEach(function (j) { inicial[j.id] = j.fichas; });
    const r = mesa.iniciarMano();
    if (r && r.error) break;
    mesa.empezarApuestas();
    let guarda = 0;
    while (mesa.turnoId && guarda++ < 400) {
      const id = mesa.turnoId;
      const j = mesa.jugadorPorId(id);
      const legales = mesa.accionesLegales(id);
      const d = Bots.decidir(legales, j, mesa.estadoPublico(id), { aleatorio: reparto, iteraciones: 30 });
      acciones[d.tipo] = (acciones[d.tipo] || 0) + 1;
      const res = mesa.accion(id, d.tipo, d.cantidad);
      if (res && res.error) {
        ilegales++;
        if (ilegales <= 3) console.log("    jugada rechazada:", JSON.stringify(d), res.error, "legales:", JSON.stringify(legales));
        // para no atascarse, el motor recibe una retirada
        mesa.accion(id, legales.puedePasar ? "pasar" : "retirarse");
      }
    }
    if (guarda >= 400) atascos++;
    manosTotales++;
    const despues = mesa.jugadores().reduce(function (s, j) { return s + j.fichas; }, 0);
    if (despues !== antes) desajustes++;
    mesa.jugadores().forEach(function (j) {
      const est = Bots.estiloDe(j).nombre;
      netoPorEstilo[est] = (netoPorEstilo[est] || 0) + (j.fichas - inicial[j.id]) / fichas;
      conteoPorEstilo[est] = (conteoPorEstilo[est] || 0) + 1;
    });
  }
}
ok("Se jugaron muchas manos (" + manosTotales + ")", manosTotales >= 350);
ok("Ninguna jugada de los bots fue rechazada por el motor (" + ilegales + " rechazadas)", ilegales === 0);
ok("Las fichas siempre se conservan en cada mano (" + desajustes + " desajustes)", desajustes === 0);
ok("Ninguna mano se quedó atascada (" + atascos + ")", atascos === 0);
ok("Los bots usan retirarse, pasar, igualar y subir", ["retirarse", "pasar", "igualar"].every(function (t) { return acciones[t] > 0; }) && ((acciones.subir || 0) + (acciones.apostar || 0)) > 0, JSON.stringify(acciones));
console.log("    acciones:", JSON.stringify(acciones));
console.log("    resultado medio por mano y estilo (en stacks; solo informativo):");
Object.keys(netoPorEstilo).forEach(function (e) {
  console.log("      " + e.padEnd(12) + (netoPorEstilo[e] / conteoPorEstilo[e]).toFixed(4));
});

console.log("\n========================================");
console.log("Aciertos: " + aciertos + "   Fallos: " + fallos);
console.log("========================================");
if (fallos) { console.log("\nHay pruebas de bots que fallaron."); process.exit(1); }
console.log("\nTodas las pruebas de bots pasaron.");
