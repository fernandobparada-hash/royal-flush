/* Comprueba una sala privada con dos clientes WebSocket hasta el showdown.
   Requiere el servidor en marcha: POKER_RAPIDO=1 npm start
   Uso: node pruebas/probar-sala.js [http://localhost:3000]
*/
"use strict";

const WebSocket = require("ws");

const BASE = process.argv[2] || process.env.POKER_URL || "http://localhost:3000";
const WS_URL = BASE.replace(/^http/, "ws") + "/ws";

function dormir(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function conectar() {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(WS_URL);
    const c = { ws: ws, mensajes: [], tuId: null, codigo: null, estado: null, cartas: null };
    const timer = setTimeout(function () {
      reject(new Error("No se pudo abrir el WebSocket en " + WS_URL));
    }, 8000);
    ws.on("open", function () {
      clearTimeout(timer);
      resolve(c);
    });
    ws.on("error", function (e) {
      clearTimeout(timer);
      reject(e);
    });
    ws.on("message", function (raw) {
      const msg = JSON.parse(raw.toString());
      c.mensajes.push(msg);
      if (msg.tuId) c.tuId = msg.tuId;
      if (msg.codigo) c.codigo = msg.codigo;
      if (msg.estado) c.estado = msg.estado;
      if (msg.tipo === "tus-cartas") c.cartas = msg.cartas;
    });
  });
}

function enviar(c, obj) {
  c.ws.send(JSON.stringify(obj));
}

function esperar(c, pred, ms, pista) {
  ms = ms || 8000;
  pista = pista || "evento";
  const t0 = Date.now();
  return new Promise(function (resolve, reject) {
    const ya = c.mensajes.find(pred);
    if (ya) return resolve(ya);
    const iv = setInterval(function () {
      const m = c.mensajes.find(pred);
      if (m) {
        clearInterval(iv);
        resolve(m);
      } else if (Date.now() - t0 > ms) {
        clearInterval(iv);
        reject(new Error("Tiempo agotado esperando " + pista));
      }
    }, 20);
  });
}

async function main() {
  console.log("Conectando a", WS_URL);
  const ana = await conectar();
  const bruno = await conectar();
  console.log("  OK  Dos clientes conectados");

  enviar(ana, { tipo: "crear-privada", nombre: "Ana", asientos: 9 });
  await esperar(ana, function (m) { return m.tipo === "en-sala" && m.codigo; }, 5000, "creación de sala");
  if (!/^[A-Z]{5}$/.test(ana.codigo)) {
    throw new Error("El código no tiene 5 letras: " + ana.codigo);
  }
  console.log("  OK  Sala privada creada con código", ana.codigo);

  enviar(bruno, { tipo: "unirse", nombre: "Bruno", codigo: ana.codigo });
  await esperar(bruno, function (m) {
    return (m.tipo === "en-sala" || m.tipo === "sala-actualizada") && m.codigo === ana.codigo;
  }, 5000, "unión de Bruno");
  console.log("  OK  Bruno se unió a la sala");

  enviar(ana, { tipo: "iniciar" });
  await esperar(ana, function (m) { return m.tipo === "mano-iniciada"; }, 5000, "inicio de mano (Ana)");
  await esperar(bruno, function (m) { return m.tipo === "mano-iniciada"; }, 5000, "inicio de mano (Bruno)");
  console.log("  OK  La mano empezó para los dos");

  await esperar(ana, function (m) { return m.tipo === "tus-cartas" && m.cartas && m.cartas.length === 2; }, 4000, "cartas de Ana");
  await esperar(bruno, function (m) { return m.tipo === "tus-cartas" && m.cartas && m.cartas.length === 2; }, 4000, "cartas de Bruno");
  console.log("  OK  Cada uno recibió sus 2 cartas privadas");

  // Las cartas del rival deben ir ocultas
  const estadoAna = ana.estado;
  const rivalDeAna = estadoAna.jugadores.find(function (j) { return j.id === bruno.tuId; });
  if (!rivalDeAna) throw new Error("Ana no ve a Bruno en la mesa");
  const cartasRival = rivalDeAna.cartas || [];
  const filtradas = cartasRival.filter(function (c) { return !c.oculta; });
  if (filtradas.length !== 0) {
    throw new Error("Ana recibió las cartas de Bruno (no debe ocurrir)");
  }
  console.log("  OK  Las cartas privadas no se envían al rival");

  let lastTurn = null;
  const limite = Date.now() + 20000;
  let vimosShowdown = false;
  let resultado = null;

  while (Date.now() < limite) {
    for (const c of [ana, bruno]) {
      const sd = c.mensajes.find(function (m) {
        return m.tipo === "showdown" || (m.estado && m.estado.resultadoShowdown && m.estado.resultadoShowdown.sinShowdown === false);
      });
      if (sd) {
        vimosShowdown = true;
        resultado = sd.estado && sd.estado.resultadoShowdown ? sd.estado.resultadoShowdown : sd.resultado;
      }
      const est = c.estado;
      if (!est) continue;
      if (est.turnoId === c.tuId && est.acciones && est.acciones.tipos && est.acciones.tipos.length) {
        const clave = est.manosJugadas + ":" + est.fase + ":" + est.turnoId + ":" + (est.comunitarias || []).length;
        if (clave === lastTurn) continue;
        lastTurn = clave;
        const ac = est.acciones;
        if (ac.puedePasar) enviar(c, { tipo: "accion", accion: "pasar" });
        else if (ac.puedeIgualar) enviar(c, { tipo: "accion", accion: "igualar" });
        else enviar(c, { tipo: "accion", accion: "retirarse" });
      }
    }
    if (vimosShowdown) break;
    await dormir(30);
  }

  if (!vimosShowdown) {
    throw new Error("La mano no llegó a showdown a tiempo. Última fase Ana=" +
      (ana.estado && ana.estado.fase) + " mensaje=" + (ana.estado && ana.estado.mensaje));
  }
  console.log("  OK  La mano llegó a showdown");
  if (resultado && resultado.ganadores) {
    console.log("       Ganadores:", resultado.ganadores.map(function (g) {
      return (g.nombre || g.id) + " " + (g.premio || "") + " (" + (g.descripcion || "") + ")";
    }).join(" · "));
  }
  if (ana.estado && ana.estado.comunitarias) {
    console.log("       Comunitarias:", ana.estado.comunitarias.length);
    if (ana.estado.comunitarias.length !== 5) {
      throw new Error("Se esperaban 5 comunitarias en el showdown");
    }
    console.log("  OK  Hay 5 cartas comunitarias");
  }

  ana.ws.close();
  bruno.ws.close();
  console.log("\nTodas las pruebas de sala privada pasaron.\n");
}

main().catch(function (e) {
  console.error("\nFALLO:", e.message);
  process.exit(1);
});
