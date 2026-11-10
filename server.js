/* =========================================================
   SERVIDOR — express + WebSocket
   ---------------------------------------------------------
   - Sirve los archivos de /public (en local: http://localhost:PORT).
   - Escucha en process.env.PORT (o 3000 si no está definido),
     en 0.0.0.0, para que funcione en un hosting como Render.
   - El WebSocket usa el mismo servidor y puerto (ruta /ws).
   - Gestiona las salas online. El motor de la partida vive
     AQUÍ: las cartas privadas solo se envían a su dueño.
   - El modo solo NO necesita este servidor (puedes abrir
     royal-flush.html o public/index.html directamente).
   ========================================================= */

"use strict";

const http = require("http");
const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");

const Motor = require("./public/js/motor.js");
const Bots = require("./public/js/bots.js");

const PORT = process.env.PORT || 3000;
const RAPIDO = process.env.POKER_RAPIDO === "1";
const DELAY_REPARTO = RAPIDO ? 0 : 2800;
const DELAY_BOT_MIN = RAPIDO ? 0 : 700;
const DELAY_BOT_MAX = RAPIDO ? 0 : 1400;
const DELAY_ENTRE_MANOS = RAPIDO ? 80 : 5500;

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.get("/salud", function (req, res) {
  res.json({ ok: true, salas: salas.size });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server: server, path: "/ws" });

const salas = new Map();

function codigoUnico() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let codigo;
  do {
    codigo = "";
    for (let i = 0; i < 5; i++) {
      codigo += letras[Math.floor(Math.random() * letras.length)];
    }
  } while (salas.has(codigo));
  return codigo;
}

function nuevoId() {
  return "j-" + Math.random().toString(36).slice(2, 10);
}

function enviar(ws, obj) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
  }
}

function meta(sala) {
  return {
    codigo: sala.codigo,
    publica: sala.publica,
    anfitrionId: sala.anfitrionId,
    esAnfitrion: false, // se completa por cliente
    partidaIniciada: sala.partidaIniciada,
    asientos: sala.mesa.asientosTotales
  };
}

function transmitir(sala, tipo, extra) {
  extra = extra || {};
  for (const [id, ws] of sala.clientes) {
    const payload = Object.assign({
      tipo: tipo,
      tuId: id,
      estado: sala.mesa.estadoPublico(id),
      esAnfitrion: sala.anfitrionId === id
    }, meta(sala), extra);
    payload.esAnfitrion = sala.anfitrionId === id;
    payload.tuId = id;
    enviar(ws, payload);
  }
}

function enviarCartasPrivadas(sala) {
  for (const [id, ws] of sala.clientes) {
    enviar(ws, { tipo: "tus-cartas", cartas: sala.mesa.cartasDe(id), tuId: id });
  }
}

function limpiarTimers(sala) {
  for (let i = 0; i < sala.timers.length; i++) clearTimeout(sala.timers[i]);
  sala.timers = [];
}

function luego(sala, ms, fn) {
  const t = setTimeout(function () {
    sala.timers = sala.timers.filter(function (x) { return x !== t; });
    try { fn(); } catch (e) { console.error("timer:", e); }
  }, ms);
  sala.timers.push(t);
}

function crearSala(opciones) {
  const codigo = codigoUnico();
  const sala = {
    codigo: codigo,
    publica: !!opciones.publica,
    anfitrionId: opciones.anfitrionId,
    mesa: new Motor.Mesa({ asientos: opciones.asientos || 9 }),
    clientes: new Map(),
    partidaIniciada: false,
    timers: []
  };
  engancharMesa(sala);
  salas.set(codigo, sala);
  return sala;
}

function engancharMesa(sala) {
  sala.mesa.on(function (ev) {
    if (ev.tipo === "mano-iniciada") {
      transmitir(sala, "mano-iniciada", { secuenciaReparto: ev.secuenciaReparto });
      enviarCartasPrivadas(sala);
    } else if (ev.tipo === "calle") {
      transmitir(sala, "calle", { calle: ev.calle, nuevas: ev.nuevas });
    } else if (ev.tipo === "showdown") {
      transmitir(sala, "showdown", { resultado: ev.resultado });
      if (sala.partidaIniciada) {
        luego(sala, DELAY_ENTRE_MANOS, function () { empezarMano(sala); });
      }
    } else if (ev.tipo === "ganador-sin-showdown") {
      transmitir(sala, "ganador-sin-showdown");
      if (sala.partidaIniciada) {
        luego(sala, DELAY_ENTRE_MANOS, function () { empezarMano(sala); });
      }
    } else if (ev.tipo === "accion" || ev.tipo === "turno" || ev.tipo === "jugador-sentado" || ev.tipo === "jugador-levantado" || ev.tipo === "esperando") {
      transmitir(sala, ev.tipo, ev);
    }
  });
}

function empezarMano(sala) {
  const r = sala.mesa.iniciarMano();
  if (r && r.error) {
    transmitir(sala, "esperando", { mensaje: r.error });
    return;
  }
  luego(sala, DELAY_REPARTO, function () {
    sala.mesa.empezarApuestas();
    programarBots(sala);
  });
}

function programarBots(sala) {
  const id = sala.mesa.turnoId;
  if (!id) return;
  const j = sala.mesa.jugadorPorId(id);
  if (!j) return;
  if (j.tipo === "humano" && j.conectado === false) {
    sala.mesa.accion(id, "retirarse");
    programarBots(sala);
    return;
  }
  if (j.tipo !== "bot") return;
  const espera = DELAY_BOT_MIN + Math.random() * Math.max(0, DELAY_BOT_MAX - DELAY_BOT_MIN);
  luego(sala, espera, function () {
    if (sala.mesa.turnoId !== id) return;
    const legales = sala.mesa.accionesLegales(id);
    const decision = Bots.decidir(legales, j, sala.mesa.estadoPublico(id));
    sala.mesa.accion(id, decision.tipo, decision.cantidad);
    programarBots(sala);
  });
}

function sentarEnSala(sala, ws, nombre, tipo) {
  const resultado = sala.mesa.sentar({
    id: ws.jugadorId,
    nombre: nombre || "Jugador",
    tipo: tipo || "humano"
  });
  if (resultado.error) return resultado;
  sala.clientes.set(ws.jugadorId, ws);
  ws.codigoSala = sala.codigo;
  return resultado;
}

function buscarSalaPublica() {
  for (const sala of salas.values()) {
    if (sala.publica && sala.mesa.asientoLibre() >= 0) return sala;
  }
  return null;
}

function payloadSala(sala, ws) {
  return Object.assign({
    tipo: "en-sala",
    tuId: ws.jugadorId,
    estado: sala.mesa.estadoPublico(ws.jugadorId),
    esAnfitrion: sala.anfitrionId === ws.jugadorId
  }, meta(sala));
}

function manejar(ws, msg) {
  const tipo = msg && msg.tipo;
  if (tipo === "crear-privada") {
    const sala = crearSala({
      publica: false,
      asientos: msg.asientos === 10 ? 10 : 9,
      anfitrionId: ws.jugadorId
    });
    const r = sentarEnSala(sala, ws, msg.nombre, "humano");
    if (r.error) {
      salas.delete(sala.codigo);
      enviar(ws, { tipo: "error", mensaje: r.error });
      return;
    }
    enviar(ws, payloadSala(sala, ws));
    return;
  }

  if (tipo === "unirse") {
    const codigo = String(msg.codigo || "").trim().toUpperCase();
    const sala = salas.get(codigo);
    if (!sala) {
      enviar(ws, { tipo: "error", mensaje: "No hay ninguna sala con el código " + codigo + "." });
      return;
    }
    if (sala.mesa.asientoLibre() < 0) {
      enviar(ws, { tipo: "error", mensaje: "Esa mesa está completa." });
      return;
    }
    const r = sentarEnSala(sala, ws, msg.nombre, "humano");
    if (r.error) {
      enviar(ws, { tipo: "error", mensaje: r.error });
      return;
    }
    transmitir(sala, "sala-actualizada");
    return;
  }

  if (tipo === "unirse-publica") {
    let sala = buscarSalaPublica();
    if (!sala) {
      sala = crearSala({
        publica: true,
        asientos: msg.asientos === 10 ? 10 : 9,
        anfitrionId: ws.jugadorId
      });
    }
    const r = sentarEnSala(sala, ws, msg.nombre, "humano");
    if (r.error) {
      enviar(ws, { tipo: "error", mensaje: r.error });
      return;
    }
    if (!sala.anfitrionId) sala.anfitrionId = ws.jugadorId;
    transmitir(sala, "sala-actualizada");
    return;
  }

  const sala = salas.get(ws.codigoSala);
  if (!sala) {
    enviar(ws, { tipo: "error", mensaje: "No estás en ninguna sala." });
    return;
  }

  if (tipo === "llenar-bots") {
    if (sala.anfitrionId !== ws.jugadorId) {
      enviar(ws, { tipo: "error", mensaje: "Solo el anfitrión puede sentar bots." });
      return;
    }
    const usados = sala.mesa.jugadores().map(function (j) { return j.nombre; });
    let asiento;
    while ((asiento = sala.mesa.asientoLibre()) >= 0) {
      const nom = Bots.nombreBot(usados);
      usados.push(nom);
      sala.mesa.sentar({
        id: "bot-" + sala.codigo + "-" + asiento,
        nombre: nom,
        tipo: "bot",
        asiento: asiento
      });
    }
    transmitir(sala, "sala-actualizada");
    return;
  }

  if (tipo === "iniciar") {
    if (sala.anfitrionId !== ws.jugadorId) {
      enviar(ws, { tipo: "error", mensaje: "Solo el anfitrión puede iniciar la partida." });
      return;
    }
    const conFichas = sala.mesa.jugadores().filter(function (j) { return j.fichas > 0; });
    if (conFichas.length < 2) {
      enviar(ws, { tipo: "error", mensaje: "Se necesitan al menos 2 jugadores para empezar." });
      return;
    }
    if (sala.partidaIniciada && sala.mesa.fase !== "esperando" && sala.mesa.fase !== "entre-manos") {
      enviar(ws, { tipo: "error", mensaje: "La partida ya está en curso." });
      return;
    }
    sala.partidaIniciada = true;
    empezarMano(sala);
    return;
  }

  if (tipo === "accion") {
    const r = sala.mesa.accion(ws.jugadorId, msg.accion, msg.cantidad);
    if (r && r.error) {
      enviar(ws, { tipo: "error", mensaje: r.error, estado: sala.mesa.estadoPublico(ws.jugadorId) });
      return;
    }
    programarBots(sala);
    return;
  }

  if (tipo === "salir") {
    alSalir(ws);
  }
}

function alSalir(ws) {
  const codigo = ws.codigoSala;
  const sala = salas.get(codigo);
  if (!sala) return;

  sala.clientes.delete(ws.jugadorId);
  ws.codigoSala = null;

  const j = sala.mesa.jugadorPorId(ws.jugadorId);
  if (j) {
    const enCurso = sala.partidaIniciada &&
      sala.mesa.fase !== "esperando" &&
      sala.mesa.fase !== "entre-manos";
    if (enCurso && j.enMano && !j.retirado) {
      j.conectado = false;
      if (sala.mesa.turnoId === j.id) {
        sala.mesa.accion(j.id, "retirarse");
        programarBots(sala);
      }
    } else {
      sala.mesa.levantar(ws.jugadorId);
    }
  }

  if (sala.anfitrionId === ws.jugadorId) {
    const otro = sala.mesa.jugadores().find(function (x) {
      return x.tipo === "humano" && x.conectado !== false && x.id !== ws.jugadorId;
    });
    sala.anfitrionId = otro ? otro.id : null;
  }

  const humanos = [...sala.clientes.keys()].length;
  if (humanos === 0) {
    limpiarTimers(sala);
    salas.delete(sala.codigo);
    return;
  }
  transmitir(sala, "sala-actualizada");
}

wss.on("connection", function (ws) {
  ws.jugadorId = nuevoId();
  ws.codigoSala = null;

  ws.on("message", function (raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      enviar(ws, { tipo: "error", mensaje: "Mensaje no válido." });
      return;
    }
    try {
      manejar(ws, msg);
    } catch (e) {
      console.error(e);
      enviar(ws, { tipo: "error", mensaje: "Error interno del servidor." });
    }
  });

  ws.on("close", function () { alSalir(ws); });
});

server.listen(PORT, "0.0.0.0", function () {
  console.log("Royal Flush listo en http://localhost:" + PORT);
  if (RAPIDO) console.log("(modo rápido de pruebas: POKER_RAPIDO=1)");
});
