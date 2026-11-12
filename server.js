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
const Limites = require("./servidor/limites.js");

const PORT = process.env.PORT || 3000;
const RAPIDO = process.env.POKER_RAPIDO === "1";
const DELAY_REPARTO = RAPIDO ? 0 : 2800;
const DELAY_BOT_MIN = RAPIDO ? 0 : 700;
const DELAY_BOT_MAX = RAPIDO ? 0 : 1400;
const DELAY_ENTRE_MANOS = RAPIDO ? 80 : 5500;
const GRACE_MS = RAPIDO ? 30000 : 12 * 60 * 1000;
const FOLD_DESCONEXION_MS = RAPIDO ? 400 : 25000;
const CHAT_COOLDOWN_MS = 2000;
const FICHAS_POR_BS = 10;
const MIN_RECARGA_BS = 10;
const FRASES_CHAT = Avatar.FRASES_CHAT;

/* ---- Límites de protección (ver servidor/limites.js) ---- */
const CONFIAR_PROXY = process.env.TRUST_PROXY === "1" || !!process.env.RENDER;
const MAX_MENSAJE_BYTES = 8 * 1024;        // ningún mensaje legítimo pesa tanto
const MAX_MENSAJES_VENTANA = 60;           // por conexión...
const VENTANA_MENSAJES_MS = 10000;         // ...cada 10 segundos
const MAX_CONEXIONES_POR_IP = 20;
const MAX_SALAS = 300;
const MAX_ESPECTADORES = 20;               // por sala
// En modo rápido (pruebas automáticas) se relajan, porque un solo equipo abre decenas de salas
const FACTOR_LIMITES = RAPIDO ? 100 : 1;
const limiteApi = Limites.crearLimitador(60 * FACTOR_LIMITES, 60000);     // consultas HTTP /api/sala por IP
const limiteEntrar = Limites.crearLimitador(30 * FACTOR_LIMITES, 60000);  // intentos de unirse por IP
const limiteCrear = Limites.crearLimitador(10 * FACTOR_LIMITES, 60000);   // salas nuevas por IP
const conexionesPorIp = new Limites.ContadorConexiones(MAX_CONEXIONES_POR_IP);

const app = express();
app.disable("x-powered-by");
app.use(Limites.cabecerasSeguras);
app.use(express.static(path.join(__dirname, "public")));
app.get("/salud", function (req, res) {
  res.json({ ok: true, salas: salas.size });
});
app.get("/m/:codigo", function (req, res) {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/api/sala/:codigo", function (req, res) {
  if (!limiteApi.permitir(Limites.ipDe(req, CONFIAR_PROXY))) {
    res.status(429).json({ ok: false, mensaje: "Demasiadas consultas, espera un momento." });
    return;
  }
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
const wss = new WebSocketServer({ server: server, path: "/ws", maxPayload: MAX_MENSAJE_BYTES });

const salas = new Map();

function codigoUnico() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let codigo;
  do {
    codigo = "";
    for (let i = 0; i < 5; i++) {
      codigo += letras[crypto.randomInt(letras.length)];
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

function leerCiegas(msg) {
  const crudo = (msg && msg.fichasIniciales != null) ? msg.fichasIniciales : Motor.FICHAS_INICIALES;
  const norm = Motor.normalizarFichas(crudo);
  if (norm.error) return norm;
  const ciegas = Motor.ciegasPara(norm.fichas);
  // Modo torneo: las ciegas se duplican cada MANOS_POR_NIVEL manos
  ciegas.subirCiegasCada = (msg && msg.torneo === true) ? Motor.MANOS_POR_NIVEL : 0;
  return ciegas;
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
  // Los espectadores reciben lo mismo que cualquiera, pero sin cartas privadas
  // (estadoPublico sin id) y sin las cuentas en Bs, que son cosa de los jugadores.
  for (const [id, ws] of sala.espectadores) {
    const payload = Object.assign({
      tipo: tipo,
      estado: sala.mesa.estadoPublico()
    }, meta(sala), extra);
    delete payload.cuentas;
    delete payload.mensajeCuentas;
    delete payload.token;
    payload.tuId = id;
    payload.esAnfitrion = false;
    payload.esEspectador = true;
    enviar(ws, payload);
  }
}

function payloadEspectador(sala, ws) {
  const payload = Object.assign({
    tipo: "mirando",
    estado: sala.mesa.estadoPublico()
  }, meta(sala));
  delete payload.cuentas;
  payload.tuId = ws.jugadorId;
  payload.esAnfitrion = false;
  payload.esEspectador = true;
  return payload;
}

/** Cuando la sala desaparece, se avisa a quien estaba mirando. */
function cerrarEspectadores(sala) {
  for (const ws of sala.espectadores.values()) {
    enviar(ws, { tipo: "error", codigoError: "sala-inexistente", mensaje: "La mesa se cerró." });
    ws.espectador = false;
    ws.codigoSala = null;
  }
  sala.espectadores.clear();
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
      ciegaGrande: opciones.ciegas && opciones.ciegas.ciegaGrande,
      subirCiegasCada: (opciones.ciegas && opciones.ciegas.subirCiegasCada) || 0
    }),
    clientes: new Map(),
    espectadores: new Map(),   // gente que solo mira: ve la mesa pero no juega ni ve cartas privadas
    partidaIniciada: false,
    timers: [],
    timerLimpieza: null,
    cuentas: [],
    partidaTerminada: false,
    terminarAlFinal: false
  };
  engancharMesa(sala);
  salas.set(codigo, sala);
  console.log("Sala creada", codigo, sala.publica ? "pública" : "privada");
  return sala;
}

function engancharMesa(sala) {
  sala.mesa.on(function (ev) {
    if (ev.tipo === "mano-iniciada") {
      transmitir(sala, "mano-iniciada", { secuenciaReparto: ev.secuenciaReparto, ciegasSubieron: !!ev.ciegasSubieron });
      enviarCartasPrivadas(sala);
    } else if (ev.tipo === "calle") {
      transmitir(sala, "calle", { calle: ev.calle, nuevas: ev.nuevas });
    } else if (ev.tipo === "showdown") {
      transmitir(sala, "showdown", { resultado: ev.resultado });
      if (sala.terminarAlFinal) {
        finalizarPartida(sala);
      } else if (sala.partidaIniciada && !sala.partidaTerminada) {
        luego(sala, DELAY_ENTRE_MANOS, function () { empezarMano(sala); });
      }
    } else if (ev.tipo === "ganador-sin-showdown") {
      transmitir(sala, "ganador-sin-showdown");
      if (sala.terminarAlFinal) {
        finalizarPartida(sala);
      } else if (sala.partidaIniciada && !sala.partidaTerminada) {
        luego(sala, DELAY_ENTRE_MANOS, function () { empezarMano(sala); });
      }
    } else if (ev.tipo === "accion" || ev.tipo === "turno" || ev.tipo === "jugador-sentado" || ev.tipo === "jugador-levantado" || ev.tipo === "esperando") {
      transmitir(sala, ev.tipo, ev);
    }
  });
}

function empezarMano(sala) {
  if (sala.partidaTerminada) return;
  acreditarPendientes(sala);
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
    cerrarEspectadores(sala);
    salas.delete(sala.codigo);
    console.log("Sala borrada (sin humanos)", sala.codigo);
    return;
  }
  if (humanosConectados(sala) === 0) {
    sala.timerLimpieza = setTimeout(function () {
      sala.timerLimpieza = null;
      if (humanosConectados(sala) === 0) {
        limpiarTimers(sala);
        cerrarEspectadores(sala);
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
    const c = cuentaPorToken(sala, token);
    if (c) return { sala: sala, jugador: null, cuenta: c };
  }
  return null;
}


function bsDesdeFichas(fichas) {
  return Math.round((Number(fichas) || 0) * 100 / FICHAS_POR_BS) / 100;
}

function fichasDesdeBs(bs) {
  return Math.round((Number(bs) || 0) * FICHAS_POR_BS);
}

function redondearBs(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function cuentaPorToken(sala, token) {
  if (!token || !sala.cuentas) return null;
  for (let i = 0; i < sala.cuentas.length; i++) {
    if (sala.cuentas[i].token === token) return sala.cuentas[i];
  }
  return null;
}

function sincronizarCuentas(sala) {
  if (sala.partidaTerminada) return;
  if (!sala.cuentas) sala.cuentas = [];
  const vivos = sala.mesa.jugadores();
  for (let i = 0; i < sala.cuentas.length; i++) {
    const c = sala.cuentas[i];
    const j = vivos.find(function (p) { return (c.token && p.token === c.token) || p.id === c.id; });
    if (j) {
      c.id = j.id;
      c.nombre = j.nombre;
      c.fichas = j.fichas;
      c.seFue = false;
      c.conectado = j.conectado !== false;
    }
  }
}

function snapshotCuentas(sala) {
  sincronizarCuentas(sala);
  const jugadores = (sala.cuentas || []).map(function (c) {
    const fichasTotales = (c.fichas || 0) + (c.pendienteFichas || 0);
    const tieneBs = bsDesdeFichas(fichasTotales);
    const recargadoBs = redondearBs(c.recargadoBs);
    return {
      id: c.id,
      nombre: c.nombre,
      recargadoBs: recargadoBs,
      fichas: c.fichas || 0,
      pendienteFichas: c.pendienteFichas || 0,
      tieneBs: tieneBs,
      resultadoBs: redondearBs(tieneBs - recargadoBs),
      seFue: !!c.seFue,
      conectado: c.conectado !== false && !c.seFue
    };
  });
  return {
    fichasPorBs: FICHAS_POR_BS,
    minBs: MIN_RECARGA_BS,
    partidaTerminada: !!sala.partidaTerminada,
    terminarAlFinal: !!sala.terminarAlFinal,
    avisoBote: !!sala.avisoBote,
    jugadores: jugadores
  };
}

function liquidarCuentas(jugadores) {
  const deudores = [];
  const acreedores = [];
  for (let i = 0; i < jugadores.length; i++) {
    const r = redondearBs(jugadores[i].resultadoBs);
    if (r < -0.009) deudores.push({ nombre: jugadores[i].nombre, falta: redondearBs(-r) });
    else if (r > 0.009) acreedores.push({ nombre: jugadores[i].nombre, haber: r });
  }
  deudores.sort(function (a, b) { return b.falta - a.falta; });
  acreedores.sort(function (a, b) { return b.haber - a.haber; });
  const pagos = [];
  let i = 0, k = 0;
  while (i < deudores.length && k < acreedores.length) {
    const monto = redondearBs(Math.min(deudores[i].falta, acreedores[k].haber));
    if (monto > 0.009) {
      pagos.push({ de: deudores[i].nombre, a: acreedores[k].nombre, monto: monto });
    }
    deudores[i].falta = redondearBs(deudores[i].falta - monto);
    acreedores[k].haber = redondearBs(acreedores[k].haber - monto);
    if (deudores[i].falta <= 0.009) i++;
    if (acreedores[k].haber <= 0.009) k++;
  }
  return pagos;
}

function registrarSitio(sala, jugador, reingreso) {
  if (!jugador || jugador.tipo === "bot" || !jugador.token) return;
  if (!sala.cuentas) sala.cuentas = [];
  let c = cuentaPorToken(sala, jugador.token);
  if (!c) {
    c = {
      token: jugador.token,
      id: jugador.id,
      nombre: jugador.nombre,
      recargadoBs: bsDesdeFichas(jugador.fichas),
      fichas: jugador.fichas,
      pendienteFichas: 0,
      seFue: false,
      conectado: true,
      avatar: jugador.avatar || null
    };
    sala.cuentas.push(c);
    return;
  }
  c.id = jugador.id;
  c.nombre = jugador.nombre;
  c.seFue = false;
  c.conectado = true;
  if (jugador.avatar) c.avatar = jugador.avatar;
  if (reingreso) {
    const volver = (c.fichas || 0) + (c.pendienteFichas || 0);
    jugador.fichas = volver;
    c.pendienteFichas = 0;
    c.fichas = volver;
  } else {
    c.fichas = jugador.fichas;
  }
}

function congelarCuenta(sala, jugador) {
  if (!jugador || !jugador.token) return;
  const c = cuentaPorToken(sala, jugador.token);
  if (!c) return;
  c.id = jugador.id;
  c.nombre = jugador.nombre;
  c.fichas = jugador.fichas;
  c.seFue = true;
  c.conectado = false;
  if (jugador.avatar) c.avatar = jugador.avatar;
}

function acreditarPendientes(sala) {
  if (!sala.cuentas) return;
  const vivos = sala.mesa.jugadores();
  for (let i = 0; i < sala.cuentas.length; i++) {
    const c = sala.cuentas[i];
    if (!c.pendienteFichas) continue;
    const j = vivos.find(function (p) { return p.token === c.token || p.id === c.id; });
    if (j) {
      j.fichas += c.pendienteFichas;
      c.fichas = j.fichas;
      c.pendienteFichas = 0;
    }
  }
}

function manoEnCurso(sala) {
  const fase = sala.mesa && sala.mesa.fase;
  return !!(sala.partidaIniciada && !sala.partidaTerminada && fase !== "esperando" && fase !== "entre-manos");
}

function finalizarPartida(sala) {
  sala.partidaTerminada = true;
  sala.terminarAlFinal = false;
  sala.partidaIniciada = false;
  acreditarPendientes(sala);
  sincronizarCuentas(sala);
  console.log("Partida terminada en", sala.codigo);
  transmitir(sala, "partida-terminada", { cuentas: snapshotCuentas(sala) });
}

function meta(sala) {
  return {
    codigo: sala.codigo,
    publica: sala.publica,
    anfitrionId: sala.anfitrionId,
    esAnfitrion: false,
    partidaIniciada: sala.partidaIniciada,
    partidaTerminada: !!sala.partidaTerminada,
    asientos: sala.mesa.asientosTotales,
    fichasIniciales: sala.mesa.fichasIniciales,
    ciegaPequena: sala.mesa.ciegaPequena,
    ciegaGrande: sala.mesa.ciegaGrande,
    subirCiegasCada: sala.mesa.subirCiegasCada,
    cuentas: snapshotCuentas(sala)
  };
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
  const previa = cuentaPorToken(sala, ws.token);
  registrarSitio(sala, j, !!(previa && previa.seFue));
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
  let jugador = hallado.jugador;
  if (!jugador && hallado.cuenta) {
    if (!ws.token) ws.token = hallado.cuenta.token;
    const r = sentarEnSala(sala, ws, hallado.cuenta.nombre, "humano", hallado.cuenta.avatar || null);
    if (r && r.error) {
      enviar(ws, { tipo: "error", mensaje: r.error });
      return false;
    }
    jugador = r.jugador || sala.mesa.jugadorPorId(ws.jugadorId);
    programarLimpieza(sala);
    entregarEstado(sala, ws);
    transmitir(sala, "sala-actualizada");
    return true;
  }
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

  // Quien solo mira no puede hacer nada salvo irse
  if (ws.espectador) {
    if (tipo === "salir") alSalir(ws, true);
    else enviar(ws, { tipo: "error", mensaje: "Estás mirando la partida: solo los jugadores sentados pueden hacer eso." });
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

  if (tipo === "crear-privada" || tipo === "unirse" || tipo === "unirse-publica" || tipo === "mirar") {
    const lim = tipo === "unirse" ? limiteEntrar : (tipo === "crear-privada" ? limiteCrear : limiteEntrar);
    if (!lim.permitir(ws.ip)) {
      enviar(ws, { tipo: "error", mensaje: "Demasiados intentos seguidos, espera un minuto." });
      return;
    }
    if ((tipo === "crear-privada") && salas.size >= MAX_SALAS) {
      enviar(ws, { tipo: "error", mensaje: "El servidor está lleno ahora mismo, prueba en unos minutos." });
      return;
    }
  }

  if (tipo === "mirar") {
    const codigo = normalizarCodigo(msg.codigo);
    if (codigo.length !== 5) {
      enviar(ws, { tipo: "error", mensaje: "El código tiene que tener 5 letras, o pega el enlace de la mesa." });
      return;
    }
    const sala = salas.get(codigo);
    if (!sala) {
      errorSalaInexistente(ws, codigo);
      return;
    }
    if (ws.codigoSala) {
      enviar(ws, { tipo: "error", mensaje: "Ya estás en una mesa." });
      return;
    }
    if (sala.espectadores.size >= MAX_ESPECTADORES) {
      enviar(ws, { tipo: "error", mensaje: "Ya hay demasiada gente mirando esta mesa." });
      return;
    }
    ws.espectador = true;
    ws.codigoSala = sala.codigo;
    sala.espectadores.set(ws.jugadorId, ws);
    enviar(ws, payloadEspectador(sala, ws));
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
    if (!sala && salas.size >= MAX_SALAS) {
      enviar(ws, { tipo: "error", mensaje: "El servidor está lleno ahora mismo, prueba en unos minutos." });
      return;
    }
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
    if (sala.partidaTerminada) {
      enviar(ws, { tipo: "error", mensaje: "Esta partida ya cerró las cuentas. Creá una sala nueva para jugar otra." });
      return;
    }
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
    if (sala.partidaTerminada) {
      enviar(ws, { tipo: "error", mensaje: "La partida ya terminó. Las cuentas están cerradas." });
      return;
    }
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

  if (tipo === "recargar") {
    if (sala.partidaTerminada) {
      enviar(ws, { tipo: "error", mensaje: "La partida ya terminó. No se pueden hacer más recargas." });
      return;
    }
    const bs = Math.floor(Number(msg.cantidadBs));
    if (!isFinite(bs) || bs < MIN_RECARGA_BS) {
      enviar(ws, { tipo: "error", codigoError: "recarga-minima", mensaje: "El mínimo para recargar es " + MIN_RECARGA_BS + " Bs." });
      return;
    }
    const j = sala.mesa.jugadorPorId(ws.jugadorId);
    if (!j || j.tipo === "bot") {
      enviar(ws, { tipo: "error", mensaje: "Tenés que estar sentado en la mesa para recargar." });
      return;
    }
    const fichas = fichasDesdeBs(bs);
    let c = cuentaPorToken(sala, j.token || ws.token);
    if (!c) {
      registrarSitio(sala, j, false);
      c = cuentaPorToken(sala, j.token || ws.token);
    }
    c.recargadoBs = redondearBs((c.recargadoBs || 0) + bs);
    let diferida = false;
    if (manoEnCurso(sala)) {
      c.pendienteFichas = (c.pendienteFichas || 0) + fichas;
      diferida = true;
    } else {
      j.fichas += fichas;
      c.fichas = j.fichas;
    }
    console.log("Recarga", bs, "Bs de", j.nombre, "en", sala.codigo, diferida ? "(próxima mano)" : "");
    transmitir(sala, "recarga", {
      deId: j.id,
      deNombre: j.nombre,
      cantidadBs: bs,
      fichas: fichas,
      diferida: diferida,
      mensaje: diferida
        ? j.nombre + " recargó " + bs + " Bs. Se suman " + fichas + " fichas al empezar la próxima mano."
        : j.nombre + " recargó " + bs + " Bs (" + fichas + " fichas)."
    });
    return;
  }

  if (tipo === "terminar-partida") {
    if (sala.anfitrionId !== ws.jugadorId) {
      enviar(ws, { tipo: "error", mensaje: "Solo el anfitrión puede terminar la partida y cerrar las cuentas." });
      return;
    }
    if (sala.partidaTerminada) {
      transmitir(sala, "partida-terminada", { cuentas: snapshotCuentas(sala) });
      return;
    }
    if (manoEnCurso(sala)) {
      sala.avisoBote = true;
    }
    finalizarPartida(sala);
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
  if (ws.espectador) {
    if (sala) sala.espectadores.delete(ws.jugadorId);
    ws.espectador = false;
    ws.codigoSala = null;
    return;
  }
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
        congelarCuenta(sala, j);
        sala.mesa.levantar(ws.jugadorId);
      } else {
        congelarCuenta(sala, j);
        sala.mesa.levantar(ws.jugadorId);
      }
    } else {
      j.conectado = false;
      const c = cuentaPorToken(sala, j.token || ws.token);
      if (c) { c.conectado = false; c.fichas = j.fichas; }
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

wss.on("connection", function (ws, req) {
  ws.ip = Limites.ipDe(req, CONFIAR_PROXY);
  if (!conexionesPorIp.entrar(ws.ip)) {
    ws.close(1013, "Demasiadas conexiones");
    return;
  }
  ws.limiteMensajes = Limites.crearLimitador(MAX_MENSAJES_VENTANA, VENTANA_MENSAJES_MS);
  ws.avisosExceso = 0;
  ws.on("error", function () { /* mensaje demasiado grande o conexión rota: se cierra sola */ });
  ws.jugadorId = nuevoId();
  ws.codigoSala = null;
  ws.token = null;
  ws.isAlive = true;
  ws.salidaIntencional = false;

  ws.on("pong", function () { ws.isAlive = true; });

  ws.on("message", function (raw) {
    if (!ws.limiteMensajes.permitir("m")) {
      ws.avisosExceso += 1;
      if (ws.avisosExceso === 1) enviar(ws, { tipo: "error", mensaje: "Vas muy rápido, espera un momento." });
      if (ws.avisosExceso >= 5) ws.close(1008, "Exceso de mensajes");
      return;
    }
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
    conexionesPorIp.salir(ws.ip);
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
