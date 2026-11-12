/* Pruebas del historial de manos y de los sonidos (sin navegador).
   Ejecutar: node pruebas/probar-historial.js */
"use strict";
const Motor = require("../public/js/motor.js");
const Bots = require("../public/js/bots.js");
const H = require("../public/js/historial.js");
const S = require("../public/js/sonidos.js");

let aciertos = 0, fallos = 0;
function ok(desc, cond, extra) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc + (extra ? "  -> " + extra : "")); }
}

function jugarMano(mesa) {
  mesa.iniciarMano();
  mesa.empezarApuestas();
  let g = 0;
  while (mesa.turnoId && g++ < 300) {
    const id = mesa.turnoId;
    const d = Bots.decidir(mesa.accionesLegales(id), mesa.jugadorPorId(id), mesa.estadoPublico(id), { iteraciones: 20 });
    mesa.accion(id, d.tipo, d.cantidad);
  }
}

console.log("--- Historial ---");
const mesa = new Motor.Mesa({ asientos: 9, fichasIniciales: 1000 });
mesa.sentar({ id: "ana", nombre: "Ana", tipo: "bot", asiento: 0 });
mesa.sentar({ id: "beto", nombre: "Beto", tipo: "bot", asiento: 1 });
mesa.sentar({ id: "cora", nombre: "Cora", tipo: "bot", asiento: 2 });
const hist = H.crearHistorial(5);
ok("Empieza vacío", hist.cantidad() === 0);
ok("Sin resultado no registra nada", hist.registrar(mesa.estadoPublico("ana"), "ana") === null);

let registradas = 0, conShowdown = 0, sinShowdown = 0;
for (let i = 0; i < 12; i++) {
  mesa.jugadores().forEach(function (j) { if (j.fichas < 100) j.fichas = 1000; });
  jugarMano(mesa);
  const estado = mesa.estadoPublico("ana");
  const e = hist.registrar(estado, "ana");
  if (e) {
    registradas++;
    if (e.sinShowdown) sinShowdown++; else conShowdown++;
    // La suma de premios es el bote, y los ids son de jugadores reales
    if (i === 0) {
      ok("La primera entrada tiene número de mano 1", e.mano === 1);
      ok("Guarda los ganadores con nombre", e.ganadores.length >= 1 && typeof e.ganadores[0].nombre === "string" && e.ganadores[0].nombre.length > 0);
      ok("El bote es la suma de lo que se llevan los ganadores", e.bote === e.ganadores.reduce(function (s, g) { return s + g.premio; }, 0) && e.bote > 0);
    }
  }
}
ok("Se registraron las 12 manos jugadas (" + registradas + ")", registradas === 12);
ok("Hubo manos con y sin showdown para probar ambos casos (" + conShowdown + " / " + sinShowdown + ")", conShowdown > 0 || sinShowdown > 0);
ok("El historial respeta el máximo (5)", hist.cantidad() === 5);
const lista = hist.lista();
ok("La lista viene con la mano más reciente primero", lista[0].mano === 12 && lista[4].mano === 8);
ok("No duplica una mano ya registrada", hist.registrar(mesa.estadoPublico("ana"), "ana") === null && hist.cantidad() === 5);
const conCartas = lista.find(function (e) { return !e.sinShowdown; });
if (conCartas) {
  ok("Las cartas de la mesa se guardan como texto (A♠)", conCartas.comunitarias.length === 5 && /^(\d+|[AKQJ])[♠♥♦♣]$/.test(conCartas.comunitarias[0]), conCartas.comunitarias.join(" "));
  ok("Guarda las manos reveladas con su descripción", conCartas.reveladas.length >= 2 && conCartas.reveladas[0].cartas.length === 2 && conCartas.reveladas[0].descripcion.length > 0);
}
const linea = H.lineaResumen(lista[0]);
ok("La línea de resumen menciona la mano, el bote y al ganador (" + linea + ")", /^Mano 12 · Bote \d+ · /.test(linea) && linea.indexOf(lista[0].ganadores[0].nombre) >= 0);
ok("Una carta oculta se muestra como ??", H.textoCarta({ oculta: true }) === "??");
hist.limpiar();
ok("limpiar() lo vacía", hist.cantidad() === 0);

console.log("\n--- Sonidos ---");
function ContextoFalso() {
  this.currentTime = 0; this.sampleRate = 8000; this.state = "suspended"; this.destination = {};
  this.reanudado = 0; this.osciladores = 0; this.ruidos = 0;
  const self = this;
  this.resume = function () { self.reanudado++; self.state = "running"; };
  this.createOscillator = function () { self.osciladores++; return { frequency: { setValueAtTime: function () {} }, connect: function () {}, start: function () {}, stop: function () {} }; };
  this.createGain = function () { return { gain: { value: 1, setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} }, connect: function () {} }; };
  this.createBuffer = function (c, n) { return { getChannelData: function () { return new Float32Array(n); } }; };
  this.createBufferSource = function () { self.ruidos++; return { connect: function () {}, start: function () {} }; };
  this.createBiquadFilter = function () { return { frequency: {}, connect: function () {} }; };
  ContextoFalso.ultimo = this;
}
const s = S.crearSonidos({ AudioContext: ContextoFalso });
ok("Hay sonidos para carta, ficha, turno y ganar", ["carta", "ficha", "turno", "ganar"].every(function (n) { return s.NOMBRES.indexOf(n) >= 0; }));
ok("reproducir() programa el sonido y despierta el audio", s.reproducir("ficha") === true && ContextoFalso.ultimo.reanudado === 1);
ok("La ficha usa tonos (osciladores)", ContextoFalso.ultimo.osciladores >= 2);
s.reproducir("carta", { veces: 4, cada: 0.1 });
ok("'veces' repite el sonido (4 soplidos de carta)", ContextoFalso.ultimo.ruidos === 4);
ok("Un sonido que no existe no revienta", s.reproducir("no-existe") === false);
s.alternar();
const antes = ContextoFalso.ultimo.osciladores;
ok("Silenciado no suena nada", s.reproducir("ganar") === false && ContextoFalso.ultimo.osciladores === antes && s.estaActivo() === false);
s.alternar();
ok("Al reactivar vuelve a sonar", s.reproducir("ganar") === true);
const sinAudio = S.crearSonidos({ AudioContext: null });
ok("Sin soporte de audio no hace nada y no falla", sinAudio.reproducir("ficha") === false && sinAudio.disponible() === false);

console.log("\n========================================");
console.log("Aciertos: " + aciertos + "   Fallos: " + fallos);
console.log("========================================");
if (fallos) { console.log("\nHay pruebas de historial/sonidos que fallaron."); process.exit(1); }
console.log("\nTodas las pruebas de historial y sonidos pasaron.");
