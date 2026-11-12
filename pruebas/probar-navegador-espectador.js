/* Prueba en navegador real del modo espectador (mirar una mesa en curso).
   Requiere el servidor en marcha (mejor con POKER_RAPIDO=1) y Playwright.
   Uso: node pruebas/probar-navegador-espectador.js http://localhost:3000 */
"use strict";
const WebSocket = require("ws");

function cargarPlaywright() {
  const candidatos = ["playwright", "playwright-core", "/opt/npm-tools/node_modules/playwright", "/tmp/pw/node_modules/playwright-core"];
  for (let i = 0; i < candidatos.length; i++) {
    try { return require(candidatos[i]); } catch (e) { /* siguiente */ }
  }
  return null;
}
const pw = cargarPlaywright();
if (!pw) { console.log("OMITIDA: no hay Playwright instalado."); process.exit(0); }

const BASE = process.argv[2] || process.env.POKER_URL || "http://localhost:3000";
const WS_URL = BASE.replace(/^http/, "ws") + "/ws";
let aciertos = 0, fallos = 0;
function ok(desc, cond, extra) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc + (extra ? "  -> " + extra : "")); }
}
function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  // Anfitrión (por WebSocket) que crea una mesa de torneo con bots y juega solo
  const host = new WebSocket(WS_URL);
  await new Promise(function (r) { host.on("open", r); });
  let codigo = null;
  host.on("message", function (d) {
    const m = JSON.parse(d.toString());
    if (m.tipo === "en-sala" && !codigo) codigo = m.codigo;
    if (m.estado && m.tuId && m.estado.turnoId === m.tuId && m.estado.acciones) {
      host.send(JSON.stringify({ tipo: "accion", accion: m.estado.acciones.puedePasar ? "pasar" : "retirarse" }));
    }
  });
  host.send(JSON.stringify({ tipo: "crear-privada", nombre: "Anfitrion", asientos: 9, fichasIniciales: 1000, torneo: true }));
  while (!codigo) await dormir(50);
  host.send(JSON.stringify({ tipo: "llenar-bots" }));
  await dormir(300);
  host.send(JSON.stringify({ tipo: "iniciar" }));
  console.log("Mesa de prueba " + codigo);

  const navegador = await pw.chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: 1024, height: 700 } });
  const errores = [];
  pagina.on("pageerror", function (e) { errores.push(e.message); });
  pagina.on("console", function (m) {
    if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) errores.push(m.text());
  });

  await pagina.goto(BASE);
  await pagina.click("#opciones-online summary");
  ok("Está el botón «Solo mirar»", await pagina.isVisible("#btn-mirar-codigo"));
  await pagina.fill("#input-codigo", codigo);
  await pagina.click("#btn-mirar-codigo");
  await pagina.waitForSelector("#pantalla-mesa:not([hidden])", { timeout: 8000 });
  await pagina.waitForTimeout(1500);

  ok("Entra directamente a la mesa", await pagina.isVisible("#pantalla-mesa"));
  ok("Se indica que está mirando", /^👁/.test((await pagina.textContent("#info-sala")).trim()), await pagina.textContent("#info-sala"));
  ok("No tiene botón de chat ni de cuentas", await pagina.isHidden("#btn-abrir-chat") && await pagina.isHidden("#btn-abrir-cuentas"));
  ok("No tiene panel de acciones (no puede jugar)", await pagina.isHidden("#panel-acciones"));
  ok("Ve que la mesa es de torneo", /suben en/.test(await pagina.textContent("#info-ciegas")), await pagina.textContent("#info-ciegas"));
  const asientos = await pagina.$$("#asientos .pieza-info");
  ok("Ve a los 9 jugadores (" + asientos.length + " asientos)", asientos.length === 9);

  // Esperamos a ver el flop
  const limite = Date.now() + 40000;
  let cartasMesa = 0;
  while (Date.now() < limite && cartasMesa < 3) {
    cartasMesa = await pagina.$$eval("#comunitarias .carta", function (c) { return c.length; });
    await dormir(500);
  }
  ok("Ve las cartas comunitarias aparecer (" + cartasMesa + ")", cartasMesa >= 3);
  ok("Su panel de acciones sigue oculto durante la partida", await pagina.isHidden("#panel-acciones"));
  await pagina.screenshot({ path: "/tmp/captura-espectador.png" });

  // El anfitrión se va: la mesa se cierra y el espectador vuelve al menú
  host.send(JSON.stringify({ tipo: "salir" }));
  await pagina.waitForSelector("#pantalla-menu:not([hidden])", { timeout: 8000 }).catch(function () { /* se comprueba abajo */ });
  ok("Cuando la mesa se cierra vuelve al menú", await pagina.isVisible("#pantalla-menu"));

  ok("No hubo errores de JavaScript", errores.length === 0, errores.slice(0, 3).join(" | "));
  await navegador.close();
  host.close();
  console.log("\n========================================");
  console.log("Aciertos: " + aciertos + "   Fallos: " + fallos);
  console.log("========================================");
  if (fallos) { console.log("\nHay pruebas de espectador en navegador que fallaron."); process.exit(1); }
  console.log("\nTodas las pruebas de espectador en navegador pasaron.");
  process.exit(0);
})().catch(function (e) { console.log("FALLO: " + e.message); process.exit(1); });
