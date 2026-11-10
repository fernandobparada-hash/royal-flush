/* Pruebas del online v6: gracia al desconectar, reconexión,
   mesa llena, sala inexistente, unirse a mitad de mano, chat. */
"use strict";
const WebSocket = require("ws");
const BASE = process.argv[2] || process.env.POKER_URL || "http://localhost:3000";
const WS_URL = BASE.replace(/^http/, "ws") + "/ws";

function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function conectar() {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(WS_URL);
    const c = { ws: ws, mensajes: [], tuId: null, codigo: null, estado: null, token: null };
    const timer = setTimeout(function () { reject(new Error("No se abrió " + WS_URL)); }, 8000);
    ws.on("open", function () { clearTimeout(timer); resolve(c); });
    ws.on("error", function (e) { clearTimeout(timer); reject(e); });
    ws.on("message", function (raw) {
      const msg = JSON.parse(raw.toString());
      c.mensajes.push(msg);
      if (msg.tuId) c.tuId = msg.tuId;
      if (msg.codigo) c.codigo = msg.codigo;
      if (msg.token) c.token = msg.token;
      if (msg.estado) c.estado = msg.estado;
    });
  });
}
function enviar(c, obj) { c.ws.send(JSON.stringify(obj)); }
function esperar(c, pred, ms, pista) {
  ms = ms || 5000;
  const t0 = Date.now();
  return new Promise(function (resolve, reject) {
    const ya = c.mensajes.find(pred);
    if (ya) return resolve(ya);
    const iv = setInterval(function () {
      const m = c.mensajes.find(pred);
      if (m) { clearInterval(iv); resolve(m); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error("Tiempo agotado: " + pista)); }
    }, 20);
  });
}

async function main() {
  console.log("Conectando a", WS_URL);

  // nombre vacío
  let a = await conectar();
  enviar(a, { tipo: "crear-privada", nombre: " " });
  const errNom = await esperar(a, function (m) { return m.tipo === "error"; }, 4000, "nombre vacío");
  if (!/nombre/i.test(errNom.mensaje)) throw new Error("Mensaje de nombre inesperado: " + errNom.mensaje);
  console.log("  OK  Nombre vacío da un error claro");
  a.ws.close();

  // sala inexistente
  a = await conectar();
  enviar(a, { tipo: "unirse", nombre: "Ana", codigo: "ZZZZZ" });
  const errNo = await esperar(a, function (m) { return m.tipo === "error"; }, 4000, "sala inexistente");
  if (errNo.mensaje !== "La sala ya no existe, crea una nueva") {
    throw new Error("Mensaje de sala inexistente: " + errNo.mensaje);
  }
  console.log("  OK  Sala inexistente: mensaje claro");
  a.ws.close();

  // crear, desconectar anfitrión, unirse de todos modos (gracia)
  a = await conectar();
  enviar(a, { tipo: "crear-privada", nombre: "Ana", asientos: 9, avatar: { pelo: 2 } });
  const creada = await esperar(a, function (m) { return m.tipo === "en-sala" && m.codigo; }, 4000, "crear");
  if (!creada.token) throw new Error("La creación no devolvió token");
  const codigo = a.codigo;
  const tokenAna = a.token;
  a.ws.close();
  await dormir(200);

  let b = await conectar();
  enviar(b, { tipo: "unirse", nombre: "Bruno", codigo: codigo.toLowerCase() });
  await esperar(b, function (m) { return (m.tipo === "en-sala" || m.tipo === "sala-actualizada") && m.codigo === codigo; }, 4000, "Bruno entra con anfitrión desconectado");
  console.log("  OK  El amigo entra aunque el anfitrión se desconectó un momento (código en minúsculas)");

  // anfitrión reconecta
  a = await conectar();
  enviar(a, { tipo: "reconectar", token: tokenAna, codigo: codigo });
  await esperar(a, function (m) { return m.token === tokenAna && (m.tipo === "en-sala" || m.tipo === "sala-actualizada"); }, 4000, "reconectar Ana");
  if (a.tuId && b.estado) {
    const ana = (a.estado.jugadores || []).find(function (j) { return j.id === a.tuId; });
    if (!ana) throw new Error("Ana no recuperó su asiento");
  }
  console.log("  OK  Reconexión con token recupera el asiento");

  // empezar y unirse a mitad de mano
  enviar(a, { tipo: "iniciar" });
  await esperar(a, function (m) { return m.tipo === "mano-iniciada"; }, 4000, "iniciar");
  let c = await conectar();
  enviar(c, { tipo: "unirse", nombre: "Cata", codigo: codigo });
  await esperar(c, function (m) { return m.tipo === "sala-actualizada" || m.tipo === "en-sala"; }, 4000, "Cata a mitad");
  const cata = (c.estado && c.estado.jugadores || []).find(function (j) { return j.nombre && j.nombre.indexOf("Cata") === 0; });
  if (!cata) throw new Error("Cata no se sentó a mitad de mano");
  if (cata.enMano) throw new Error("Cata no debería estar en la mano en curso");
  console.log("  OK  Se puede entrar a mitad de partida (juega la próxima mano)");

  // chat y rate limit
  enviar(b, { tipo: "chat", frase: "¡Buena mano!" });
  await esperar(a, function (m) { return m.tipo === "chat" && m.frase === "¡Buena mano!"; }, 4000, "chat");
  enviar(b, { tipo: "chat", frase: "Gg" });
  const rapido = await esperar(b, function (m) { return m.tipo === "error" && m.codigoError === "chat-rapido"; }, 4000, "rate limit chat");
  if (!rapido) throw new Error("No se limitó el chat");
  console.log("  OK  Chat de frases y límite de 1 cada 2s");

  // mesa llena: 9 asientos, ya hay Ana, Bruno, Cata — sentar 6 bots y un 10mo humano falla
  enviar(a, { tipo: "llenar-bots" });
  await esperar(a, function (m) { return m.tipo === "sala-actualizada" && m.estado && m.estado.jugadores.length === 9; }, 4000, "bots");
  let d = await conectar();
  enviar(d, { tipo: "unirse", nombre: "Diego", codigo: codigo });
  const llena = await esperar(d, function (m) { return m.tipo === "error"; }, 4000, "mesa llena");
  if (!/completa/i.test(llena.mensaje)) throw new Error("Mesa llena: " + llena.mensaje);
  console.log("  OK  Mesa llena avisa con claridad");

  a.ws.close(); b.ws.close(); c.ws.close(); d.ws.close();
  console.log("\nTodas las pruebas online v6 pasaron.\n");
}

main().catch(function (e) {
  console.error("\nFALLO:", e.message);
  process.exit(1);
});
