/* Pruebas de las funciones puras de public/js/utilidades.js.
   Ejecutar: node pruebas/probar-utilidades.js */
"use strict";
const U = require("../public/js/utilidades.js");

let aciertos = 0, fallos = 0;
function igual(desc, obtenido, esperado) {
  const bien = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (bien) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc + "  -> esperado " + JSON.stringify(esperado) + ", obtenido " + JSON.stringify(obtenido)); }
}

console.log("--- Números ---");
igual("formatearFichas(0)", U.formatearFichas(0), "0");
igual("formatearFichas(999)", U.formatearFichas(999), "999");
igual("formatearFichas(1000) usa punto de miles", U.formatearFichas(1000), "1.000");
igual("formatearFichas(1234567)", U.formatearFichas(1234567), "1.234.567");
igual("formatearFichas redondea y tolera basura", [U.formatearFichas(12.6), U.formatearFichas("abc"), U.formatearFichas(null)], ["13", "0", "0"]);
igual("formatearBs entero", U.formatearBs(20), "20 Bs");
igual("formatearBs con decimales usa coma", U.formatearBs(12.5), "12,5 Bs");
igual("formatearBs redondea a 2 decimales", U.formatearBs(3.14159), "3,14 Bs");

console.log("\n--- Texto seguro ---");
igual("escapar neutraliza etiquetas HTML", U.escapar("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
igual("escapar neutraliza comillas y &", U.escapar('a"b&c'), "a&quot;b&amp;c");
igual("escapar acepta números", U.escapar(42), "42");
igual("primerNombre", [U.primerNombre("  Ana María  López "), U.primerNombre(""), U.primerNombre(null)], ["Ana", "", ""]);

console.log("\n--- Códigos de sala ---");
igual("extraerCodigo de un código suelto", U.extraerCodigo("abcde"), "ABCDE");
igual("extraerCodigo de un enlace", U.extraerCodigo("https://poker.example.com/m/qwxyz"), "QWXYZ");
igual("extraerCodigo ignora símbolos", U.extraerCodigo(" a-b c.d e "), "ABCDE");
igual("extraerCodigo con menos de 5 letras devuelve lo que hay", U.extraerCodigo("ab"), "AB");

console.log("\n--- Geometría ---");
igual("clamp", [U.clamp(5, 0, 10), U.clamp(-3, 0, 10), U.clamp(99, 0, 10)], [5, 0, 10]);
const a = U.caja(50, 50, 20, 10);
igual("caja calcula bordes desde el centro", [a.left, a.right, a.top, a.bottom], [40, 60, 45, 55]);
igual("dos cajas que se tocan en el medio se solapan", U.rectsSeSolapan(U.caja(50, 50, 20, 10), U.caja(55, 50, 20, 10)), true);
igual("dos cajas lejanas no se solapan", U.rectsSeSolapan(U.caja(0, 0, 10, 10), U.caja(100, 100, 10, 10)), false);
igual("sePisan usa holgura (cajas casi pegadas)", [U.sePisan(U.caja(0, 0, 10, 10), U.caja(11, 0, 10, 10), 3), U.sePisan(U.caja(0, 0, 10, 10), U.caja(11, 0, 10, 10), 0)], [true, false]);
const angulos = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return U.anguloAsiento(i, 9, 0.3); });
igual("anguloAsiento da ángulos crecientes dentro de una vuelta", angulos.every(function (x, i) { return i === 0 || x > angulos[i - 1]; }) && angulos[8] < Math.PI * 2 + 0.001, true);

console.log("\n--- Mesa ---");
igual("textoAccion", [U.textoAccion("retirarse"), U.textoAccion("all-in"), U.textoAccion("ciega-grande"), U.textoAccion("???"), U.textoAccion(null)], ["Retirado", "All-in", "Ciega grande", "", ""]);
igual("colorFicha cambia según el valor", [U.colorFicha(0, 5), U.colorFicha(0, 2000), U.colorFicha(0, 20000)], ["#c41e3a", "#1a1a1a", "#f4d35e"]);
igual("textoCiegas sin torneo", U.textoCiegas({ ciegaPequena: 5, ciegaGrande: 10 }), "Ciegas 5 / 10");
igual("textoCiegas con torneo: cuenta atrás", U.textoCiegas({ ciegaPequena: 5, ciegaGrande: 10, subirCiegasCada: 10, manosParaSubirCiegas: 9 }), "Ciegas 5 / 10 · suben en 10 manos");
igual("textoCiegas con torneo: próxima mano", U.textoCiegas({ ciegaPequena: 10, ciegaGrande: 20, subirCiegasCada: 10, manosParaSubirCiegas: 0 }), "Ciegas 10 / 20 · suben en la próxima mano");

console.log("\n========================================");
console.log("Aciertos: " + aciertos + "   Fallos: " + fallos);
console.log("========================================");
if (fallos) { console.log("\nHay pruebas de utilidades que fallaron."); process.exit(1); }
console.log("\nTodas las pruebas de utilidades pasaron.");
