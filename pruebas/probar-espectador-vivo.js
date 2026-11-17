/* El espectador no se desconecta solo: el pulso del servidor (cada 20 s)
   debe considerar vivo a quien manda su "ping" de la app, aunque el pong del
   protocolo llegue tarde (navegador lento, mucho tráfico). Dura ~70 s.
   Requiere el servidor corriendo (sirve con o sin POKER_RAPIDO=1).
   Uso: node pruebas/probar-espectador-vivo.js [http://localhost:3000] */
"use strict";
const WebSocket = require("ws");
const BASE = process.argv[2] || process.env.POKER_URL || "http://localhost:3000";
const WS_URL = BASE.replace(/^http/, "ws") + "/ws";
let aciertos = 0, fallos = 0;
function ok(desc, cond, extra) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc + (extra ? "  -> " + extra : "")); }
}
function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function conectar(opciones) {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(WS_URL, opciones);
    ws.mensajes = [];
    ws.cerrado = false;
    ws.on("message", function (d) { try { ws.mensajes.push(JSON.parse(d.toString())); } catch (e) { /* */ } });
    ws.on("close", function () { ws.cerrado = true; });
    ws.on("open", function () { resolve(ws); });
    ws.on("error", reject);
  });
}
function enviar(ws, o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); }
async function esperar(ws, f, ms) {
  const limite = Date.now() + (ms || 5000);
  while (Date.now() < limite) {
    const m = ws.mensajes.find(f);
    if (m) return m;
    await dormir(40);
  }
  return null;
}
function autoJugar(ws) {
  ws.on("message", function (d) {
    let m; try { m = JSON.parse(d.toString()); } catch (e) { return; }
    if (m.tipo === "turno" && m.estado && m.tuId && m.estado.turnoId === m.tuId && m.estado.acciones) {
      enviar(ws, { tipo: "accion", accion: m.estado.acciones.puedeIgualar ? "igualar" : (m.estado.acciones.puedePasar ? "pasar" : "retirarse") });
    }
  });
}

(async function () {
  console.log("Probando que el espectador siga conectado más de 60 s en " + BASE);
  const a = await conectar();
  enviar(a, { tipo: "unirse-publica", nombre: "Ana", asientos: 9, fichasIniciales: 1000 });
  const sa = await esperar(a, function (m) { return (m.tipo === "en-sala" || m.tipo === "sala-actualizada") && m.codigo; });
  ok("Ana abre una mesa pública", !!sa);
  const b = await conectar();
  enviar(b, { tipo: "unirse", nombre: "Beto", codigo: sa.codigo });
  ok("Beto entra", !!(await esperar(b, function (m) { return (m.tipo === "en-sala" || m.tipo === "sala-actualizada") && m.codigo; })));
  autoJugar(a); autoJugar(b);
  // Los jugadores siempre responden (simulan un navegador sano)
  const timerJug = setInterval(function () { enviar(a, { tipo: "ping" }); enviar(b, { tipo: "ping" }); }, 15000);
  enviar(a, { tipo: "llenar-bots" });
  await dormir(500);
  enviar(a, { tipo: "iniciar" });

  // Espectador "lento": no contesta el ping del protocolo, solo manda el ping de la app como el navegador
  const esp = await conectar({ autoPong: false });
  enviar(esp, { tipo: "mirar", codigo: sa.codigo });
  ok("El espectador entra a mirar", !!(await esperar(esp, function (m) { return m.esEspectador === true; })));
  const timerEsp = setInterval(function () { enviar(esp, { tipo: "ping" }); }, 15000);
  // Control: otro espectador que no manda nada debe ser cortado por el pulso (la prueba sí ejercita el pulso)
  const mudo = await conectar({ autoPong: false });
  enviar(mudo, { tipo: "mirar", codigo: sa.codigo });
  await esperar(mudo, function (m) { return m.esEspectador === true; });

  const inicio = Date.now();
  await dormir(65000);
  const n0 = esp.mensajes.length;
  await dormir(3000);
  ok("Tras " + Math.round((Date.now() - inicio) / 1000) + " s el espectador sigue conectado", !esp.cerrado && esp.readyState === 1);
  ok("…y sigue recibiendo la partida", esp.mensajes.length > n0 || esp.mensajes.some(function (m) { return m.tipo === "pong"; }), (esp.mensajes.length - n0) + " mensajes nuevos");
  ok("Control: una conexión muda sí la corta el pulso", mudo.cerrado);
  ok("Los jugadores siguen conectados", !a.cerrado && !b.cerrado);

  clearInterval(timerJug); clearInterval(timerEsp);
  [a, b, esp, mudo].forEach(function (w) { try { w.close(); } catch (e) { /* */ } });
  console.log("\nResultado: " + aciertos + " bien, " + fallos + " mal");
  process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
