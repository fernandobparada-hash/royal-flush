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
const crypto = require("crypto");
const express = require("express");
const { WebSocketServer } = require("ws");

const Motor = require("./public/js/motor.js");
const Bots = require("./public/js/bots.js");
const Avatar = require("./public/js/avatar.js");

const PORT = process.env.PORT || 3000;
const RAPIDO = process.env.POKER_RAPIDO === "1";
const DELAY_REPARTO = RAPIDO ? 0 : 2800;
const DELAY_BOT_MIN = RAPIDO ? 0 : 700;
const DELAY_BOT_MAX = RAPIDO ? 0 : 1400;
const DELAY_ENTRE_MANOS = RAPIDO ? 80 : 5500;
const GRACE_MS = RAPIDO ? 30000 : 12 * 60 * 1000;
const FOLD_DESCONEXION_MS = RAPIDO ? 400 : 25000;
const CHAT_COOLDOWN_MS = 2000;
const FRASES_CHAT = Avatar.FRASES_CHAT;

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.get("/salud", function (req, res) {
  res.json({ ok: true, salas: salas.size });
});
app.get("/m/:codigo", function (req, res) {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/api/sala/:codigo", function (req, res) {
  const codigo = normalizarCodigo(req.params.codigo);
  const sala = salas.get(codigo);
  if (!sala) {
    res.status(404).json({ ok: false, mensaje: "La sala ya no existe, crea una nueva" });
    return;
  }
  res.json({
    ok: true,
    codigo: sala.codigo,
    publica: sala.publica,
    partidaIniciada: sala.partidaIniciada,
    jugadores: sala.mesa.jugadores().length,
    asientos: sala.mesa.asientosTotales
  });
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

function normalizarCodigo(crudo) {
  const raw = String(crudo || "").trim().toUpperCase();
  const fromPath = raw.match(/\/M\/([A-Z0-9]{4,12})/);
  const letras = fromPath ? fromPath[1] : raw.replace(/[^A-Z0-9]/g, "");
  return letras.slice(0, 5);
}

function nuevoId() {
  return "j-" + crypto.randomBytes(6).toString("hex");
}

function nuevoToken() {
  return crypto.randomBytes(16).toString("hex");
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
    esAnfitrion: false,
    partidaIniciada: sala.partidaIniciada,
    asientos: sala.mesa.asientosTotales,
    fichasIniciales: sala.mesa.fichasIniciales,
    ciegaPequena: sala.mesa.ciegaPequena,
    ciegaGrande: sala.mesa.ciegaGrande
  };
}

function leerCiegas(msg) {
  const crudo = (msg && msg.fichasIniciales != null) ? msg.fichasIniciales : Motor.FICHAS_INICIALES;
  const norm = Motor.normalizarFichas(crudo);
  if (norm.error) return norm;
  return Motor.ciegasPara(norm.fichas);
}

function leerNombre(msg) {
  const n = String((msg && msg.nombre) || "").trim().replace(/\s+/g, " ").slice(0, 20);
  if (n.length < 2) return { error: "Escribí tu nombre (al menos 2 letras) para entrar." };
  return { nombre: n };
}

function nombreLibre(sala, nombre, exceptoId) {
  const usados = sala.mesa.jugadores()
    .filter(function (j) { return j.id !== exceptoId; })
    .map(function (j) { return String(j.nombre || "").toLowerCase(); });
  if (usados.indexOf(nombre.toLowerCase()) < 0) return nombre;
  for (let i = 2; i <= 20; i++) {
    const cand = (nombre.length > 16 ? nombre.slice(0, 16) : nombre) + " " + i;
    if (usados.indexOf(cand.toLowerCase()) < 0) return cand;
  }
  return nombre + " *";
}

function transmitir(sala, tipo, extra) {
  extra = extra || {};
  for (const [id, ws] of sala.clientes) {
    const payload = Object.assign({
      tipo: tipo,
      tuId: id,
      token: ws && ws.token,
      estado: sala.mesa.estadoPublico(id),
      esAnfitrion: sala.anfitrionId === id
    }, meta(sala), extra);
    payload.esAnfitrion = sala.anfitrionId === id;
    payload.tuId = id;
    if (ws && ws.token) payload.token = ws.token;
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
  if (sala.timerLimpieza) {
    clearTimeout(sala.timerLimpieza);
    sala.timerLimpieza = null;
  }
}

function luego(sala, ms, fn) {
  const t = setTimeout(function () {
    sala.timers = sala.timers.filter(function (x) { return x !== t; });
    try { fn(); } catch (e) { console.error("timer:", e); }
  }, ms);
  sala.timers.push(t);
  return t;
}

function crearSala(opciones) {
  const codigo = codigoUnico();
  const sala = {
    codigo: codigo,
    publica: !!opciones.publica,
    anfitrionId: opciones.anfitrionId,
    mesa: new Motor.Mesa({
      asientos: opciones.asientos || 9,
      fichasIniciales: (opciones.ciegas && opciones.ciegas.fichasIniciales) || Motor.FICHAS_INICIALES,
      ciegaPequena: opciones.ciegas && opciones.ciegas.ciegaPequena,
      ciegaGrande: opciones.ciegas && opciones.ciegas.ciegaGrande
    }),
    clientes: new Map(),
    partidaIniciada: false,
    timers: [],
    timerLimpieza: null
  };
  engancharMesa(sala);
  salas.set(codigo, sala);
  console.log("Sala creada", codigo, sala.publica ? "pública" : "privada");
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
    if (j.timerFold) return;
    j.timerFold = luego(sala, FOLD_DESCONEXION_MS, function () {
      j.timerFold = null;
      if (j.conectado === false && sala.mesa.turnoId === id) {
        sala.mesa.accion(id, "retirarse");
        programarBots(sala);
      }
    });
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

function humanosConectados(sala) {
  let n = 0;
  for (const ws of sala.clientes.values()) {
    if (ws && ws.readyState === 1) n++;
  }
  return n;
}

function humanosEnMesa(sala) {
  return sala.mesa.jugadores().filter(function (j) { return j.tipo === "humano"; }).length;
}

function programarLimpieza(sala) {
  if (sala.timerLimpieza) {
    clearTimeout(sala.timerLimpieza);
    sala.timerLimpieza = null;
  }
  if (humanosEnMesa(sala) === 0) {
    limpiarTimers(sala);
    salas.delete(sala.codigo);
    console.log("Sala borrada (sin humanos)", sala.codigo);
    return;
  }
  if (humanosConectados(sala) === 0) {
    sala.timerLimpieza = setTimeout(function () {
      sala.timerLimpieza = null;
      if (humanosConectados(sala) === 0) {
        limpiarTimers(sala);
        salas.delete(sala.codigo);
        console.log("Sala caducada", sala.codigo);
      }
    }, GRACE_MS);
  }
}

function buscarPorToken(token) {
  if (!token) return null;
  for (const sala of salas.values()) {
    const jugadores = sala.mesa.jugadores();
    for (let i = 0; i < jugadores.length; i++) {
      if (jugadores[i].token && jugadores[i].token === token) {
        return { sala: sala, jugador: jugadores[i] };
      }
    }
  }
  return null;
}

function sentarEnSala(sala, ws, nombre, tipo, avatar) {
  const resultado = sala.mesa.sentar({
    id: ws.jugadorId,
    nombre: nombre || "Jugador",
    tipo: tipo || "humano",
    avatar: avatar ? Avatar.normalizar(avatar) : Avatar.aleatorio(nombre || ws.jugadorId),
    token: ws.token
  });
  if (resultado.error) return resultado;
  const j = resultado.jugador;
  j.token = ws.token;
  j.conectado = true;
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
  const payload = Object.assign({
    tipo: "en-sala",
    tuId: ws.jugadorId,
    token: ws.token,
    estado: sala.mesa.estadoPublico(ws.jugadorId)
  }, meta(sala));
  payload.tuId = ws.jugadorId;
  payload.token = ws.token;
  payload.esAnfitrion = sala.anfitrionId === ws.jugadorId;
  return payload;
}

function entregarEstado(sala, ws) {
  const enJuego = sala.partidaIniciada && sala.mesa.fase !== "esperando";
  if (enJuego) {
    enviar(ws, Object.assign(payloadSala(sala, ws), {
      tipo: "sala-actualizada",
      partidaIniciada: true
    }));
    const cartas = sala.mesa.cartasDe(ws.jugadorId);
    if (cartas && cartas.length) {
      enviar(ws, { tipo: "tus-cartas", cartas: cartas, tuId: ws.jugadorId });
    }
  } else {
    enviar(ws, payloadSala(sala, ws));
  }
}

function recostar(ws, hallado) {
  const sala = hallado.sala;
  const jugador = hallado.jugador;
  const viejo = sala.clientes.get(jugador.id);
  if (viejo && viejo !== ws) {
    viejo.salidaIntencional = false;
    viejo.reemplazado = true;
    try { viejo.close(); } catch (e) { /* */ }
  }
  ws.jugadorId = jugador.id;
  ws.token = jugador.token;
  ws.codigoSala = sala.codigo;
  jugador.conectado = true;
  if (jugador.timerFold) {
    /* el timer se ignora al ver conectado */
  }
  sala.clientes.set(jugador.id, ws);
  programarLimpieza(sala);
  console.log("Reconexión", jugador.nombre, "en", sala.codigo);
  entregarEstado(sala, ws);
  transmitir(sala, "sala-actualizada");
  return true;
}

function errorSalaInexistente(ws, codigo) {
  const c = codigo ? (" " + codigo) : "";
  console.log("Unión fallida: sala inexistente" + c);
  enviar(ws, {
    tipo: "error",
    codigoError: "sala-inexistente",
    mensaje: "La sala ya no existe, crea una nueva"
  });
}

function manejar(ws, msg) {
  const tipo = msg && msg.tipo;

  if (tipo === "ping") {
    enviar(ws, { tipo: "pong", t: Date.now() });
    return;
  }

  if (tipo === "reconectar") {
    const token = String(msg.token || "");
    const hallado = buscarPorToken(token);
    if (!hallado) {
      errorSalaInexistente(ws, msg.codigo);
      return;
    }
    recostar(ws, hallado);
    return;
  }

  if (tipo === "crear-privada") {
    const nom = leerNombre(msg);
    if (nom.error) { enviar(ws, { tipo: "error", mensaje: nom.error }); return; }
    const ciegas = leerCiegas(msg);
    if (ciegas.error) {
      enviar(ws, { tipo: "error", mensaje: ciegas.error });
      return;
    }
    if (!ws.token) ws.token = nuevoToken();
    const sala = crearSala({
      publica: false,
      asientos: msg.asientos === 10 ? 10 : 9,
      anfitrionId: ws.jugadorId,
      ciegas: ciegas
    });
    const r = sentarEnSala(sala, ws, nom.nombre, "humano", msg.avatar);
    if (r.error) {
      salas.delete(sala.codigo);
      enviar(ws, { tipo: "error", mensaje: r.error });
      return;
    }
    enviar(ws, payloadSala(sala, ws));
    return;
  }

  if (tipo === "unirse") {
    const nom = leerNombre(msg);
    if (nom.error) { enviar(ws, { tipo: "error", mensaje: nom.error }); return; }
    const codigo = normalizarCodigo(msg.codigo);
    if (codigo.length !== 5) {
      enviar(ws, { tipo: "error", mensaje: "El código tiene que tener 5 letras, o pegá el enlace de la mesa." });
      return;
    }
    const sala = salas.get(codigo);
    if (!sala) {
      errorSalaInexistente(ws, codigo);
      return;
    }
    if (msg.token) {
      const hallado = buscarPorToken(String(msg.token));
      if (hallado && hallado.sala.codigo === sala.codigo) {
        recostar(ws, hallado);
        return;
      }
    }
    if (sala.mesa.asientoLibre() < 0) {
      enviar(ws, { tipo: "error", codigoError: "mesa-llena", mensaje: "Esa mesa está completa. Pedile al anfitrión que te avise cuando haya un asiento." });
      return;
    }
    if (!ws.token) ws.token = nuevoToken();
    const r = sentarEnSala(sala, ws, nombreLibre(sala, nom.nombre), "humano", msg.avatar);
    if (r.error) {
      enviar(ws, { tipo: "error", mensaje: r.error });
      return;
    }
    console.log("Se unió", nom.nombre, "a", codigo, sala.partidaIniciada ? "(en juego, próxima mano)" : "");
    programarLimpieza(sala);
    transmitir(sala, "sala-actualizada");
    if (sala.partidaIniciada && sala.mesa.fase !== "esperando") {
      entregarEstado(sala, ws);
    }
    return;
  }

  if (tipo === "unirse-publica") {
    const nom = leerNombre(msg);
    if (nom.error) { enviar(ws, { tipo: "error", mensaje: nom.error }); return; }
    if (msg.token) {
      const hallado = buscarPorToken(String(msg.token));
      if (hallado && hallado.sala.publica) {
        recostar(ws, hallado);
        return;
      }
    }
    let sala = buscarSalaPublica();
    if (!sala) {
      const ciegas = leerCiegas(msg);
      if (ciegas.error) {
        enviar(ws, { tipo: "error", mensaje: ciegas.error });
        return;
      }
      if (!ws.token) ws.token = nuevoToken();
      sala = crearSala({
        publica: true,
        asientos: msg.asientos === 10 ? 10 : 9,
        anfitrionId: ws.jugadorId,
        ciegas: ciegas
      });
    }
    if (!ws.token) ws.token = nuevoToken();
    const r = sentarEnSala(sala, ws, nombreLibre(sala, nom.nombre), "humano", msg.avatar);
    if (r.error) {
      enviar(ws, { tipo: "error", mensaje: r.error });
      return;
    }
    if (!sala.anfitrionId) sala.anfitrionId = ws.jugadorId;
    programarLimpieza(sala);
    transmitir(sala, "sala-actualizada");
    if (sala.partidaIniciada && sala.mesa.fase !== "esperando") {
      entregarEstado(sala, ws);
    }
    return;
  }

  const sala = salas.get(ws.codigoSala);
  if (!sala) {
    enviar(ws, { tipo: "error", codigoError: "sala-inexistente", mensaje: "La sala ya no existe, crea una nueva" });
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
        asiento: asiento,
        avatar: Avatar.aleatorio(nom)
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
      enviar(ws, { tipo: "error", mensaje: "Se necesitan al menos 2 jugadores para empezar. Invitá a un amigo o rellená con bots." });
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

  if (tipo === "chat") {
    const frase = String(msg.frase || "");
    if (FRASES_CHAT.indexOf(frase) < 0) {
      enviar(ws, { tipo: "error", mensaje: "Esa frase no está permitida." });
      return;
    }
    const ahora = Date.now();
    if (ws.ultimoChat && ahora - ws.ultimoChat < CHAT_COOLDOWN_MS) {
      enviar(ws, { tipo: "error", codigoError: "chat-rapido", mensaje: "Esperá un segundo antes de mandar otra frase." });
      return;
    }
    ws.ultimoChat = ahora;
    const j = sala.mesa.jugadorPorId(ws.jugadorId);
    transmitir(sala, "chat", {
      frase: frase,
      deId: ws.jugadorId,
      deNombre: j ? j.nombre : "",
      deAsiento: j ? j.asiento : null
    });
    return;
  }

  if (tipo === "avatar" && msg.avatar) {
    const j = sala.mesa.jugadorPorId(ws.jugadorId);
    if (j) {
      j.avatar = Avatar.normalizar(msg.avatar);
      transmitir(sala, "sala-actualizada");
    }
    return;
  }

  if (tipo === "salir") {
    alSalir(ws, true);
  }
}

function alSalir(ws, intencional) {
  if (ws.reemplazado) return;
  const codigo = ws.codigoSala;
  const sala = salas.get(codigo);
  if (!sala) return;

  if (sala.clientes.get(ws.jugadorId) === ws) {
    sala.clientes.delete(ws.jugadorId);
  }
  ws.codigoSala = null;

  const j = sala.mesa.jugadorPorId(ws.jugadorId);
  if (j) {
    if (intencional) {
      const enCurso = sala.partidaIniciada &&
        sala.mesa.fase !== "esperando" &&
        sala.mesa.fase !== "entre-manos";
      if (enCurso && j.enMano && !j.retirado) {
        j.conectado = false;
        if (sala.mesa.turnoId === j.id) {
          sala.mesa.accion(j.id, "retirarse");
          programarBots(sala);
        }
        sala.mesa.levantar(ws.jugadorId);
      } else {
        sala.mesa.levantar(ws.jugadorId);
      }
    } else {
      j.conectado = false;
    }
  }

  if (intencional && sala.anfitrionId === ws.jugadorId) {
    const otro = sala.mesa.jugadores().find(function (x) {
      return x.tipo === "humano" && x.conectado !== false && x.id !== ws.jugadorId;
    });
    sala.anfitrionId = otro ? otro.id : null;
  }

  programarLimpieza(sala);
  if (salas.has(sala.codigo)) transmitir(sala, "sala-actualizada");
}

wss.on("connection", function (ws) {
  ws.jugadorId = nuevoId();
  ws.codigoSala = null;
  ws.token = null;
  ws.isAlive = true;
  ws.salidaIntencional = false;

  ws.on("pong", function () { ws.isAlive = true; });

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

  ws.on("close", function () {
    alSalir(ws, !!ws.salidaIntencional);
  });
});

const pulso = setInterval(function () {
  wss.clients.forEach(function (ws) {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch (e) { /* */ }
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* */ }
  });
}, 20000);
server.on("close", function () { clearInterval(pulso); });

server.listen(PORT, "0.0.0.0", function () {
  console.log("Royal Flush listo en http://localhost:" + PORT);
  if (RAPIDO) console.log("(modo rápido de pruebas: POKER_RAPIDO=1)");
});
