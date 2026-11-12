/* Comprueba que TODOS los dibujos de avatar son SVG válidos:
   cada comando de cada trazo (path) tiene los números que necesita.
   Un trazo mal escrito hace que el navegador dibuje a medias y escriba errores.
   Ejecutar: node pruebas/probar-avatar.js */
"use strict";
const Avatar = require("../public/js/avatar.js");

let aciertos = 0, fallos = 0;
function ok(desc, cond, extra) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc + (extra ? "  -> " + extra : "")); }
}

// Cuántos números lleva cada comando de un path
const NUMEROS = { M: 2, L: 2, C: 6, Q: 4, S: 4, T: 2, H: 1, V: 1, A: 7, Z: 0 };

/** Devuelve un texto con el problema, o null si el trazo está bien. */
function revisarPath(d) {
  const trozos = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
  if (!trozos.length) return "vacío";
  for (let i = 0; i < trozos.length; i++) {
    const cmd = trozos[i][0].toUpperCase();
    if (!(cmd in NUMEROS)) return "comando desconocido " + trozos[i][0];
    const nums = (trozos[i].slice(1).match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []);
    if (trozos[i].slice(1).replace(/[\s,]/g, "").replace(/-?\d*\.?\d+/g, "").length) return "números mal escritos en '" + trozos[i] + "'";
    const n = NUMEROS[cmd];
    if (n === 0) { if (nums.length) return "Z no lleva números"; continue; }
    if (nums.length === 0 || nums.length % n !== 0) return "'" + trozos[i].trim() + "' lleva " + nums.length + " números y necesita múltiplos de " + n;
  }
  return null;
}

// Una prueba de la propia revisión
ok("El revisor detecta una curva C incompleta", revisarPath("M 0 0 C 1 1, 2 2 Z") !== null);
ok("El revisor acepta una curva C completa", revisarPath("M 0 0 C 1 1, 2 2, 3 3 Z") === null);

const campos = Avatar.CAMPOS;
const nombres = Object.keys(campos);
let totalSvg = 0, totalPaths = 0;
const problemas = [];

function comprobar(a, etiqueta) {
  const svg = Avatar.svg(a, 80);
  totalSvg++;
  const paths = svg.match(/<path[^>]*\sd="([^"]*)"/g) || [];
  for (let i = 0; i < paths.length; i++) {
    totalPaths++;
    const d = /\sd="([^"]*)"/.exec(paths[i])[1];
    const p = revisarPath(d);
    if (p) problemas.push(etiqueta + ": " + p);
  }
  if (/NaN|undefined/.test(svg)) problemas.push(etiqueta + ": el SVG contiene NaN o undefined");
}

// Cada opción de cada campo, sobre el avatar por defecto y sobre otro distinto
[Avatar.porDefecto(), Avatar.aleatorio("semilla-1")].forEach(function (base, b) {
  nombres.forEach(function (campo) {
    for (let v = 0; v < campos[campo]; v++) {
      const a = Object.assign({}, base);
      a[campo] = v;
      comprobar(Avatar.normalizar(a), "base " + b + ", " + campo + "=" + v);
    }
  });
});
// Combinaciones al azar
for (let i = 0; i < 400; i++) comprobar(Avatar.aleatorio("azar-" + i), "aleatorio " + i);

ok("Se revisaron muchos avatares (" + totalSvg + " dibujos, " + totalPaths + " trazos)", totalSvg > 400 && totalPaths > 400);
ok("Ningún trazo SVG está mal escrito", problemas.length === 0, problemas.slice(0, 3).join(" | "));

console.log("\n========================================");
console.log("Aciertos: " + aciertos + "   Fallos: " + fallos);
console.log("========================================");
if (fallos) { console.log("\nHay pruebas de avatar que fallaron."); process.exit(1); }
console.log("\nTodas las pruebas de avatar pasaron.");
