/* Pruebas de servidor/limites.js (no necesita servidor en marcha). */
"use strict";
const L = require("../servidor/limites.js");
let aciertos = 0, fallos = 0;
function ok(desc, cond) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc); }
}

// --- Limitador con reloj falso ---
let t = 1000;
const lim = L.crearLimitador(3, 1000, function () { return t; });
ok("Permite los 3 primeros", lim.permitir("a") && lim.permitir("a") && lim.permitir("a"));
ok("Bloquea el 4.º dentro de la ventana", lim.permitir("a") === false);
ok("Otra clave no se ve afectada", lim.permitir("b") === true);
t += 1001;
ok("Pasada la ventana vuelve a permitir", lim.permitir("a") === true);
t += 5000;
lim.permitir("c"); // dispara la limpieza
ok("Las claves viejas se borran (no crece la memoria)", lim.tamano() <= 2);

// --- IP ---
const reqProxy = { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" }, socket: { remoteAddress: "10.0.0.1" } };
ok("Con proxy de confianza usa la primera IP de X-Forwarded-For", L.ipDe(reqProxy, true) === "9.9.9.9");
ok("Sin proxy de confianza ignora X-Forwarded-For (se puede falsificar)", L.ipDe(reqProxy, false) === "10.0.0.1");
ok("Sin datos devuelve un valor, no revienta", typeof L.ipDe({ headers: {} }, false) === "string");

// --- Contador de conexiones ---
const c = new L.ContadorConexiones(2);
ok("Acepta 2 conexiones de la misma IP", c.entrar("x") && c.entrar("x"));
ok("Rechaza la 3.ª", c.entrar("x") === false);
c.salir("x");
ok("Al cerrarse una, vuelve a haber hueco", c.entrar("x") === true);
c.salir("x"); c.salir("x");
ok("Se limpia el contador cuando llega a 0", c.porIp.size === 0);

// --- Cabeceras ---
const puestas = {};
let siguio = false;
L.cabecerasSeguras({}, { setHeader: function (k, v) { puestas[k] = v; } }, function () { siguio = true; });
ok("Pone nosniff", puestas["X-Content-Type-Options"] === "nosniff");
ok("Prohíbe meter la página en un iframe", puestas["X-Frame-Options"] === "DENY");
ok("CSP solo permite scripts propios", /script-src 'self'(;|$)/.test(puestas["Content-Security-Policy"]));
ok("Continúa con la cadena de middlewares", siguio);

console.log("\n========================================");
console.log("Aciertos: " + aciertos + "   Fallos: " + fallos);
console.log("========================================");
if (fallos) { console.log("\nHay pruebas de límites que fallaron."); process.exit(1); }
console.log("\nTodas las pruebas de límites pasaron.");
