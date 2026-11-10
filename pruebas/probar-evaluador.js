/* Pruebas del evaluador de 5 y 7 cartas. Ejecutar: node pruebas/probar-evaluador.js */
"use strict";

const Ev = require("../public/js/evaluador.js");

function carta(texto, palo) {
  const especiales = { A: 14, J: 11, Q: 12, K: 13 };
  const numero = especiales[texto] !== undefined ? especiales[texto] : Number(texto);
  const color = palo === "♥" || palo === "♦" ? "roja" : "negra";
  return { numero: numero, texto: String(texto), palo: palo, color: color };
}

function mano(pares) {
  return pares.map(function (p) { return carta(p[0], p[1]); });
}

let aciertos = 0;
let fallos = 0;
const errores = [];

function igual(desc, obtenido, esperado) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (ok) {
    aciertos += 1;
    console.log("  OK  " + desc);
  } else {
    fallos += 1;
    const detalle = desc + "  →  obtenido: " + JSON.stringify(obtenido) + "  esperado: " + JSON.stringify(esperado);
    errores.push(detalle);
    console.log(" FALLO " + detalle);
  }
}

function cat(cartas) {
  return Ev.mejorMano(cartas).categoria;
}

function nombre(cartas) {
  return Ev.mejorMano(cartas).nombre;
}

console.log("\n=== Manos de 5 cartas ===\n");

igual("Escalera real", cat(mano([["10","♥"],["J","♥"],["Q","♥"],["K","♥"],["A","♥"]])), Ev.CATEGORIAS.ESCALERA_REAL);
igual("Escalera de color 5-9", cat(mano([["5","♠"],["6","♠"],["7","♠"],["8","♠"],["9","♠"]])), Ev.CATEGORIAS.ESCALERA_COLOR);
igual("Escalera de color baja A-5 (no es real)", cat(mano([["A","♣"],["2","♣"],["3","♣"],["4","♣"],["5","♣"]])), Ev.CATEGORIAS.ESCALERA_COLOR);
igual("Póker de ases", cat(mano([["A","♠"],["A","♥"],["A","♦"],["A","♣"],["9","♠"]])), Ev.CATEGORIAS.POKER);
igual("Full reyes y doses", cat(mano([["K","♠"],["K","♥"],["K","♦"],["2","♣"],["2","♠"]])), Ev.CATEGORIAS.FULL);
igual("Color", cat(mano([["2","♦"],["6","♦"],["9","♦"],["J","♦"],["K","♦"]])), Ev.CATEGORIAS.COLOR);
igual("Escalera 5-9 mezclada", cat(mano([["5","♠"],["6","♥"],["7","♦"],["8","♣"],["9","♠"]])), Ev.CATEGORIAS.ESCALERA);
igual("Escalera 10-A mezclada", cat(mano([["10","♠"],["J","♥"],["Q","♦"],["K","♣"],["A","♠"]])), Ev.CATEGORIAS.ESCALERA);
igual("Escalera baja A-5 mezclada", cat(mano([["A","♠"],["2","♥"],["3","♦"],["4","♣"],["5","♠"]])), Ev.CATEGORIAS.ESCALERA);
igual("K-A-2-3-4 no es escalera", nombre(mano([["K","♠"],["A","♥"],["2","♦"],["3","♣"],["4","♠"]])), "Carta alta");
igual("Trío", cat(mano([["J","♠"],["J","♥"],["J","♦"],["4","♣"],["9","♠"]])), Ev.CATEGORIAS.TRIO);
igual("Doble par", cat(mano([["K","♠"],["K","♥"],["8","♦"],["8","♣"],["3","♠"]])), Ev.CATEGORIAS.DOBLE_PAR);
igual("Par", cat(mano([["A","♠"],["A","♥"],["5","♦"],["9","♣"],["3","♠"]])), Ev.CATEGORIAS.PAR);
igual("Carta alta", cat(mano([["A","♠"],["K","♥"],["Q","♦"],["9","♣"],["2","♠"]])), Ev.CATEGORIAS.CARTA_ALTA);

console.log("\n=== Desempates ===\n");

const parAsesK = Ev.puntuarCinco(mano([["A","♠"],["A","♥"],["K","♦"],["7","♣"],["3","♠"]]));
const parAsesQ = Ev.puntuarCinco(mano([["A","♣"],["A","♦"],["Q","♥"],["9","♣"],["8","♠"]]));
igual("Par de ases con kicker K gana a kicker Q", Ev.compararPuntuaciones(parAsesK, parAsesQ) > 0, true);

const escA = Ev.puntuarCinco(mano([["10","♠"],["J","♥"],["Q","♦"],["K","♣"],["A","♠"]]));
const escK = Ev.puntuarCinco(mano([["9","♠"],["10","♥"],["J","♦"],["Q","♣"],["K","♠"]]));
igual("Escalera al as gana a escalera al rey", Ev.compararPuntuaciones(escA, escK) > 0, true);

const rueda = Ev.puntuarCinco(mano([["A","♠"],["2","♥"],["3","♦"],["4","♣"],["5","♠"]]));
const esc6 = Ev.puntuarCinco(mano([["2","♠"],["3","♥"],["4","♦"],["5","♣"],["6","♠"]]));
igual("La rueda A-5 pierde contra 2-6", Ev.compararPuntuaciones(rueda, esc6) < 0, true);
igual("La rueda tiene alto 5", rueda.desempate[0], 5);

const dp1 = Ev.puntuarCinco(mano([["K","♠"],["K","♥"],["8","♦"],["8","♣"],["3","♠"]]));
const dp2 = Ev.puntuarCinco(mano([["K","♦"],["K","♣"],["7","♥"],["7","♠"],["A","♠"]]));
igual("Doble par K-8 gana a K-7", Ev.compararPuntuaciones(dp1, dp2) > 0, true);

const empate = Ev.compararPuntuaciones(
  Ev.puntuarCinco(mano([["A","♠"],["K","♥"],["Q","♦"],["J","♣"],["9","♠"]])),
  Ev.puntuarCinco(mano([["A","♥"],["K","♠"],["Q","♣"],["J","♦"],["9","♥"]]))
);
igual("Misma carta alta empatan", empate, 0);

console.log("\n=== Mejor de 7 cartas ===\n");

// 2 privadas + 5 comunitarias: hay un par en privadas, pero en mesa hay color
const sieteColor = mano([
  ["2","♠"],["2","♥"],
  ["3","♦"],["7","♦"],["9","♦"],["J","♦"],["K","♦"]
]);
igual("Elige el color aunque haya un par", cat(sieteColor), Ev.CATEGORIAS.COLOR);

const sieteReal = mano([
  ["A","♥"],["K","♥"],
  ["10","♥"],["J","♥"],["Q","♥"],["2","♣"],["9","♠"]
]);
igual("Escalera real entre 7 cartas", cat(sieteReal), Ev.CATEGORIAS.ESCALERA_REAL);

// Mesa tiene escalera, el jugador no mejora... igual es escalera
const sieteEsc = mano([
  ["A","♠"],["K","♠"],
  ["5","♥"],["6","♦"],["7","♣"],["8","♠"],["9","♥"]
]);
igual("Usa la escalera de la mesa", cat(sieteEsc), Ev.CATEGORIAS.ESCALERA);

// Full escondido: trío en mesa + par en privadas
const sieteFull = mano([
  ["K","♠"],["K","♥"],
  ["9","♦"],["9","♣"],["9","♠"],["2","♥"],["5","♣"]
]);
igual("Full con par en privadas y trío en mesa", cat(sieteFull), Ev.CATEGORIAS.FULL);

// 6 cartas (flop + turn + 2 hole) también funciona
const seis = mano([["A","♠"],["A","♥"],["A","♦"],["K","♣"],["K","♠"],["2","♥"]]);
igual("Full con 6 cartas", cat(seis), Ev.CATEGORIAS.FULL);

// Elige el póker y no el full (4 ases + un rey, hay también un par de reyes posible? A A A A K K 2)
const sietePoker = mano([
  ["A","♠"],["A","♥"],
  ["A","♦"],["A","♣"],["K","♠"],["K","♥"],["2","♣"]
]);
igual("Póker gana al full posible", cat(sietePoker), Ev.CATEGORIAS.POKER);

// Kickers con 7 cartas: par de ases, elige los 3 kicker más altos
const kickerA = Ev.mejorMano(mano([
  ["A","♠"],["7","♥"],
  ["A","♦"],["K","♣"],["Q","♠"],["2","♥"],["3","♣"]
]));
const kickerB = Ev.mejorMano(mano([
  ["A","♥"],["6","♠"],
  ["A","♣"],["K","♠"],["Q","♥"],["2","♦"],["3","♠"]
]));
igual("Par de ases con kicker 7 gana al de kicker 6", Ev.compararPuntuaciones(kickerA, kickerB) > 0, true);
igual("Kicker del par: As, K, Q, 7", kickerA.desempate, [14, 13, 12, 7]);

console.log("\n=== Mazo ===\n");
const mazo = Ev.crearMazo();
igual("52 cartas", mazo.length, 52);
igual("52 distintas", new Set(mazo.map(function (c) { return c.texto + c.palo; })).size, 52);
igual("Barajar mantiene 52", Ev.barajar(mazo).length, 52);

console.log("\n=== Proyectadas ===\n");
const drawColor = Ev.detectarProyectadas(mano([["A","♥"],["7","♥"],["2","♥"],["9","♥"],["K","♠"]]));
igual("Detecta color draw", drawColor.color, true);

const abierta = Ev.detectarProyectadas(mano([["5","♠"],["6","♥"],["7","♦"],["8","♣"],["K","♠"]]));
igual("Detecta escalera abierta", abierta.escaleraAbierta, true);

console.log("\n========================================");
console.log("Aciertos: " + aciertos);
console.log("Fallos:   " + fallos);
console.log("========================================\n");

if (fallos > 0) {
  errores.forEach(function (e) { console.error(" - " + e); });
  process.exit(1);
}
console.log("Todas las pruebas del evaluador pasaron.");
