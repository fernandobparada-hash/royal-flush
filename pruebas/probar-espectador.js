/* Modo espectador y modo torneo contra el servidor real.
   Requiere el servidor en marcha: POKER_RAPIDO=1 npm start
   Uso: node pruebas/probar-espectador.js [http://localhost:3000] */
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
function conectar() {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(WS_URL);
    ws.mensajes = [];
    ws.on("message", function (d) { try { ws.mensajes.push(JSON.parse(d.toString())); } catch (e) { /* */ } });
    ws.on("open", function () { resolve(ws); });
    ws.on("error", reject);
  });
}
function enviar(ws, o) { ws.send(JSON.stringify(o)); }
function tipos(ws) { return ws.mensajes.map(function (m) { return m.tipo; }); }
async function esperar(ws, tipo, ms) {
  const limite = Date.now() + (ms || 5000);
  while (Date.now() < limite) {
    const m = ws.mensajes.find(function (x) { return x.tipo === tipo; });
    if (m) return m;
    await dormir(40);
  }
  return null;
}

(async function () {
  console.log("Probando espectador y torneo en " + BASE);

  // Anfitrión crea una sala de torneo y llena de bots
  const anfi = await conectar();
  enviar(anfi, { tipo: "crear-privada", nombre: "Anfitrion", asientos: 9, fichasIniciales: 1000, torneo: true });
  const sala = await esperar(anfi, "en-sala");
  ok("Se crea la sala de torneo", !!sala && /^[A-Z]{5}$/.test(sala.codigo));
  ok("La sala avisa que es de torneo (cada 10 manos)", sala.subirCiegasCada === 10 && sala.estado.subirCiegasCada === 10, JSON.stringify([sala.subirCiegasCada, sala.estado && sala.estado.subirCiegasCada]));
  const codigo = sala.codigo;

  // Espectador con código malo y con código bueno
  const esp = await conectar();
  enviar(esp, { tipo: "mirar", codigo: "ZZZZZ" });
  const err = await esperar(esp, "error");
  ok("Mirar una sala que no existe da error", !!err && err.codigoError === "sala-inexistente");
  enviar(esp, { tipo: "mirar", codigo: "ab" });
  await dormir(200);
  ok("Un código mal escrito también da error", esp.mensajes.filter(function (m) { return m.tipo === "error"; }).length === 2);

  esp.mensajes.length = 0;
  enviar(esp, { tipo: "mirar", codigo: codigo });
  const mirando = await esperar(esp, "mirando");
  ok("Con el código correcto empieza a mirar", !!mirando && mirando.esEspectador === true && mirando.codigo === codigo);
  ok("No recibe las cuentas en Bs de los jugadores", mirando && mirando.cuentas === undefined);
  ok("No recibe token (no es un jugador)", mirando && !mirando.token);

  // El anfitrión juega solo: pasa si puede y si no se retira (así la partida no se queda esperándolo)
  anfi.on("message", function (d) {
    let m; try { m = JSON.parse(d.toString()); } catch (e) { return; }
    if (m.estado && m.tuId && m.estado.turnoId === m.tuId && m.estado.acciones) {
      enviar(anfi, { tipo: "accion", accion: m.estado.acciones.puedePasar ? "pasar" : "retirarse" });
    }
  });

  // El anfitrión llena con bots e inicia
  anfi.mensajes.length = 0;
  enviar(anfi, { tipo: "llenar-bots" });
  await dormir(300);
  esp.mensajes.length = 0;
  enviar(anfi, { tipo: "iniciar" });
  const mano = await esperar(esp, "mano-iniciada", 6000);
  ok("El espectador ve empezar la mano", !!mano);
  ok("Y la mesa que ve es de torneo", mano && mano.estado.subirCiegasCada === 10 && mano.estado.manosParaSubirCiegas === 9, mano && JSON.stringify([mano.estado.subirCiegasCada, mano.estado.manosParaSubirCiegas]));
  await dormir(2500);

  // Nunca ve cartas privadas
  let cartasPrivadas = 0, vioTusCartas = false;
  esp.mensajes.forEach(function (m) {
    if (m.tipo === "tus-cartas") vioTusCartas = true;
    if (m.estado && m.estado.jugadores) {
      m.estado.jugadores.forEach(function (j) {
        (j.cartas || []).forEach(function (c) { if (!c.oculta) cartasPrivadas++; });
      });
    }
  });
  ok("Nunca recibe el mensaje 'tus-cartas'", vioTusCartas === false);
  ok("Ninguna carta privada viaja hasta el espectador (salvo showdown)", cartasPrivadas === 0 || esp.mensajes.some(function (m) { return m.tipo === "showdown"; }), "cartas visibles: " + cartasPrivadas);
  ok("Recibe las acciones de la mesa", tipos(esp).indexOf("accion") >= 0 || tipos(esp).indexOf("turno") >= 0);

  // No puede jugar ni hablar
  esp.mensajes.length = 0;
  enviar(esp, { tipo: "accion", accion: "retirarse" });
  enviar(esp, { tipo: "chat", frase: "Gg" });
  enviar(esp, { tipo: "iniciar" });
  enviar(esp, { tipo: "recargar", bs: 10 });
  await dormir(400);
  const errores = esp.mensajes.filter(function (m) { return m.tipo === "error"; });
  ok("Un espectador no puede actuar, chatear, iniciar ni recargar (" + errores.length + " rechazos)", errores.length === 4);
  ok("Y no se emite ningún chat en la mesa por su culpa", !tipos(anfi).includes("chat"));

  // Irse no afecta a la partida
  enviar(esp, { tipo: "salir" });
  await dormir(300);
  anfi.mensajes.length = 0;
  await dormir(1500);
  ok("La partida sigue después de que se vaya el espectador", anfi.mensajes.length > 0);

  // Si la sala se cierra, el espectador se entera
  const esp2 = await conectar();
  enviar(esp2, { tipo: "mirar", codigo: codigo });
  await esperar(esp2, "mirando");
  esp2.mensajes.length = 0;
  enviar(anfi, { tipo: "salir" });
  const cierre = await esperar(esp2, "error", 3000);
  ok("Si la mesa se cierra, quien miraba recibe el aviso", !!cierre && cierre.codigoError === "sala-inexistente");

  anfi.close(); esp.close(); esp2.close();
  console.log("\n========================================");
  console.log("Aciertos: " + aciertos + "   Fallos: " + fallos);
  console.log("========================================");
  if (fallos) { console.log("\nHay pruebas de espectador que fallaron."); process.exit(1); }
  console.log("\nTodas las pruebas de espectador y torneo pasaron.");
  process.exit(0);
})().catch(function (e) { console.log("FALLO: " + e.message); process.exit(1); });
