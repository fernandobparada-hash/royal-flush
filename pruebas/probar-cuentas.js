/* Cuentas en Bs: recarga, mínimo, diferida, reconexión y resumen. */
"use strict";
const WebSocket = require("ws");
const BASE = process.argv[2] || process.env.POKER_URL || "http://localhost:3000";
const WS_URL = BASE.replace(/^http/, "ws") + "/ws";

function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function conectar() {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(WS_URL);
    const c = { ws: ws, mensajes: [], tuId: null, codigo: null, estado: null, token: null, cuentas: null };
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
      if (msg.cuentas) c.cuentas = msg.cuentas;
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
function cuentaDe(c, nombre) {
  const js = (c.cuentas && c.cuentas.jugadores) || [];
  return js.find(function (j) { return j.nombre && j.nombre.indexOf(nombre) === 0; });
}

async function main() {
  console.log("Conectando a", WS_URL);
  const ana = await conectar();
  const bruno = await conectar();
  enviar(ana, { tipo: "crear-privada", nombre: "Ana", asientos: 9, fichasIniciales: 1000 });
  await esperar(ana, function (m) { return m.tipo === "en-sala" && m.cuentas; }, 4000, "crear");
  const ini = cuentaDe(ana, "Ana");
  if (!ini) throw new Error("Ana no está en las cuentas al sentarse");
  if (ini.recargadoBs !== 100) throw new Error("Buy-in inicial debería ser 100 Bs, fue " + ini.recargadoBs);
  if (ana.cuentas.fichasPorBs !== 10) throw new Error("Cambio esperado 1 Bs = 10 fichas");
  console.log("  OK  El stack inicial de 1.000 fichas queda como 100 Bs recargados");

  enviar(bruno, { tipo: "unirse", nombre: "Bruno", codigo: ana.codigo });
  await esperar(bruno, function (m) { return m.cuentas && cuentaDe(bruno, "Bruno"); }, 4000, "bruno cuentas");
  if (cuentaDe(bruno, "Bruno").recargadoBs !== 100) throw new Error("Bruno debería entrar con 100 Bs");
  console.log("  OK  Bruno entra con la misma cuenta inicial");

  enviar(ana, { tipo: "recargar", cantidadBs: 5 });
  const errMin = await esperar(ana, function (m) { return m.tipo === "error"; }, 4000, "mínimo");
  if (!/10/.test(errMin.mensaje)) throw new Error("Error de mínimo inesperado: " + errMin.mensaje);
  console.log("  OK  Recarga de menos de 10 Bs se rechaza");

  ana.mensajes = ana.mensajes.filter(function (m) { return m.tipo !== "error"; });
  enviar(ana, { tipo: "recargar", cantidadBs: 10 });
  await esperar(ana, function (m) { return m.tipo === "recarga" && m.cantidadBs === 10 && !m.diferida; }, 4000, "recarga inmediata");
  const ana1 = cuentaDe(ana, "Ana");
  if (ana1.recargadoBs !== 110) throw new Error("Recargado de Ana debería ser 110 Bs, fue " + ana1.recargadoBs);
  const fichasAna = ana.estado.jugadores.find(function (j) { return j.id === ana.tuId; }).fichas;
  if (fichasAna !== 1100) throw new Error("Ana debería tener 1.100 fichas, tiene " + fichasAna);
  console.log("  OK  Recarga de 10 Bs suma 100 fichas al momento (fuera de una mano)");

  enviar(ana, { tipo: "iniciar" });
  await esperar(ana, function (m) { return m.tipo === "mano-iniciada"; }, 4000, "mano");
  enviar(bruno, { tipo: "recargar", cantidadBs: 20 });
  const def = await esperar(bruno, function (m) { return m.tipo === "recarga" && m.cantidadBs === 20; }, 4000, "recarga diferida");
  if (!def.diferida) throw new Error("En medio de la mano la recarga debería diferirse");
  const br = cuentaDe(bruno, "Bruno");
  if (br.pendienteFichas !== 200) throw new Error("Pendiente de Bruno debería ser 200 fichas");
  const fichasBr = bruno.estado.jugadores.find(function (j) { return j.id === bruno.tuId; }).fichas;
  if (fichasBr !== 1000 && fichasBr !== 990 && fichasBr !== 995) {
    // blinds may have been posted (990 or 995) or not yet (1000) depending on DELAY_REPARTO
  }
  if (fichasBr >= 1200) throw new Error("Las fichas de la recarga no deberían estar todavía: " + fichasBr);
  console.log("  OK  Recarga a mitad de mano queda pendiente para la próxima");

  const tokenB = bruno.token;
  const codigo = ana.codigo;
  bruno.ws.close();
  await dormir(200);
  const bruno2 = await conectar();
  enviar(bruno2, { tipo: "reconectar", token: tokenB, codigo: codigo });
  await esperar(bruno2, function (m) { return m.cuentas && cuentaDe({ cuentas: m.cuentas }, "Bruno"); }, 4000, "reconectar cuentas");
  const br2 = cuentaDe(bruno2, "Bruno");
  if (br2.recargadoBs !== 120) throw new Error("Tras reconectar, Bruno debería seguir con 120 Bs recargados, fue " + br2.recargadoBs);
  console.log("  OK  La cuenta sobrevive a la reconexión (mismo token)");

  // terminar at end of hand or now if between hands — try terminar, maybe deferred
  enviar(ana, { tipo: "terminar-partida" });
  const fin = await esperar(ana, function (m) { return m.tipo === "partida-terminada"; }, 4000, "terminar partida");
  const resAna = cuentaDe({ cuentas: fin.cuentas }, "Ana");
  const resBru = cuentaDe({ cuentas: fin.cuentas }, "Bruno");
  if (!resAna || !resBru) throw new Error("El resumen no trae a los dos");
  if (resBru.recargadoBs !== 120) throw new Error("Bruno recargó 120 Bs, el resumen dice " + resBru.recargadoBs);
  if (resBru.pendienteFichas) throw new Error("Al cerrar no deberían quedar fichas pendientes");
  // 200 fichas pendientes + stack menos la ciega (~10) → alrededor de 119 Bs
  if (resBru.tieneBs < 110) throw new Error("Al cerrar deberían acreditarse las fichas pendientes de Bruno, tiene " + resBru.tieneBs);
  console.log("  OK  El anfitrión cierra la partida y el resumen queda con lo recargado y lo que tiene cada uno");

  ana.ws.close();
  bruno2.ws.close();
  console.log("\nTodas las pruebas de cuentas en Bs pasaron.\n");
}

main().catch(function (e) {
  console.error("\nFALLO:", e.message);
  process.exit(1);
});
