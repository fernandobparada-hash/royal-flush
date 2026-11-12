/* Comprueba que royal-flush.html está al día con public/ (que no se te olvidó regenerarlo).
   Si falla:  npm run construir */
"use strict";
const fs = require("fs");
const path = require("path");
const { construir } = require("../scripts/construir-html-unico.js");

const destino = path.join(__dirname, "..", "royal-flush.html");
let esperado;
try {
  esperado = construir();
} catch (e) {
  console.log("FALLO: no se pudo construir el HTML único: " + e.message);
  process.exit(1);
}
if (!fs.existsSync(destino)) {
  console.log("FALLO: no existe royal-flush.html. Ejecuta: npm run construir");
  process.exit(1);
}
const actual = fs.readFileSync(destino, "utf8");
if (actual !== esperado) {
  console.log("FALLO: royal-flush.html está desactualizado respecto a public/. Ejecuta: npm run construir");
  process.exit(1);
}
console.log("  OK  royal-flush.html está al día con public/");
console.log("\nTodas las comprobaciones del HTML único pasaron.");
