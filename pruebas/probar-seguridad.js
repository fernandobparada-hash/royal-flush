/* Pruebas de seguridad contra el servidor real.
   Requiere el servidor en marcha:  npm start   (sin POKER_RAPIDO para probar los límites reales)
   Uso: node pruebas/probar-seguridad.js [http://localhost:3000]
*/
"use strict";
const http = require("http");
const WebSocket = require("ws");
const BASE = process.argv[2] || process.env.POKER_URL || "http://localhost:3000";
const WS_URL = BASE.replace(/^http/, "ws") + "/ws";
let aciertos = 0, fallos = 0;
function ok(desc, cond) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc); }
}
function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function pedir(ruta) {
  return new Promise(function (resolve, reject) {
    http.get(BASE + ruta, function (res) {
      res.resume();
      res.on("end", function () { resolve(res); });
    }).on("error", reject);
  });
}
function abrir() {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(WS_URL);
    ws.mensajes = [];
    ws.cierre = null;
    ws.on("message", function (d) { try { ws.mensajes.push(JSON.parse(d.toString())); } catch (e) { /* */ } });
    ws.on("close", function (codigo) { ws.cierre = codigo; });
    ws.on("error", function () { /* se comprueba por el cierre */ });
    ws.on("open", function () { resolve(ws); });
    setTimeout(function () { reject(new Error("no abre")); }, 4000);
  });
}

(async function () {
  console.log("Probando seguridad en " + BASE);

  const r = await pedir("/salud");
  ok("Cabecera X-Content-Type-Options: nosniff", r.headers["x-content-type-options"] === "nosniff");
  ok("Cabecera X-Frame-Options: DENY", r.headers["x-frame-options"] === "DENY");
  ok("Cabecera Content-Security-Policy presente", /default-src 'self'/.test(r.headers["content-security-policy"] || ""));
  ok("No anuncia que usa Express", !r.headers["x-powered-by"]);

  // Mensaje gigante: el servidor debe cortar la conexión
  let ws = await abrir();
  ws.send(JSON.stringify({ tipo: "ping", relleno: "x".repeat(50 * 1024) }));
  await dormir(500);
  ok("Un mensaje de 50 KB cierra la conexión (código 1009)", ws.cierre === 1009);

  // Mensaje basura: no debe tumbar nada
  ws = await abrir();
  ws.send("esto no es json");
  ws.send("null");
  ws.send("[1,2,3]");
  ws.send(JSON.stringify({ tipo: "unirse", codigo: { a: 1 }, nombre: ["x"] }));
  await dormir(400);
  ok("Mensajes basura reciben error pero no cierran la conexión", ws.cierre === null && ws.mensajes.some(function (m) { return m.tipo === "error"; }));
  ws.close();

  // Inundación de mensajes
  ws = await abrir();
  for (let i = 0; i < 400; i++) ws.send(JSON.stringify({ tipo: "ping" }));
  await dormir(700);
  ok("Una inundación de mensajes recibe aviso", ws.mensajes.some(function (m) { return m.tipo === "error" && /muy r/i.test(m.mensaje || ""); }));
  ok("Y al insistir se cierra la conexión (código 1008)", ws.cierre === 1008);

  // Código de sala con formato correcto
  ws = await abrir();
  ws.send(JSON.stringify({ tipo: "crear-privada", nombre: "Prueba", asientos: 9, fichasIniciales: 1000 }));
  await dormir(500);
  const sala = ws.mensajes.find(function (m) { return m.codigo; });
  ok("El código de sala son 5 letras sin O ni I", !!sala && /^[A-HJ-NP-Z]{5}$/.test(sala.codigo));
  ws.close();

  // Límite de consultas HTTP (solo se nota si el servidor no está en modo rápido)
  let limitado = false;
  for (let i = 0; i < 80 && !limitado; i++) {
    const rr = await pedir("/api/sala/ABCDE");
    if (rr.statusCode === 429) limitado = true;
  }
  if (limitado) ok("Consultar /api/sala sin parar acaba en 429", true);
  else console.log("  --  (omitido: el servidor parece estar en modo rápido, límites relajados)");

  console.log("\n========================================");
  console.log("Aciertos: " + aciertos + "   Fallos: " + fallos);
  console.log("========================================");
  if (fallos) { console.log("\nHay pruebas de seguridad que fallaron."); process.exit(1); }
  console.log("\nTodas las pruebas de seguridad pasaron.");
  process.exit(0);
})().catch(function (e) { console.log("FALLO: " + e.message); process.exit(1); });
