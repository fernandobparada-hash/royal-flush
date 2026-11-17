/* Mesas que sobreviven a un reinicio del servidor, "otra partida" y grupos.
   Arranca su PROPIO servidor (modo rápido, almacén en archivo), lo apaga y lo
   vuelve a arrancar.  Uso: node pruebas/probar-persistencia.js */
"use strict";
const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const PUERTO = 3900 + Math.floor(Math.random() * 90);
const BASE = "http://127.0.0.1:" + PUERTO;
const ARCHIVO = path.join(os.tmpdir(), "rf-persistencia-" + process.pid + ".json");
let aciertos = 0, fallos = 0;
function ok(texto, cond) {
  if (cond) { aciertos++; console.log("  OK  " + texto); } else { fallos++; console.log("  FALLO  " + texto); }
}
function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function arrancar() {
  return new Promise(function (resolve, reject) {
    const hijo = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
      env: Object.assign({}, process.env, { PORT: String(PUERTO), POKER_RAPIDO: "1", POKER_ALMACEN_ARCHIVO: ARCHIVO, POKER_SECRETO: "secreto-de-prueba", REDIS_URL: "" }),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let log = "";
    const timer = setTimeout(function () { reject(new Error("El servidor no arrancó:\n" + log)); }, 8000);
    hijo.stdout.on("data", function (d) { log += d; if (/listo en/.test(log)) { clearTimeout(timer); resolve(hijo); } });
    hijo.stderr.on("data", function (d) { log += d; });
    hijo.log = function () { return log; };
  });
}
function apagar(hijo) {
  return new Promise(function (r) { hijo.once("exit", r); hijo.kill("SIGKILL"); });
}
function conectar() {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(BASE.replace("http", "ws") + "/ws");
    const c = { ws: ws, mensajes: [], cuentas: null, estado: null };
    ws.on("open", function () { resolve(c); });
    ws.on("error", reject);
    ws.on("message", function (raw) {
      const m = JSON.parse(raw.toString());
      c.mensajes.push(m);
      if (m.tuId) c.tuId = m.tuId;
      if (m.codigo && !c.codigo) c.codigo = m.codigo;
      if (m.token) c.token = m.token;
      if (m.estado) c.estado = m.estado;
      if (m.cuentas) c.cuentas = m.cuentas;
    });
  });
}
function enviar(c, o) { c.ws.send(JSON.stringify(o)); }
function esperar(c, pred, ms, pista) {
  const t0 = Date.now();
  return new Promise(function (resolve, reject) {
    const iv = setInterval(function () {
      const m = c.mensajes.find(pred);
      if (m) { clearInterval(iv); resolve(m); }
      else if (Date.now() - t0 > (ms || 5000)) { clearInterval(iv); reject(new Error("Tiempo agotado: " + pista)); }
    }, 20);
  });
}
function cuenta(c, nombre) { return ((c.cuentas && c.cuentas.jugadores) || []).find(function (j) { return j.nombre.indexOf(nombre) === 0; }); }
function postJSON(ruta, cuerpo) {
  return new Promise(function (resolve, reject) {
    const datos = JSON.stringify(cuerpo);
    const req = http.request(BASE + ruta, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(datos) } }, function (res) {
      let t = ""; res.on("data", function (d) { t += d; }); res.on("end", function () { resolve({ status: res.statusCode, json: JSON.parse(t || "{}") }); });
    });
    req.on("error", reject); req.end(datos);
  });
}
/** Juega hasta que acabe una mano: los dos pasan o igualan cuando les toca. */
async function jugarMano(a, b, ms) {
  const t0 = Date.now();
  const inicio = a.mensajes.length;
  while (Date.now() - t0 < (ms || 8000)) {
    for (const c of [a, b]) {
      const e = c.estado;
      if (e && e.turnoId === c.tuId && e.acciones && e.acciones.tipos) {
        enviar(c, { tipo: "accion", accion: e.acciones.puedePasar ? "pasar" : "igualar" });
        c.estado = Object.assign({}, e, { turnoId: null });
      }
    }
    if (a.mensajes.slice(inicio).some(function (m) { return m.tipo === "showdown" || m.tipo === "ganador-sin-showdown"; })) return true;
    await dormir(30);
  }
  return false;
}

async function main() {
  try { fs.unlinkSync(ARCHIVO); } catch (e) { /* */ }
  let srv = await arrancar();
  ok("El servidor dice que usa el almacén en archivo", /Almacén: archivo/.test(srv.log()));

  // 1) Mesa con dos jugadores, recarga y una mano jugada
  const ana = await conectar(), beto = await conectar();
  enviar(ana, { tipo: "crear-privada", nombre: "Ana", fichasIniciales: 1000 });
  await esperar(ana, function (m) { return m.tipo === "en-sala"; }, 4000, "crear");
  const codigo = ana.codigo, tokAna = ana.token;
  enviar(beto, { tipo: "unirse", nombre: "Beto", codigo: codigo });
  await esperar(beto, function (m) { return m.tipo === "en-sala" || (m.cuentas && cuenta(beto, "Beto")); }, 4000, "unirse");
  const tokBeto = beto.token;
  enviar(beto, { tipo: "recargar", cantidadBs: 20 });
  await esperar(ana, function (m) { return m.tipo === "recarga"; }, 3000, "recarga");
  enviar(ana, { tipo: "iniciar" });
  await esperar(ana, function (m) { return m.tipo === "mano-iniciada"; }, 3000, "mano");
  ok("Se jugó una mano completa antes del reinicio", await jugarMano(ana, beto));
  // Fichas justo al terminar esa mano (antes de que se pongan las ciegas de la siguiente)
  const sd = ana.mensajes.filter(function (m) { return m.tipo === "showdown" || m.tipo === "ganador-sin-showdown"; }).pop();
  const enSd = function (n) { return sd.cuentas.jugadores.find(function (j) { return j.nombre.indexOf(n) === 0; }); };
  const antesAna = enSd("Ana"), antesBeto = enSd("Beto");
  // Ahora una mano a medias: empieza la siguiente y apostamos algo
  await esperar(ana, function (m) { return m.tipo === "mano-iniciada" && ana.mensajes.filter(function (x) { return x.tipo === "mano-iniciada"; }).length >= 2; }, 4000, "segunda mano");
  await dormir(200);
  const guardado = JSON.parse(fs.readFileSync(ARCHIVO, "utf8"));
  ok("La sala está en el almacén", !!guardado["sala:" + codigo]);
  ok("Lo guardado no lleva cartas de nadie", !/"cartas"/.test(JSON.stringify(guardado["sala:" + codigo].valor.jugadores)));

  // 2) Reinicio (como cuando Render se duerme)
  ana.ws.terminate(); beto.ws.terminate();
  await apagar(srv);
  srv = await arrancar();
  const salud = await new Promise(function (r) { http.get(BASE + "/salud", function (res) { let t = ""; res.on("data", function (d) { t += d; }); res.on("end", function () { r(JSON.parse(t)); }); }); });
  ok("Tras el reinicio la memoria está vacía (salas: " + salud.salas + ")", salud.salas === 0);

  const ana2 = await conectar(), beto2 = await conectar();
  enviar(ana2, { tipo: "reconectar", token: tokAna, codigo: codigo });
  const rec = await esperar(ana2, function (m) { return m.tipo === "recuperada"; }, 4000, "recuperada").catch(function () { return null; });
  ok("Ana recupera su mesa con su token (" + codigo + ")", !!rec && ana2.codigo === codigo);
  ok("Se avisa de que la mano a medias se anuló", !!rec && /anuló/.test(rec.mensaje));
  enviar(beto2, { tipo: "unirse", nombre: "Beto", codigo: codigo, token: tokBeto });
  await esperar(beto2, function (m) { return m.cuentas && cuenta(beto2, "Beto"); }, 4000, "beto vuelve");
  const despuesAna = cuenta(beto2, "Ana"), despuesBeto = cuenta(beto2, "Beto");
  ok("Beto vuelve por el enlace con su token y sigue siendo Beto", !!despuesBeto && beto2.tuId);
  ok("Las recargas se mantienen (Beto: " + despuesBeto.recargadoBs + " Bs)", despuesBeto.recargadoBs === antesBeto.recargadoBs && despuesBeto.recargadoBs === 120);
  ok("Las fichas vuelven a las de antes de la mano anulada (Ana " + despuesAna.tieneBs + " / Beto " + despuesBeto.tieneBs + " Bs)",
    despuesAna.tieneBs === antesAna.tieneBs && despuesBeto.tieneBs === antesBeto.tieneBs);
  ok("No se crea ni se pierde dinero: suma de fichas = suma recargada", Math.abs((despuesAna.tieneBs + despuesBeto.tieneBs) - (despuesAna.recargadoBs + despuesBeto.recargadoBs)) < 0.01);
  const reanudo = await esperar(ana2, function (m) { return m.tipo === "mano-iniciada"; }, 5000, "reanudar").catch(function () { return null; });
  ok("Con los dos de vuelta la partida sigue sola", !!reanudo);
  ok("Ana sigue siendo la anfitriona", ana2.mensajes.some(function (m) { return m.esAnfitrion === true; }));

  // 3) Grupo: crear y terminar partida -> se guarda
  enviar(ana2, { tipo: "grupo", accion: "crear", nombre: "Los del viernes" });
  const g1 = await esperar(ana2, function (m) { return m.tipo === "grupo" && m.grupo; }, 4000, "grupo creado");
  ok("Se crea el grupo con un código de 6 (" + g1.grupo.codigo + ")", /^[A-Z0-9]{6}$/.test(g1.grupo.codigo));
  ok("Solo el anfitrión recibe la copia firmada", !!g1.copia && !beto2.mensajes.some(function (m) { return m.tipo === "grupo" && m.copia; }));
  await jugarMano(ana2, beto2);
  enviar(ana2, { tipo: "terminar-partida" });
  const finP1 = await esperar(beto2, function (m) { return m.tipo === "partida-terminada"; }, 4000, "fin partida 1");
  ok("Al terminar la partida la mano se congela: no le toca a nadie", finP1.estado && finP1.estado.turnoId == null);
  const sumaP1 = finP1.cuentas.jugadores.reduce(function (s, j) { return s + j.resultadoBs; }, 0);
  ok("Al terminar (también con una mano a medias) las cuentas suman 0 (" + sumaP1.toFixed(2) + ")", Math.abs(sumaP1) < 0.01);
  enviar(beto2, { tipo: "accion", accion: "pasar" });
  await esperar(beto2, function (m) { return m.tipo === "error" && /terminó/.test(m.mensaje); }, 3000, "accion rechazada");
  const g2 = await esperar(ana2, function (m) { return m.tipo === "grupo" && m.grupo && m.grupo.partidas === 1; }, 4000, "grupo con 1 partida");
  const sumaGrupo = g2.grupo.totales.reduce(function (s, t) { return s + t.resultadoBs; }, 0);
  ok("El grupo guarda la partida con ganancias y deudas que suman 0 (" + sumaGrupo.toFixed(2) + ")", Math.abs(sumaGrupo) < 0.01 && g2.grupo.totales.length === 2);

  // 4) Otra partida (revancha)
  const fin1 = cuenta(beto2, "Beto");
  enviar(beto2, { tipo: "otra-partida" });
  await esperar(beto2, function (m) { return m.tipo === "error" && /anfitrión/.test(m.mensaje); }, 3000, "solo anfitrión");
  ok("Beto (no anfitrión) no puede empezar otra partida", true);
  enviar(ana2, { tipo: "otra-partida" });
  const np = await esperar(beto2, function (m) { return m.tipo === "nueva-partida"; }, 4000, "nueva partida");
  ok("Empieza la partida 2 en la misma mesa", /partida 2/.test(np.mensaje) && np.cuentas.partidaNum === 2);
  const c2 = np.cuentas;
  ok("Las cuentas de la partida vuelven a cero (cada uno 100 Bs y 100 Bs)", c2.jugadores.every(function (j) { return j.recargadoBs === 100 && j.tieneBs === 100; }));
  const nocheBeto = c2.noche.find(function (n) { return n.nombre.indexOf("Beto") === 0; });
  ok("La noche acumula lo de la partida 1 (Beto " + nocheBeto.resultadoBs + " Bs)", Math.abs(nocheBeto.resultadoBs - fin1.resultadoBs) < 0.01);

  // 5) Copia firmada del grupo: se recupera si el almacén la pierde, y se rechaza si la tocan
  const copia = g1.copia;
  const almacenado = JSON.parse(fs.readFileSync(ARCHIVO, "utf8"));
  ok("El grupo está guardado aparte de la mesa", !!almacenado["grupo:" + g1.grupo.codigo]);
  const trucha = JSON.parse(JSON.stringify(copia));
  if (trucha.datos.sesiones[0]) trucha.datos.sesiones[0].jugadores[0].resultadoBs = 9999;
  else trucha.datos.nombre = "Otro";
  const r1 = await postJSON("/api/grupo/copia", { copia: trucha });
  ok("Una copia modificada a mano se rechaza (" + r1.status + ")", r1.status === 400);
  const r2 = await postJSON("/api/grupo/copia", { copia: g2.copia });
  ok("La copia buena se acepta y se une con lo guardado", r2.status === 200 && r2.json.grupo.partidas === 1);

  // 6) Terminar con una mano a medias (ciegas puestas): la mano se anula y nadie gana ni pierde
  const manos = ana2.mensajes.filter(function (m) { return m.tipo === "mano-iniciada"; }).length;
  await esperar(ana2, function (m) { return m.tipo === "mano-iniciada" && ana2.mensajes.filter(function (x) { return x.tipo === "mano-iniciada"; }).length > manos - 1; }, 4000, "mano de la partida 2");
  const nTerm = ana2.mensajes.filter(function (m) { return m.tipo === "partida-terminada"; }).length;
  enviar(ana2, { tipo: "terminar-partida" });
  await esperar(ana2, function () { return ana2.mensajes.filter(function (m) { return m.tipo === "partida-terminada"; }).length > nTerm; }, 4000, "fin partida 2");
  const fin2 = ana2.mensajes.filter(function (m) { return m.tipo === "partida-terminada"; }).pop();
  ok("Terminar a mitad de mano avisa que se anuló", /anuló/.test(fin2.mensajeCuentas || ""));
  ok("…y cada uno queda con sus 100 Bs (" + fin2.cuentas.jugadores.map(function (j) { return j.tieneBs; }).join(" / ") + ")", fin2.cuentas.jugadores.every(function (j) { return j.tieneBs === 100 && j.resultadoBs === 0; }));

  ana2.ws.close(); beto2.ws.close();
  await apagar(srv);
  try { fs.unlinkSync(ARCHIVO); } catch (e) { /* */ }
  console.log("\n========================================\nAciertos: " + aciertos + "   Fallos: " + fallos + "\n========================================");
  if (fallos) { console.log("\nHay pruebas de persistencia que fallaron."); process.exit(1); }
  console.log("\nTodas las pruebas de persistencia, otra partida y grupos pasaron.");
}
main().catch(function (e) { console.error("FALLO:", e.message); process.exit(1); });
