/* Prueba en un navegador real (Chromium) del modo solo: torneo, sonido, historial.
   Necesita Playwright instalado (npm i -D playwright && npx playwright install chromium).
   Uso: node pruebas/probar-navegador.js [url]     (por defecto abre royal-flush.html) */
"use strict";
const path = require("path");

function cargarPlaywright() {
  const candidatos = ["playwright", "playwright-core", "/opt/npm-tools/node_modules/playwright", "/tmp/pw/node_modules/playwright-core"];
  for (let i = 0; i < candidatos.length; i++) {
    try { return require(candidatos[i]); } catch (e) { /* siguiente */ }
  }
  return null;
}
const pw = cargarPlaywright();
if (!pw) {
  console.log("OMITIDA: no hay Playwright instalado, no se puede abrir un navegador.");
  process.exit(0);
}

const URL = process.argv[2] || ("file://" + path.join(__dirname, "..", "royal-flush.html"));
let aciertos = 0, fallos = 0;
function ok(desc, cond, extra) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc + (extra ? "  -> " + extra : "")); }
}

(async function () {
  const navegador = await pw.chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: 1024, height: 700 } });
  const errores = [];
  pagina.on("pageerror", function (e) { errores.push(e.message); });
  pagina.on("console", function (m) {
    // Sin internet no cargan las fuentes de Google: no es un fallo del juego
    if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) errores.push(m.text());
  });

  console.log("Abriendo " + URL);
  await pagina.goto(URL);
  await pagina.fill("#nombre-jugador", "Tester");
  await pagina.click("#btn-solo");
  await pagina.click("#btn-avatar-saltar");
  await pagina.waitForSelector("#pantalla-solo:not([hidden])");
  ok("Aparece la casilla de modo torneo en la pantalla de modo solo", await pagina.isVisible("#torneo-solo"));

  await pagina.check("#torneo-solo");
  await pagina.click("#btn-empezar-solo");
  await pagina.waitForSelector("#pantalla-mesa:not([hidden])");
  await pagina.waitForTimeout(500);
  const ciegas = await pagina.textContent("#info-ciegas");
  ok("En modo torneo la mesa avisa cuándo suben las ciegas (\"" + ciegas.trim() + "\")", /Ciegas 5 \/ 10 · suben en 10 manos/.test(ciegas));
  ok("Están los botones de historial y sonido", await pagina.isVisible("#btn-abrir-historial") && await pagina.isVisible("#btn-sonido"));

  // Sonido: se puede silenciar y se recuerda
  await pagina.click("#btn-sonido");
  ok("Al pulsar el altavoz se silencia", (await pagina.getAttribute("#btn-sonido", "aria-pressed")) === "false" && (await pagina.textContent("#btn-sonido")).trim() === "🔇");
  ok("La preferencia queda guardada", (await pagina.evaluate(function () { return localStorage.getItem("rf_sonido"); })) === "0");
  await pagina.click("#btn-sonido");
  ok("Al pulsar otra vez se activa", (await pagina.getAttribute("#btn-sonido", "aria-pressed")) === "true");

  // Historial vacío al principio
  await pagina.click("#btn-abrir-historial");
  ok("El historial empieza vacío", /Todavía no ha terminado/.test(await pagina.textContent("#lista-historial")));
  await pagina.click("#btn-cerrar-historial");
  ok("El panel de historial se puede cerrar", await pagina.isHidden("#panel-historial"));

  // Jugamos una mano retirándonos o pasando para que termine pronto
  console.log("  ... jugando una mano completa (puede tardar un minuto)");
  const limite = Date.now() + 150000;
  let fin = false;
  while (Date.now() < limite && !fin) {
    const panelVisible = await pagina.isVisible("#panel-acciones");
    if (panelVisible) {
      if (await pagina.isEnabled("#btn-pasar") && await pagina.isVisible("#btn-pasar")) await pagina.click("#btn-pasar");
      else if (await pagina.isEnabled("#btn-retirarse")) await pagina.click("#btn-retirarse");
    }
    fin = await pagina.evaluate(function () {
      const m = document.getElementById("mensaje-mesa");
      return !!(m && m.className === "premio");
    });
    await pagina.waitForTimeout(400);
  }
  ok("La mano terminó y se mostró el premio", fin);
  await pagina.waitForTimeout(500);

  await pagina.click("#btn-abrir-historial");
  const filas = await pagina.$$(".fila-historial");
  ok("El historial tiene la mano que acaba de terminar (" + filas.length + " fila)", filas.length === 1);
  const texto = filas.length ? await filas[0].textContent() : "";
  ok("Muestra el número de mano y el bote (\"" + texto.slice(0, 40).replace(/\s+/g, " ") + "...\")", /Mano 1/.test(texto) && /Bote \d+/.test(texto));
  await pagina.screenshot({ path: "/tmp/captura-historial.png" });

  ok("No hubo errores de JavaScript en la página", errores.length === 0, errores.slice(0, 3).join(" | "));

  await navegador.close();
  console.log("\n========================================");
  console.log("Aciertos: " + aciertos + "   Fallos: " + fallos);
  console.log("========================================");
  if (fallos) { console.log("\nHay pruebas de navegador que fallaron."); process.exit(1); }
  console.log("\nTodas las pruebas de navegador pasaron.");
  process.exit(0);
})().catch(function (e) { console.log("FALLO: " + e.message); process.exit(1); });
