/* Cliente Key Value (Redis) sin dependencias, probado contra un servidor falso.
   También arranca el juego con REDIS_URL y comprueba que una mesa sobrevive al reinicio del juego.
   Uso: node pruebas/probar-kv.js */
"use strict";
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const WebSocket = require("ws");
const { crearKVFalso } = require("./kv-falso");
const { almacenKV } = require("../servidor/almacen");
const { crearClienteKV } = require("../servidor/kv");

let aciertos = 0, fallos = 0;
function ok(t, c) { if (c) { aciertos++; console.log("  OK  " + t); } else { fallos++; console.log("  FALLO  " + t); } }
function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function arrancarJuego(puerto, url) {
  return new Promise(function (resolve, reject) {
    const hijo = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
      env: Object.assign({}, process.env, { PORT: String(puerto), POKER_RAPIDO: "1", REDIS_URL: url, POKER_ALMACEN_ARCHIVO: "" }),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let log = "";
    const t = setTimeout(function () { reject(new Error("no arrancó: " + log)); }, 8000);
    hijo.stdout.on("data", function (d) { log += d; if (/listo en/.test(log)) { clearTimeout(t); resolve(hijo); } });
    hijo.stderr.on("data", function (d) { log += d; });
  });
}
function salud(puerto) {
  return new Promise(function (r) { http.get("http://127.0.0.1:" + puerto + "/salud", function (res) { let t = ""; res.on("data", function (d) { t += d; }); res.on("end", function () { r(JSON.parse(t)); }); }); });
}
function cliente(puerto) {
  return new Promise(function (resolve) {
    const ws = new WebSocket("ws://127.0.0.1:" + puerto + "/ws");
    const c = { ws: ws, msgs: [] };
    ws.on("message", function (raw) { const m = JSON.parse(raw.toString()); c.msgs.push(m); if (m.token) c.token = m.token; if (m.codigo && !c.codigo) c.codigo = m.codigo; if (m.cuentas) c.cuentas = m.cuentas; });
    ws.on("open", function () { resolve(c); });
  });
}
async function esperar(c, pred, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const m = c.msgs.find(pred); if (m) return m; await dormir(20); }
  return null;
}

async function main() {
  // 1) Cliente directo
  const kv = await crearKVFalso({ clave: "s3creta" });
  const url = "redis://red-prueba:s3creta@127.0.0.1:" + kv.puerto;
  const alm = almacenKV(url);
  ok("PING responde PONG", (await alm.probar()) === "PONG");
  ok("Se autentica con usuario y clave de la URL", kv.comandos[0][0] === "AUTH" && kv.comandos[0][1] === "red-prueba");
  await alm.guardar("sala:ABCDE", { hola: "ñandú ♠", n: 3 }, 3600);
  const leido = await alm.leer("sala:ABCDE");
  ok("Guarda y lee JSON con acentos y símbolos", leido && leido.hola === "ñandú ♠" && leido.n === 3);
  ok("Las claves llevan el prefijo rf: y caducan (EX 3600)", kv.datos.has("rf:sala:ABCDE") && kv.datos.get("rf:sala:ABCDE").ex === 3600);
  ok("Leer algo que no existe da null", (await alm.leer("nada")) === null);
  await alm.borrar("sala:ABCDE");
  ok("Borrar funciona", !kv.datos.has("rf:sala:ABCDE"));
  const grande = "x".repeat(200000);
  await alm.guardar("grande", { t: grande });
  ok("Valores grandes (200 KB) llegan enteros", (await alm.leer("grande")).t.length === 200000);
  const varios = await Promise.all([1, 2, 3, 4, 5].map(function (i) { return alm.guardar("k" + i, i).then(function () { return alm.leer("k" + i); }); }));
  ok("Varios comandos a la vez vuelven en orden", varios.join(",") === "1,2,3,4,5");
  alm.cerrar();

  const malo = almacenKV("redis://u:incorrecta@127.0.0.1:" + kv.puerto);
  const err = await malo.probar().then(function () { return null; }, function (e) { return e; });
  ok("Clave equivocada da error (sin mostrar la clave)", err && /WRONGPASS/.test(err.message) && !/incorrecta/.test(err.message));
  malo.cerrar();

  const mudo = await crearKVFalso({ mudo: true });
  const lento = crearClienteKV("redis://127.0.0.1:" + mudo.puerto, { tiempoMaxMs: 300 });
  const t0 = Date.now();
  const errLento = await lento.comando(["PING"]).then(function () { return null; }, function (e) { return e; });
  ok("Si el KV no contesta, se rinde rápido (" + (Date.now() - t0) + " ms) en vez de colgar el juego", errLento && Date.now() - t0 < 2000);
  lento.cerrar(); mudo.cerrar();

  // 2) El juego con REDIS_URL: la mesa sobrevive a reiniciar el juego (el KV sigue vivo)
  const puerto = 3990 + Math.floor(Math.random() * 9);
  let juego = await arrancarJuego(puerto, url);
  ok("/salud dice almacén kv", (await salud(puerto)).almacen === "kv");
  const a = await cliente(puerto);
  a.ws.send(JSON.stringify({ tipo: "crear-privada", nombre: "Carla", fichasIniciales: 1000 }));
  await esperar(a, function (m) { return m.tipo === "en-sala"; }, 3000);
  a.ws.send(JSON.stringify({ tipo: "recargar", cantidadBs: 30 }));
  await esperar(a, function (m) { return m.tipo === "recarga"; }, 3000);
  await dormir(300);
  ok("La mesa quedó guardada en el KV", kv.datos.has("rf:sala:" + a.codigo));
  a.ws.terminate();
  await new Promise(function (r) { juego.once("exit", r); juego.kill("SIGKILL"); });
  juego = await arrancarJuego(puerto, url);
  const b = await cliente(puerto);
  b.ws.send(JSON.stringify({ tipo: "reconectar", token: a.token, codigo: a.codigo }));
  const vuelta = await esperar(b, function (m) { return m.cuentas && m.cuentas.jugadores.some(function (j) { return j.nombre === "Carla"; }); }, 4000);
  const carla = vuelta && vuelta.cuentas.jugadores.find(function (j) { return j.nombre === "Carla"; });
  ok("Tras reiniciar el juego, Carla vuelve con sus 130 Bs recargados", !!carla && carla.recargadoBs === 130);
  b.ws.close();
  await new Promise(function (r) { juego.once("exit", r); juego.kill("SIGKILL"); });
  kv.cerrar();

  console.log("\n========================================\nAciertos: " + aciertos + "   Fallos: " + fallos + "\n========================================");
  if (fallos) { console.log("\nHay pruebas del KV que fallaron."); process.exit(1); }
  console.log("\nTodas las pruebas del almacén Key Value pasaron.");
  process.exit(0);
}
main().catch(function (e) { console.error("FALLO:", e.message); process.exit(1); });
