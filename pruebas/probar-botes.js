/* Botes laterales (side pots) con varios all-in, y modo torneo del motor.
   Ejecutar: node pruebas/probar-botes.js */
"use strict";
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
const suma = function (mesa) { return mesa.jugadores().reduce(function (s, j) { return s + j.fichas; }, 0); };

console.log("--- Botes laterales ---");
// Forzamos el barajado: sustituimos Ev.barajar durante iniciarMano para colocar las cartas.
function jugarConMazoFijo(stacks, manos, comunitarias, acciones) {
  const mesa = new Motor.Mesa({ asientos: 9, fichasIniciales: 1000, ciegaPequena: 5, ciegaGrande: 10 });
  stacks.forEach(function (f, i) { mesa.sentar({ id: "p" + i, nombre: "P" + i, tipo: "humano", asiento: i, fichas: f }); });
  const n = stacks.length;
  const orden = [];
  for (let i = 1; i <= n; i++) orden.push(i % n);        // SB primero, el botón (asiento 0) el último
  const privadas = [];
  for (let v = 0; v < 2; v++) orden.forEach(function (a) { privadas.push(manos[a][v]); });
  const conocidas = privadas.concat(comunitarias);
  const sobrantes = Ev.crearMazo().filter(function (c) { return !conocidas.some(function (k) { return k.numero === c.numero && k.palo === c.palo; }); });
  // Antes del flop, del turn y del river el motor "quema" una carta: reservamos 3 cartas cualquiera para eso
  const quemadas = sobrantes.splice(0, 3);
  const resto = sobrantes;
  // mazo.pop() saca del final: primero las privadas en orden, luego quemada+flop, quemada+turn, quemada+river
  const salida = privadas.concat([quemadas[0], comunitarias[0], comunitarias[1], comunitarias[2], quemadas[1], comunitarias[3], quemadas[2], comunitarias[4]]);
  const mazoFijo = resto.concat(salida.slice().reverse());
  const barajarOriginal = Ev.barajar;
  Ev.barajar = function () { return mazoFijo.slice(); };
  mesa.botonDealer = 0;
  const antes = suma(mesa);
  mesa.iniciarMano();
  Ev.barajar = barajarOriginal;
  mesa.empezarApuestas();
  let guarda = 0;
  while (mesa.turnoId && guarda++ < 100) {
    const id = mesa.turnoId;
    const legales = mesa.accionesLegales(id);
    const pedida = acciones(mesa, id, legales);
    const r = mesa.accion(id, pedida.tipo, pedida.cantidad);
    if (r && r.error) { return { error: r.error, mesa: mesa }; }
  }
  return { mesa: mesa, antes: antes };
}

// Tres jugadores con stacks distintos, todos all-in: P0 tiene pocas fichas y la mejor mano,
// P1 tiene un stack medio y la segunda mejor, P2 tiene el stack más grande y la peor.
const manos = [
  [carta("A", "♠"), carta("A", "♥")],   // P0: pareja de ases
  [carta("K", "♠"), carta("K", "♥")],   // P1: pareja de reyes
  [carta("Q", "♠"), carta("Q", "♥")]    // P2: pareja de damas
];
const mesa = [carta("2", "♣"), carta("7", "♦"), carta("9", "♠"), carta("4", "♥"), carta("J", "♣")];
const todoAllIn = function (m, id, legales) { return legales.puedeAllIn ? { tipo: "all-in" } : { tipo: "igualar" }; };
const res = jugarConMazoFijo([100, 300, 1000], manos, mesa, todoAllIn);
ok("La mano con tres all-in se juega sin errores", !res.error, res.error);
if (!res.error) {
  const m = res.mesa;
  ok("Hay 3 botes: principal y dos laterales (" + (m.botes.length) + ")", m.botes.length === 3, JSON.stringify(m.botes));
  ok("El bote principal es 100 x 3 = 300", m.botes[0].cantidad === 300);
  ok("El primer lateral es (300-100) x 2 = 400", m.botes[1].cantidad === 400);
  ok("El segundo lateral es 700 y es solo del que más puso", m.botes[2].cantidad === 700 && m.botes[2].elegibles.length === 1);
  ok("P0 (ases, 100 fichas) gana solo el principal: 300", m.jugadorPorId("p0").fichas === 300, "P0 tiene " + m.jugadorPorId("p0").fichas);
  ok("P1 (reyes) gana el lateral de 400", m.jugadorPorId("p1").fichas === 400, "P1 tiene " + m.jugadorPorId("p1").fichas);
  ok("P2 recupera lo que nadie pudo igualar (700) y no gana más", m.jugadorPorId("p2").fichas === 700, "P2 tiene " + m.jugadorPorId("p2").fichas);
  ok("Las fichas totales se conservan (" + suma(m) + ")", suma(m) === 1400);
}

// Empate dividido: dos jugadores con la misma mano en la mesa, el bote se reparte
const manosEmpate = [
  [carta("2", "♠"), carta("3", "♠")],
  [carta("2", "♥"), carta("3", "♥")]
];
const mesaEmpate = [carta("A", "♣"), carta("K", "♦"), carta("Q", "♠"), carta("J", "♥"), carta("10", "♣")]; // escalera en la mesa
const res2 = jugarConMazoFijo([500, 500], manosEmpate, mesaEmpate, todoAllIn);
ok("Dos jugadores con la escalera de la mesa se reparten el bote", !res2.error && res2.mesa.jugadorPorId("p0").fichas === 500 && res2.mesa.jugadorPorId("p1").fichas === 500, res2.error || (res2.mesa.jugadorPorId("p0").fichas + " / " + res2.mesa.jugadorPorId("p1").fichas));

// Bote impar: se reparte sin perder fichas
const res3 = jugarConMazoFijo([101, 100, 100], [
  [carta("2", "♠"), carta("3", "♠")], [carta("2", "♥"), carta("3", "♥")], [carta("9", "♦"), carta("8", "♦")]
], mesaEmpate, todoAllIn);
ok("Con un bote impar entre ganadores no se pierde ninguna ficha", !res3.error && suma(res3.mesa) === 301, res3.error || String(suma(res3.mesa)));

// Muchas manos al azar con all-in: las fichas siempre se conservan
let desajustes = 0;
for (let i = 0; i < 300; i++) {
  const stacks = [1 + (i * 37) % 400, 50 + (i * 91) % 900, 10 + (i * 53) % 700, 1 + (i * 17) % 100];
  const mz = new Motor.Mesa({ asientos: 9, fichasIniciales: 1000, ciegaPequena: 5, ciegaGrande: 10 });
  stacks.forEach(function (f, k) { mz.sentar({ id: "q" + k, nombre: "Q" + k, tipo: "humano", asiento: k, fichas: f }); });
  const total = suma(mz);
  mz.iniciarMano(); mz.empezarApuestas();
  let g = 0;
  while (mz.turnoId && g++ < 100) {
    const id = mz.turnoId, leg = mz.accionesLegales(id);
    mz.accion(id, leg.puedeAllIn ? "all-in" : (leg.puedePasar ? "pasar" : "igualar"));
  }
  if (suma(mz) !== total) desajustes++;
}
ok("300 manos con all-in cruzados conservan siempre las fichas (" + desajustes + " desajustes)", desajustes === 0);

console.log("\n--- Modo torneo (motor) ---");
function mesaTorneo(cada, fichas) {
  const m = new Motor.Mesa({ asientos: 9, fichasIniciales: fichas, subirCiegasCada: cada });
  m.sentar({ id: "a", nombre: "A", tipo: "humano", asiento: 0, fichas: fichas });
  m.sentar({ id: "b", nombre: "B", tipo: "humano", asiento: 1, fichas: fichas });
  return m;
}
function jugarRapido(m) {
  m.jugadores().forEach(function (j) { if (j.fichas < 50) j.fichas = 1000; });
  m.iniciarMano(); m.empezarApuestas();
  let g = 0;
  while (m.turnoId && g++ < 100) {
    const id = m.turnoId, leg = m.accionesLegales(id);
    m.accion(id, leg.puedePasar ? "pasar" : "retirarse");
  }
}
const t = mesaTorneo(3, 1000);
const ciegasPorMano = [];
const eventos = [];
t.on(function (ev) { if (ev.tipo === "mano-iniciada") eventos.push(ev.ciegasSubieron); });
for (let i = 0; i < 7; i++) { jugarRapido(t); ciegasPorMano.push(t.ciegaGrande); }
ok("Las ciegas se duplican cada 3 manos (10,10,10,20,20,20,40): " + ciegasPorMano.join(","), ciegasPorMano.join(",") === "10,10,10,20,20,20,40");
ok("El evento mano-iniciada avisa de la subida (manos 4 y 7)", eventos.join(",") === "false,false,false,true,false,false,true", eventos.join(","));
ok("La ciega pequeña es siempre la mitad de la grande", t.ciegaPequena * 2 === t.ciegaGrande);
const sinTorneo = mesaTorneo(0, 1000);
for (let i = 0; i < 12; i++) jugarRapido(sinTorneo);
ok("Sin modo torneo las ciegas nunca cambian", sinTorneo.ciegaGrande === 10 && sinTorneo.estadoPublico().manosParaSubirCiegas === null);
const tope = mesaTorneo(1, 100);
for (let i = 0; i < 12; i++) jugarRapido(tope);
ok("Las ciegas no pasan de la mitad del stack inicial (100 fichas -> nunca más de 50; hay " + tope.ciegaGrande + ")", tope.ciegaGrande <= 50 && tope.ciegaGrande >= 25);
const cuenta = mesaTorneo(4, 1000);
const avisos = [];
for (let i = 0; i < 5; i++) { jugarRapido(cuenta); avisos.push(cuenta.estadoPublico().manosParaSubirCiegas); }
ok("La cuenta atrás va 3,2,1,0 y se reinicia: " + avisos.join(","), avisos.join(",") === "3,2,1,0,3", avisos.join(","));

console.log("\n========================================");
console.log("Aciertos: " + aciertos + "   Fallos: " + fallos);
console.log("========================================");
if (fallos) { console.log("\nHay pruebas de botes/torneo que fallaron."); process.exit(1); }
console.log("\nTodas las pruebas de botes y torneo pasaron.");
