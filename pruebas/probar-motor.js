"use strict";

const Motor = require("../public/js/motor.js");
const Ev = require("../public/js/evaluador.js");

let aciertos = 0;
let fallos = 0;

function igual(desc, obtenido, esperado) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (ok) {
    aciertos += 1;
    console.log("  OK  " + desc);
  } else {
    fallos += 1;
    console.log(" FALLO " + desc + "  →  obtenido: " + JSON.stringify(obtenido) + "  esperado: " + JSON.stringify(esperado));
  }
}

function jugarSiempreCall(mesa, maxAcciones) {
  let n = 0;
  maxAcciones = maxAcciones || 80;
  while (mesa.fase !== "entre-manos" && mesa.fase !== "esperando" && n < maxAcciones) {
    const id = mesa.turnoId;
    if (!id) break;
    const legales = mesa.accionesLegales(id);
    let r;
    if (legales.puedePasar) r = mesa.accion(id, "pasar");
    else if (legales.puedeIgualar) r = mesa.accion(id, "igualar");
    else r = mesa.accion(id, "retirarse");
    if (r && r.error) {
      console.log("error de acción:", r.error, legales);
      break;
    }
    n += 1;
  }
  return n;
}

console.log("\n=== Mano completa hasta showdown (2 jugadores, siempre igualan) ===\n");

const mesa = new Motor.Mesa({ asientos: 9 });
mesa.sentar({ id: "a", nombre: "Ana", asiento: 0, fichas: 1000 });
mesa.sentar({ id: "b", nombre: "Bruno", asiento: 1, fichas: 1000 });
const inicio = mesa.iniciarMano();
igual("La mano arranca", !!(inicio && inicio.ok), true);
igual("Fase preflop", mesa.fase, "preflop");
igual("Cada uno tiene 2 cartas", mesa.jugadorPorId("a").cartas.length, 2);
igual("Hay ciega pequeña y grande", mesa.boteTotal, Motor.CIEGA_PEQUENA + Motor.CIEGA_GRANDE);
mesa.empezarApuestas();

const acciones = jugarSiempreCall(mesa);
igual("Se llegó a entre-manos", mesa.fase, "entre-manos");
igual("Hay 5 comunitarias", mesa.comunitarias.length, 5);
igual("Hubo showdown (no victoria por retiro)", !!(mesa.resultadoShowdown && !mesa.resultadoShowdown.sinShowdown), true);
igual("Hay al menos un ganador", mesa.resultadoShowdown.ganadores.length >= 1, true);

const fichasFinales = mesa.jugadorPorId("a").fichas + mesa.jugadorPorId("b").fichas;
igual("Las fichas se conservan (1000+1000)", fichasFinales, 2000);
igual("Se jugó al menos una ronda de apuestas", acciones > 0, true);

const evA = Ev.mejorMano(mesa.jugadorPorId("a").cartas.concat(mesa.comunitarias));
const evB = Ev.mejorMano(mesa.jugadorPorId("b").cartas.concat(mesa.comunitarias));
const cmp = Ev.compararPuntuaciones(evA, evB);
if (cmp > 0) {
  igual("Gana Ana, que tenía la mejor mano", mesa.resultadoShowdown.ganadores[0].id, "a");
} else if (cmp < 0) {
  igual("Gana Bruno, que tenía la mejor mano", mesa.resultadoShowdown.ganadores[0].id, "b");
} else {
  igual("Empate: los dos aparecen como ganadores", mesa.resultadoShowdown.ganadores.length, 2);
}

console.log("  (manos: Ana=" + Ev.describirMano(evA) + " / Bruno=" + Ev.describirMano(evB) + ")");

console.log("\n=== Victoria por retiro ===\n");
const mesa2 = new Motor.Mesa({ asientos: 9 });
mesa2.sentar({ id: "a", nombre: "Ana", asiento: 0, fichas: 1000 });
mesa2.sentar({ id: "b", nombre: "Bruno", asiento: 1, fichas: 1000 });
mesa2.iniciarMano();
mesa2.empezarApuestas();
// El primero en hablar se retira
const primero = mesa2.turnoId;
const otro = primero === "a" ? "b" : "a";
mesa2.accion(primero, "retirarse");
igual("Fase entre-manos tras el retiro", mesa2.fase, "entre-manos");
igual("Ganó el que no se retiró", mesa2.resultadoShowdown.ganadores[0].id, otro);
igual("Fichas conservadas", mesa2.jugadorPorId("a").fichas + mesa2.jugadorPorId("b").fichas, 2000);

console.log("\n=== Side pot (all-in corto) ===\n");
const mesa3 = new Motor.Mesa({ asientos: 9, ciegaPequena: 5, ciegaGrande: 10 });
mesa3.sentar({ id: "corto", nombre: "Corto", asiento: 0, fichas: 50 });
mesa3.sentar({ id: "medio", nombre: "Medio", asiento: 1, fichas: 200 });
mesa3.sentar({ id: "largo", nombre: "Largo", asiento: 2, fichas: 200 });
mesa3.iniciarMano();
mesa3.empezarApuestas();

function allInOCall(mesa) {
  let n = 0;
  while (mesa.fase !== "entre-manos" && n < 80) {
    const id = mesa.turnoId;
    if (!id) break;
    const legales = mesa.accionesLegales(id);
    const j = mesa.jugadorPorId(id);
    // Corto siempre all-in; los otros igualan
    let r;
    if (id === "corto" && legales.puedeAllIn && j.fichas > 0 && (legales.puedeSubir || legales.puedeApostar || legales.puedeIgualar)) {
      r = mesa.accion(id, "all-in");
    } else if (legales.puedeIgualar) {
      r = mesa.accion(id, "igualar");
    } else if (legales.puedePasar) {
      r = mesa.accion(id, "pasar");
    } else if (legales.puedeAllIn) {
      r = mesa.accion(id, "all-in");
    } else {
      r = mesa.accion(id, "retirarse");
    }
    if (r && r.error) {
      console.log("error side pot:", id, r.error, legales, "fichas", j.fichas);
      break;
    }
    n += 1;
  }
}

allInOCall(mesa3);
igual("Se llegó al final con 3 jugadores", mesa3.fase, "entre-manos");
const total3 = mesa3.jugadorPorId("corto").fichas + mesa3.jugadorPorId("medio").fichas + mesa3.jugadorPorId("largo").fichas;
igual("Las fichas se conservan (50+200+200)", total3, 450);
igual("Hubo showdown", !!(mesa3.resultadoShowdown && !mesa3.resultadoShowdown.sinShowdown), true);
// Corto solo puede ganar como máximo 50*3 = 150 (su bote principal)
const premioCorto = (mesa3.resultadoShowdown.ganadores.find(function (g) { return g.id === "corto"; }) || { premio: 0 }).premio;
igual("Corto no gana más de 150 (límite del bote principal)", premioCorto <= 150, true);
console.log("  botes:", JSON.stringify(mesa3.resultadoShowdown.botes));
console.log("  ganadores:", JSON.stringify(mesa3.resultadoShowdown.ganadores));

console.log("\n=== Fichas iniciales y ciegas ===\n");

function ciegasOk(fichas, sb, bb) {
  const c = Motor.ciegasPara(fichas);
  igual("Ciegas para " + fichas + " fichas", [c.ciegaPequena, c.ciegaGrande, c.fichasIniciales], [sb, bb, fichas]);
}
ciegasOk(10, 1, 2);
ciegasOk(100, 1, 2);
ciegasOk(1000, 5, 10);
ciegasOk(5000, 25, 50);
ciegasOk(10000, 50, 100);
ciegasOk(50000, 250, 500);

igual("Rechaza menos de 10", !!Motor.normalizarFichas(9).error, true);
igual("Rechaza más de 50.000", !!Motor.normalizarFichas(50001).error, true);
igual("Acepta 10", Motor.normalizarFichas(10).fichas, 10);
igual("Redondea 1000.4 a 1000", Motor.normalizarFichas(1000.4).fichas, 1000);

const mesa10 = new Motor.Mesa({ asientos: 6, fichasIniciales: 10 });
mesa10.sentar({ id: "a", nombre: "Ana", asiento: 0 });
mesa10.sentar({ id: "b", nombre: "Bruno", asiento: 1 });
igual("Con 10 fichas, cada uno empieza con 10", mesa10.jugadorPorId("a").fichas, 10);
igual("Ciega pequeña 1 en la mesa de 10", mesa10.ciegaPequena, 1);
igual("Ciega grande 2 en la mesa de 10", mesa10.ciegaGrande, 2);
const ini10 = mesa10.iniciarMano();
igual("La mano arranca con 10 fichas", !!(ini10 && ini10.ok), true);
igual("El bote de ciegas es 3", mesa10.boteTotal, 3);
mesa10.empezarApuestas();
jugarSiempreCall(mesa10);
igual("Se puede terminar una mano con 10 fichas", mesa10.fase, "entre-manos");
igual("Las 20 fichas se conservan", mesa10.jugadorPorId("a").fichas + mesa10.jugadorPorId("b").fichas, 20);

console.log("\n========================================");
console.log("Aciertos: " + aciertos + "   Fallos: " + fallos);
console.log("========================================\n");
if (fallos > 0) process.exit(1);
console.log("Todas las pruebas del motor pasaron.");
