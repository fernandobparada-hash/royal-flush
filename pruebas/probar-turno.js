/* Reloj de turno del modo online: si un humano no actúa a tiempo, pasa o se retira solo.
   Esta prueba arranca su propio servidor con un tiempo de turno corto (no hace falta tener uno en marcha).
   Ejecutar: node pruebas/probar-turno.js */
"use strict";
const { spawn } = require("child_process");
const path = require("path");
const WebSocket = require("ws");

const PUERTO = 4700 + Math.floor(Math.random() * 200);
const BASE = "ws://localhost:" + PUERTO + "/ws";
let aciertos = 0, fallos = 0;
function ok(desc, cond, extra) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc + (extra ? "  -> " + extra : "")); }
}
function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function arrancarServidor() {
  return new Promise(function (resolve, reject) {
    const proc = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
      env: Object.assign({}, process.env, { PORT: String(PUERTO), POKER_RAPIDO: "1", POKER_TURNO_MS: "1200", POKER_TURNO_AUSENTE_MS: "400" }),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let listo = false;
    proc.stdout.on("data", function (d) { if (!listo && /listo/i.test(String(d))) { listo = true; resolve(proc); } });
    proc.stderr.on("data", function (d) { if (!listo) reject(new Error(String(d))); });
    setTimeout(function () { if (!listo) reject(new Error("el servidor no arrancó")); }, 6000);
  });
}

function conectar() {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(BASE);
    ws.mensajes = [];
    ws.on("message", function (d) { try { const m = JSON.parse(d.toString()); ws.mensajes.push(m); if (ws.alMensaje) ws.alMensaje(m); } catch (e) { /* */ } });
    ws.on("open", function () { resolve(ws); });
    ws.on("error", reject);
  });
}
const enviar = function (ws, o) { ws.send(JSON.stringify(o)); };

(async function () {
  const servidor = await arrancarServidor();
  console.log("Servidor de prueba en el puerto " + PUERTO + " (turno de 1,2 s; 0,4 s para ausentes)");
  try {
    const anfi = await conectar();
    let miId = null, codigo = null;
    const tiemposLimite = [];     // turnoRestanteMs de cada reloj que empezó para el anfitrión
    let modo = "dormido";          // dormido = no hace nada; rapido = actúa enseguida
    anfi.alMensaje = function (m) {
      if (m.tipo === "en-sala" && !codigo) { codigo = m.codigo; miId = m.tuId; }
      if (m.tipo === "turno-limite" && m.turnoDe === miId) {
        tiemposLimite.push(m.turnoRestanteMs);
        if (modo === "rapido" && m.estado.acciones) {
          enviar(anfi, { tipo: "accion", accion: m.estado.acciones.puedePasar ? "pasar" : "retirarse" });
        }
      }
    };
    enviar(anfi, { tipo: "crear-privada", nombre: "Lento", asientos: 9, fichasIniciales: 1000 });
    while (!codigo) await dormir(30);
    enviar(anfi, { tipo: "llenar-bots" });
    await dormir(200);
    enviar(anfi, { tipo: "iniciar" });

    // --- Caso 1: no hace nada ---
    const t0 = Date.now();
    while (!tiemposLimite.length && Date.now() - t0 < 6000) await dormir(30);
    ok("Cuando le toca al humano arranca un reloj de turno", tiemposLimite.length >= 1);
    ok("El reloj empieza cerca del límite configurado (" + tiemposLimite[0] + " ms de 1200)", tiemposLimite[0] > 800 && tiemposLimite[0] <= 1200);
    const antesAviso = Date.now();
    while (!anfi.mensajes.some(function (m) { return m.tipo === "aviso-turno"; }) && Date.now() - antesAviso < 4000) await dormir(30);
    const aviso = anfi.mensajes.find(function (m) { return m.tipo === "aviso-turno"; });
    ok("Si no actúa a tiempo recibe un aviso", !!aviso, JSON.stringify(aviso));
    ok("El aviso explica qué se hizo por él", aviso && /pasaste|retiraste/.test(aviso.mensaje));
    ok("El servidor actuó por él cerca del límite (tardó " + (Date.now() - antesAviso) + " ms)", aviso && (Date.now() - antesAviso) < 3000);
    const accionAuto = anfi.mensajes.find(function (m) { return m.tipo === "accion" && (m.jugadorId === miId || m.id === miId) && (m.accion === "pasar" || m.accion === "retirarse"); });
    ok("Todos ven que pasó o se retiró automáticamente", !!accionAuto, "mensajes accion: " + JSON.stringify(anfi.mensajes.filter(function (m) { return m.tipo === "accion"; }).slice(-2)));

    // --- Caso 2: segundo y tercer turno sin actuar: los ausentes tienen menos tiempo ---
    const antes = tiemposLimite.length;
    while (tiemposLimite.length < antes + 2 && Date.now() - antesAviso < 15000) await dormir(30);
    const ultimos = tiemposLimite.slice(-2);
    ok("Tras 2 turnos agotados seguidos el tiempo baja (" + tiemposLimite.join(", ") + " ms)", tiemposLimite.length >= 3 && tiemposLimite[tiemposLimite.length - 1] <= 400, JSON.stringify(tiemposLimite));

    // --- Caso 3: actúa enseguida: no debe saltar ningún aviso ---
    modo = "rapido";
    await dormir(900); // dejamos terminar el turno que ya estaba corriendo cuando cambiamos de modo
    const avisosAntes = anfi.mensajes.filter(function (m) { return m.tipo === "aviso-turno"; }).length;
    const turnosAntes = tiemposLimite.length;
    const t1 = Date.now();
    while (tiemposLimite.length < turnosAntes + 3 && Date.now() - t1 < 12000) await dormir(30);
    await dormir(700);
    const avisosDespues = anfi.mensajes.filter(function (m) { return m.tipo === "aviso-turno"; }).length;
    ok("Actuando a tiempo (3 turnos) no salta ningún aviso (" + (avisosDespues - avisosAntes) + " nuevos)", tiemposLimite.length >= turnosAntes + 3 && avisosDespues === avisosAntes);
    const ultimoReloj = tiemposLimite[tiemposLimite.length - 1];
    ok("Y al actuar bien el tiempo vuelve a ser el normal (" + ultimoReloj + " ms)", ultimoReloj > 800, String(ultimoReloj));

    // El reloj nunca se atribuye a un bot
    const conRelojDeBot = anfi.mensajes.filter(function (m) { return m.turnoDe && m.turnoDe !== miId; }).length;
    ok("El reloj nunca corre para un bot", conRelojDeBot === 0);
    // Y cuando el turno es de otro, el mensaje no arrastra el reloj del humano
    const arrastre = anfi.mensajes.filter(function (m) { return m.estado && m.estado.turnoId && m.estado.turnoId !== miId && m.turnoRestanteMs != null; }).length;
    ok("Si el turno es de otro, no se envía reloj (" + arrastre + " mensajes con reloj ajeno)", arrastre === 0);
    anfi.close();
  } finally {
    servidor.kill();
  }
  console.log("\n========================================");
  console.log("Aciertos: " + aciertos + "   Fallos: " + fallos);
  console.log("========================================");
  if (fallos) { console.log("\nHay pruebas del reloj de turno que fallaron."); process.exit(1); }
  console.log("\nTodas las pruebas del reloj de turno pasaron.");
  process.exit(0);
})().catch(function (e) { console.log("FALLO: " + e.message); process.exit(1); });
