/* Reloj de turno visto desde un navegador real (como espectador de una mesa con un humano lento).
   Arranca su propio servidor con turnos de 6 s. Necesita Playwright.
   Ejecutar: node pruebas/probar-navegador-turno.js */
"use strict";
const { spawn } = require("child_process");
const path = require("path");
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

const PUERTO = 4900 + Math.floor(Math.random() * 100);
let aciertos = 0, fallos = 0;
function ok(desc, cond, extra) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc + (extra ? "  -> " + extra : "")); }
}
function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  const servidor = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: Object.assign({}, process.env, { PORT: String(PUERTO), POKER_RAPIDO: "1", POKER_TURNO_MS: "6000" }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  await new Promise(function (resolve, reject) {
    servidor.stdout.on("data", function (d) { if (/listo/i.test(String(d))) resolve(); });
    servidor.stderr.on("data", function (d) { reject(new Error(String(d))); });
    setTimeout(function () { reject(new Error("el servidor no arrancó")); }, 6000);
  });
  const navegador = await pw.chromium.launch();
  try {
    // Un humano muy lento: crea la mesa, llena de bots, inicia y no hace nada
    const host = new WebSocket("ws://localhost:" + PUERTO + "/ws");
    await new Promise(function (r) { host.on("open", r); });
    let codigo = null, avisos = 0;
    host.on("message", function (d) {
      const m = JSON.parse(d.toString());
      if (m.tipo === "en-sala" && !codigo) codigo = m.codigo;
      if (m.tipo === "aviso-turno") avisos++;
    });
    host.send(JSON.stringify({ tipo: "crear-privada", nombre: "Lento", asientos: 9, fichasIniciales: 1000 }));
    while (!codigo) await dormir(30);
    host.send(JSON.stringify({ tipo: "llenar-bots" }));
    await dormir(200);
    host.send(JSON.stringify({ tipo: "iniciar" }));

    const pagina = await navegador.newPage({ viewport: { width: 1024, height: 700 } });
    const errores = [];
    pagina.on("pageerror", function (e) { errores.push(e.message); });
    pagina.on("console", function (m) {
      if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) errores.push(m.text());
    });
    await pagina.goto("http://localhost:" + PUERTO);
    await pagina.click("#opciones-online summary");
    await pagina.fill("#input-codigo", codigo);
    await pagina.click("#btn-mirar-codigo");
    await pagina.waitForSelector("#pantalla-mesa:not([hidden])", { timeout: 8000 });

    await pagina.waitForSelector("#reloj-turno:not([hidden])", { timeout: 8000 });
    const t1 = (await pagina.textContent("#reloj-turno")).trim();
    const s1 = Number((/(\d+) s/.exec(t1) || [])[1]);
    ok("El reloj muestra de quién es el turno y los segundos (\"" + t1 + "\")", /^⏱ Lento · \d+ s$/.test(t1));
    await pagina.screenshot({ path: "/tmp/captura-reloj.png" });
    await pagina.waitForTimeout(2200);
    const t2 = (await pagina.textContent("#reloj-turno")).trim();
    const s2 = Number((/(\d+) s/.exec(t2) || [])[1]);
    ok("La cuenta atrás baja con el tiempo (" + s1 + " s → " + s2 + " s)", s2 < s1 && s2 >= 1);

    // Pasado el límite el servidor actúa y el reloj desaparece mientras juegan los bots
    let desaparecio = true;
    try {
      await pagina.waitForFunction(function () { return document.getElementById("reloj-turno").hidden; }, null, { timeout: 12000, polling: 50 });
    } catch (e) { desaparecio = false; }
    ok("Al agotarse el tiempo el reloj desaparece (el turno pasó a otro)", desaparecio);
    ok("El servidor avisó al jugador lento", avisos >= 1);
    ok("No hubo errores de JavaScript", errores.length === 0, errores.slice(0, 3).join(" | "));
    host.close();
  } finally {
    await navegador.close();
    servidor.kill();
  }
  console.log("\n========================================");
  console.log("Aciertos: " + aciertos + "   Fallos: " + fallos);
  console.log("========================================");
  if (fallos) { console.log("\nHay pruebas del reloj en navegador que fallaron."); process.exit(1); }
  console.log("\nTodas las pruebas del reloj en navegador pasaron.");
  process.exit(0);
})().catch(function (e) { console.log("FALLO: " + e.message); process.exit(1); });
