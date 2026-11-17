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
const Almacen = require("./servidor/almacen.js");
const Tienda = require("./public/js/tienda.js");
const Persistencia = require("./servidor/persistencia.js");
const Util = require("./public/js/utilidades.js");

const PORT = process.env.PORT || 3000;
const RAPIDO = process.env.POKER_RAPIDO === "1";
const DELAY_REPARTO = RAPIDO ? 0 : 2800;
const DELAY_BOT_MIN = RAPIDO ? 0 : 700;
const DELAY_BOT_MAX = RAPIDO ? 0 : 1400;
const DELAY_ENTRE_MANOS = RAPIDO ? 80 : 5500;
const GRACE_MS = RAPIDO ? 30000 : 12 * 60 * 1000;
const FOLD_DESCONEXION_MS = RAPIDO ? 400 : 25000;
// Tiempo máximo para actuar en el modo online (si no, pasa o se retira solo). Se puede cambiar con POKER_TURNO_MS.
const TURNO_MS = Number(process.env.POKER_TURNO_MS) || (RAPIDO ? 20000 : 30000);
// Quien ya dejó pasar 2 turnos seguidos sin actuar tiene menos tiempo (probablemente se fue)
const TURNO_AUSENTE_MS = Number(process.env.POKER_TURNO_AUSENTE_MS) || Math.min(TURNO_MS, 8000);
const CHAT_COOLDOWN_MS = 2000;
const CHAT_MAX_VENTANA = 5;           // a lo sumo 5 mensajes…
const CHAT_VENTANA_MS = 20000;        // …cada 20 s por persona
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
const ASIENTOS_VALIDOS = [9, 10, 15];       // tamaños de mesa permitidos
const VIDA_MONEDERO_S = 400 * 24 * 3600;    // las monedas se guardan ~13 meses sin uso
function leerAsientos(msg) {
  const n = Number(msg && msg.asientos);
  return ASIENTOS_VALIDOS.indexOf(n) >= 0 ? n : 9;
}
// En modo rápido (pruebas automáticas) se relajan, porque un solo equipo abre decenas de salas
const FACTOR_LIMITES = RAPIDO ? 100 : 1;
const limiteApi = Limites.crearLimitador(60 * FACTOR_LIMITES, 60000);     // consultas HTTP /api/sala por IP
const limiteEntrar = Limites.crearLimitador(30 * FACTOR_LIMITES, 60000);  // intentos de unirse por IP
const limiteCrear = Limites.crearLimitador(10 * FACTOR_LIMITES, 60000);   // salas nuevas por IP
const conexionesPorIp = new Limites.ContadorConexiones(MAX_CONEXIONES_POR_IP);

/* ---- Dónde se guardan las mesas y los grupos (ver servidor/almacen.js) ---- */
const almacen = Almacen.crearAlmacen(process.env);
// Secreto para firmar las copias de seguridad que guarda el teléfono del anfitrión.
// Debe ser el mismo tras un reinicio: se toma de POKER_SECRETO o se deriva de la
// dirección del almacén (que no cambia mientras exista).
const SECRETO_COPIAS = process.env.POKER_SECRETO ||
  ((process.env.REDIS_URL || process.env.POKER_ALMACEN_ARCHIVO)
    ? crypto.createHash("sha256").update("rf-copias:" + (process.env.REDIS_URL || process.env.POKER_ALMACEN_ARCHIVO)).digest("hex")
    : crypto.randomBytes(32).toString("hex"));
const VIDA_SALA_S = 3 * 24 * 3600;      // una mesa se puede recuperar hasta 3 días después
const VIDA_GRUPO_S = 400 * 24 * 3600;   // los grupos duran más de un año sin uso
const GUARDAR_TRAS_MS = RAPIDO ? 30 : 400;
const TIPOS_QUE_GUARDAN = new Set(["sala-actualizada", "recarga", "partida-terminada", "showdown",
  "ganador-sin-showdown", "mano-iniciada", "nueva-partida", "grupo-actualizado"]);
console.log("Almacén:", almacen.tipo, almacen.persistente ? "(las mesas sobreviven a reinicios)" : "(solo en memoria)");

const app = express();
app.disable("x-powered-by");
app.use(Limites.cabecerasSeguras);
// El service worker tiene que poder actualizarse siempre
app.get("/sw.js", function (req, res) {
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Service-Worker-Allowed", "/");
  res.sendFile(path.join(__dirname, "public", "sw.js"));
});
app.use(express.static(path.join(__dirname, "public")));
app.get("/salud", function (req, res) {
  res.json({ ok: true, salas: salas.size, almacen: almacen.tipo });
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
  obtenerSala(codigo).then(function (sala) {
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
});

/*
 * Mesas públicas en vivo, para mirarlas sin jugar. Solo datos públicos:
 * código, cuántos juegan, cuántos miran, ciegas y nombres (nada de cartas).
 */
app.get("/api/mesas-publicas", function (req, res) {
  if (!limiteApi.permitir(Limites.ipDe(req, CONFIAR_PROXY))) {
    res.status(429).json({ ok: false, mensaje: "Demasiadas consultas, espera un momento." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, mesas: listaMesasPublicas() });
});

function listaMesasPublicas() {
  const lista = [];
  for (const sala of salas.values()) {
    if (!sala.publica || sala.partidaTerminada) continue;
    const js = sala.mesa.jugadores();
    const humanos = js.filter(function (j) { return j.tipo === "humano"; });
    if (!humanos.length) continue;
    lista.push({
      codigo: sala.codigo,
      jugadores: js.length,
      humanos: humanos.length,
      bots: js.length - humanos.length,
      asientos: sala.mesa.asientosTotales,
      espectadores: sala.espectadores.size,
      lleno: sala.espectadores.size >= MAX_ESPECTADORES,
      enJuego: !!sala.partidaIniciada,
      ciegas: sala.mesa.ciegaPequena + "/" + sala.mesa.ciegaGrande,
      nombres: js.slice(0, 4).map(function (j) { return j.nombre; })
    });
  }
  lista.sort(function (a, b) { return (b.enJuego - a.enJuego) || (b.humanos - a.humanos) || (b.espectadores - a.espectadores); });
  return lista.slice(0, 30);
}

/*
 * Monedero de monedas virtuales (solo cosmético, sin dinero real).
 * El teléfono guarda las monedas y manda una copia acá con su código
 * de monedero, para recuperarlas en otro aparato o si se borra el navegador.
 */
function codigoMonederoValido(id) { return /^[a-f0-9]{24}$/.test(String(id || "")); }
app.get("/api/monedero/:id", function (req, res) {
  if (!limiteApi.permitir(Limites.ipDe(req, CONFIAR_PROXY))) {
    res.status(429).json({ ok: false, mensaje: "Demasiadas consultas, espera un momento." });
    return;
  }
  const id = String(req.params.id || "").toLowerCase();
  if (!codigoMonederoValido(id)) { res.status(400).json({ ok: false, mensaje: "Ese código de monedero no es válido." }); return; }
  res.setHeader("Cache-Control", "no-store");
  almacen.leer("monedero:" + id).then(function (m) {
    if (!m) { res.status(404).json({ ok: false, mensaje: "No hay monedas guardadas con ese código." }); return; }
    res.json({ ok: true, monedero: Tienda.normalizar(m), guardadoEn: m.guardadoEn || null });
  }).catch(function () { res.status(503).json({ ok: false, mensaje: "No se pudo leer el monedero ahora." }); });
});
app.put("/api/monedero/:id", express.json({ limit: "16kb" }), function (req, res) {
  if (!limiteApi.permitir(Limites.ipDe(req, CONFIAR_PROXY))) {
    res.status(429).json({ ok: false, mensaje: "Demasiadas consultas, espera un momento." });
    return;
  }
  const id = String(req.params.id || "").toLowerCase();
  if (!codigoMonederoValido(id) || !req.body || typeof req.body.monedero !== "object") {
    res.status(400).json({ ok: false, mensaje: "Monedero no válido." });
    return;
  }
  const m = Tienda.normalizar(req.body.monedero);
  m.guardadoEn = Date.now();
  almacen.guardar("monedero:" + id, m, VIDA_MONEDERO_S).then(function () {
    res.json({ ok: true, monedero: Tienda.normalizar(m) });
  }).catch(function () { res.status(503).json({ ok: false, mensaje: "No se pudo guardar el monedero ahora." }); });
});

// Borrar un monedero del servidor (solo con su código, que es la misma llave que permite
// leerlo o pisarlo con PUT). Las monedas del aparato no se tocan.
app.delete("/api/monedero/:id", function (req, res) {
  if (!limiteApi.permitir(Limites.ipDe(req, CONFIAR_PROXY))) {
    res.status(429).json({ ok: false, mensaje: "Demasiadas consultas, espera un momento." });
    return;
  }
  const id = String(req.params.id || "").toLowerCase();
  if (!codigoMonederoValido(id)) { res.status(400).json({ ok: false, mensaje: "Ese código de monedero no es válido." }); return; }
  almacen.borrar("monedero:" + id).then(function () {
    res.json({ ok: true });
  }).catch(function () { res.status(503).json({ ok: false, mensaje: "No se pudo borrar el monedero ahora." }); });
});

/*
 * Copia de seguridad de un grupo que guardó el teléfono del anfitrión.
 * Solo se acepta si la firma es nuestra (nadie puede inventar resultados).
 * Si el almacén perdió el grupo, se recupera; si no, se unen las dos copias.
 */
app.post("/api/grupo/copia", express.json({ limit: "256kb" }), function (req, res) {
  if (!limiteApi.permitir(Limites.ipDe(req, CONFIAR_PROXY))) {
    res.status(429).json({ ok: false, mensaje: "Demasiadas consultas, espera un momento." });
    return;
  }
  const copia = req.body && req.body.copia;
  if (!Persistencia.verificarFirma(SECRETO_COPIAS, copia) || !copia.datos.codigo) {
    res.status(400).json({ ok: false, mensaje: "Esa copia del grupo no es válida." });
    return;
  }
  const codigo = String(copia.datos.codigo);
  almacen.leer("grupo:" + codigo).then(function (actual) {
    const unido = Persistencia.fusionarGrupos(actual, copia.datos);
    return almacen.guardar("grupo:" + codigo, unido, VIDA_GRUPO_S).then(function () {
      res.json({ ok: true, recuperado: !actual, grupo: Persistencia.vistaGrupo(unido) });
    });
  }).catch(function (e) {
    console.error("copia grupo:", e.message);
    res.status(503).json({ ok: false, mensaje: "No se pudo guardar el grupo ahora." });
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
  if (TIPOS_QUE_GUARDAN.has(tipo)) programarGuardado(sala);
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

/** Cuántos miran: se avisa a todos (jugadores y espectadores) con un mensaje liviano. */
function avisarEspectadores(sala) {
  const msg = { tipo: "espectadores", espectadores: sala.espectadores.size };
  for (const ws of sala.clientes.values()) enviar(ws, msg);
  for (const ws of sala.espectadores.values()) enviar(ws, msg);
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
  const codigo = opciones.codigo || codigoUnico();
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
    seqTurno: 0,               // contador para distinguir un turno de otro
    turnoVigilado: null,       // { id, marca, vence }: de quién es el reloj que corre ahora
    partidaIniciada: false,
    timers: [],
    timerLimpieza: null,
    cuentas: [],
    partidaTerminada: false,
    terminarAlFinal: false,
    partidaNum: 1,             // "otra partida" en la misma mesa suma 1
    partidasCerradas: [],      // resultados de las partidas ya terminadas (cuentas de la noche)
    grupo: null,               // { codigo, nombre } si el anfitrión guarda las cuentas en un grupo
    grupoRegistradas: [],
    timerGuardar: null
  };
  sala.ciegasIniciales = { pequena: sala.mesa.ciegaPequena, grande: sala.mesa.ciegaGrande };
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
      chatGanadorBot(sala);
      if (sala.terminarAlFinal) {
        finalizarPartida(sala);
      } else if (sala.partidaIniciada && !sala.partidaTerminada) {
        luego(sala, DELAY_ENTRE_MANOS, function () { empezarMano(sala); });
      }
    } else if (ev.tipo === "ganador-sin-showdown") {
      transmitir(sala, "ganador-sin-showdown");
      chatGanadorBot(sala);
      if (sala.terminarAlFinal) {
        finalizarPartida(sala);
      } else if (sala.partidaIniciada && !sala.partidaTerminada) {
        luego(sala, DELAY_ENTRE_MANOS, function () { empezarMano(sala); });
      }
    } else if (ev.tipo === "accion" || ev.tipo === "turno" || ev.tipo === "jugador-sentado" || ev.tipo === "jugador-levantado" || ev.tipo === "esperando") {
      // El evento trae el estado público (cartas de todos tapadas); se quita para que
      // cada jugador reciba el suyo, con sus propias cartas a la vista.
      const extra = Object.assign({}, ev);
      delete extra.estado;
      transmitir(sala, ev.tipo, extra);
    }
  });
}

function empezarMano(sala) {
  if (sala.partidaTerminada) return;
  acreditarPendientes(sala);
  // Fichas al empezar la mano: si el servidor se reinicia a mitad, se devuelven estas
  sala.mesa.jugadores().forEach(function (j) { j.fichasInicioMano = j.fichas; });
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

/**
 * Reloj de turno para humanos: si pasa el tiempo sin que actúen, pasan (si es gratis) o se retiran.
 * Así una persona que se distrae o se va no deja la mesa bloqueada para siempre.
 */
function armarTurnoHumano(sala, j) {
  const v = sala.turnoVigilado;
  if (v && v.id === j.id && j.marcaTurno === v.marca) return; // ya está corriendo para este turno
  const marca = ++sala.seqTurno;
  const ms = (j.timeoutsSeguidos || 0) >= 2 ? TURNO_AUSENTE_MS : TURNO_MS;
  j.marcaTurno = marca;
  sala.turnoVigilado = { id: j.id, marca: marca, vence: Date.now() + ms };
  j.timerTurno = luego(sala, ms, function () {
    if (j.marcaTurno !== marca || sala.mesa.turnoId !== j.id) return;
    j.marcaTurno = null;
    sala.turnoVigilado = null;
    const legales = sala.mesa.accionesLegales(j.id);
    const tipo = legales.puedePasar ? "pasar" : "retirarse";
    j.timeoutsSeguidos = (j.timeoutsSeguidos || 0) + 1;
    const ws = sala.clientes.get(j.id);
    sala.mesa.accion(j.id, tipo);
    if (ws) {
      enviar(ws, {
        tipo: "aviso-turno",
        mensaje: tipo === "pasar" ? "Se acabó tu tiempo: pasaste automáticamente." : "Se acabó tu tiempo: te retiraste automáticamente."
      });
    }
    programarBots(sala);
  });
  // Avisamos a todos de que el reloj ya corre (el evento "turno" llegó un instante antes)
  transmitir(sala, "turno-limite");
}

function cancelarTurnoHumano(sala, j) {
  if (j) {
    j.marcaTurno = null;
    if (j.timerTurno) clearTimeout(j.timerTurno);
    j.timerTurno = null;
  }
  sala.turnoVigilado = null;
}

function programarBots(sala) {
  const id = sala.mesa.turnoId;
  if (!id) { sala.turnoVigilado = null; return; }
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
  if (j.tipo === "humano") {
    armarTurnoHumano(sala, j);
    return;
  }
  if (j.tipo !== "bot") return;
  sala.turnoVigilado = null;
  const espera = DELAY_BOT_MIN + Math.random() * Math.max(0, DELAY_BOT_MAX - DELAY_BOT_MIN);
  luego(sala, espera, function () {
    if (sala.mesa.turnoId !== id) return;
    const legales = sala.mesa.accionesLegales(id);
    const decision = Bots.decidir(legales, j, sala.mesa.estadoPublico(id));
    sala.mesa.accion(id, decision.tipo, decision.cantidad);
    chatBot(sala, j, Bots.momentoDeAccion(decision.tipo));
    programarBots(sala);
  });
}

/** Frase corta de un bot con personalidad (como mucho una cada 2,5 s por mesa). */
function chatBot(sala, j, momento) {
  if (!j || !momento) return;
  const ahora = Date.now();
  if (sala.ultimoChatBot && ahora - sala.ultimoChatBot < 2500) return;
  const frase = Bots.chatDeBot(j, momento);
  if (!frase) return;
  sala.ultimoChatBot = ahora;
  transmitir(sala, "chat", { frase: frase, deId: j.id, deNombre: j.nombre, deAsiento: j.asiento, bot: true });
}

function chatGanadorBot(sala) {
  const r = sala.mesa.resultadoShowdown;
  if (!r || !r.ganadores || !r.ganadores.length) return;
  const j = sala.mesa.jugadorPorId(r.ganadores[0].id);
  if (j && j.tipo === "bot") chatBot(sala, j, "ganar");
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
    if (sala.timerGuardar) { clearTimeout(sala.timerGuardar); sala.timerGuardar = null; }
    almacen.borrar("sala:" + sala.codigo).catch(function () { /* */ });
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
  // Cuentas de la noche: todas las partidas de esta mesa (las cerradas + la actual)
  const actual = sala.partidaTerminada ? [] : (sala.cuentas || []).map(function (c, i) {
    return { token: c.token, nombre: jugadores[i].nombre, resultadoBs: jugadores[i].resultadoBs };
  });
  const cerradas = sala.partidasCerradas || [];
  return {
    fichasPorBs: FICHAS_POR_BS,
    minBs: MIN_RECARGA_BS,
    partidaTerminada: !!sala.partidaTerminada,
    terminarAlFinal: !!sala.terminarAlFinal,
    avisoBote: !!sala.avisoBote,
    partidaNum: sala.partidaNum || 1,
    partidasCerradas: cerradas.length,
    noche: Persistencia.totalesNoche(cerradas, actual),
    grupo: sala.grupo ? { codigo: sala.grupo.codigo, nombre: sala.grupo.nombre } : null,
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
  // Si se termina con una mano a medias, esa mano se congela: nadie más actúa (ni el reloj
  // de turno ni los bots), así las fichas ya no se mueven después de cerrar las cuentas.
  const aMedias = manoEnCurso(sala);
  for (let i = 0; i < sala.timers.length; i++) clearTimeout(sala.timers[i]);
  sala.timers = [];
  sala.turnoVigilado = null;
  if (aMedias) {
    // La mano a medias se anula: cada uno recupera lo que tenía al empezarla (también lo
    // que había en el bote). Así las cuentas siempre cuadran: lo que unos ganan, otros lo deben.
    sala.mesa.jugadores().forEach(function (j) {
      if (j.enMano && typeof j.fichasInicioMano === "number") j.fichas = j.fichasInicioMano;
      j.apuestaRonda = 0;
      j.aportado = 0;
    });
    sala.mesa.boteTotal = 0;
    sala.mesa.botes = [];
    sala.mesa.apuestaMaxima = 0;
    sala.mesa.fase = "entre-manos";
    sala.mesa.turnoId = null;
    sala.mesa.faltanPorHablar = [];
    sala.mesa.mensaje = "Partida terminada. La mano que se estaba jugando se anuló y cada uno recuperó lo que había apostado.";
  }
  // Primero se pasan las fichas finales a las cuentas (sincronizarCuentas no toca una partida cerrada)
  acreditarPendientes(sala);
  sincronizarCuentas(sala);
  sala.partidaTerminada = true;
  sala.terminarAlFinal = false;
  sala.partidaIniciada = false;
  // Guardamos el resultado de esta partida para las cuentas de la noche (y del grupo)
  const foto = snapshotCuentas(sala);
  sala.partidasCerradas.push(Persistencia.cerrarPartida(sala.partidaNum || 1, foto.jugadores, sala.cuentas));
  console.log("Partida terminada en", sala.codigo, "(partida " + (sala.partidaNum || 1) + ")");
  transmitir(sala, "partida-terminada", aMedias
    ? { cuentas: snapshotCuentas(sala), mensajeCuentas: "La mano que se estaba jugando se anuló: cada uno recuperó lo que había apostado." }
    : { cuentas: snapshotCuentas(sala) });
  if (sala.grupo) registrarEnGrupo(sala);
}

/* =========================================================
   OTRA PARTIDA (revancha) EN LA MISMA MESA
   Las cuentas de la partida empiezan de cero (cada uno vuelve a
   "comprar" las fichas iniciales) y las de la noche se van sumando.
   ========================================================= */
function otraPartida(sala) {
  limpiarTimers(sala);
  const mesa = sala.mesa;
  mesa.ciegaPequena = sala.ciegasIniciales.pequena;
  mesa.ciegaGrande = sala.ciegasIniciales.grande;
  mesa.nivelCiegas = 1;
  mesa.manosJugadas = 0;
  mesa.fase = "esperando";
  mesa.comunitarias = [];
  mesa.turnoId = null;
  mesa.resultadoShowdown = null;
  mesa.boteTotal = 0;
  mesa.botes = [];
  mesa.apuestaMaxima = 0;
  mesa.faltanPorHablar = [];
  mesa.subidaMinima = mesa.ciegaGrande;
  mesa.mensaje = "";
  sala.cuentas = [];
  mesa.jugadores().forEach(function (j) {
    j.fichas = mesa.fichasIniciales;
    j.cartas = [];
    j.enMano = false;
    j.retirado = false;
    j.allIn = false;
    j.apuestaRonda = 0;
    j.aportado = 0;
    j.ultimaAccion = null;
    j.reveladas = false;
    if (j.tipo === "humano") registrarSitio(sala, j, false);
  });
  sala.partidaNum = (sala.partidaNum || 1) + 1;
  sala.partidaTerminada = false;
  sala.terminarAlFinal = false;
  sala.avisoBote = false;
  sala.partidaIniciada = true;
  console.log("Otra partida en", sala.codigo, "(partida " + sala.partidaNum + ")");
  transmitir(sala, "nueva-partida", {
    mensaje: "¡Empieza la partida " + sala.partidaNum + "! Todos vuelven a tener " + mesa.fichasIniciales + " fichas."
  });
  empezarMano(sala);
}

/* =========================================================
   GUARDAR Y RECUPERAR MESAS (para cuando Render se duerme)
   ========================================================= */
function programarGuardado(sala) {
  if (!salas.has(sala.codigo) || sala.timerGuardar) return;
  sala.timerGuardar = setTimeout(function () {
    sala.timerGuardar = null;
    if (!salas.has(sala.codigo)) return;
    let datos;
    try {
      datos = Persistencia.serializarSala(sala, manoEnCurso(sala));
    } catch (e) {
      console.error("No se pudo preparar la sala para guardar:", e.message);
      return;
    }
    almacen.guardar("sala:" + sala.codigo, datos, VIDA_SALA_S).catch(function (e) {
      console.error("No se pudo guardar la sala", sala.codigo + ":", e.message);
    });
  }, GUARDAR_TRAS_MS);
}

/** Reconstruye una sala a partir de lo guardado. Nadie está conectado todavía. */
function restaurarSala(datos) {
  const m = datos.mesa;
  const sala = crearSala({
    codigo: datos.codigo,
    publica: datos.publica,
    asientos: m.asientos,
    anfitrionId: null,
    ciegas: { fichasIniciales: m.fichasIniciales, ciegaPequena: m.ciegaPequena, ciegaGrande: m.ciegaGrande, subirCiegasCada: m.subirCiegasCada }
  });
  sala.ciegasIniciales = m.ciegasIniciales || sala.ciegasIniciales;
  sala.mesa.nivelCiegas = m.nivelCiegas || 1;
  sala.mesa.manosJugadas = m.manosJugadas || 0;
  sala.mesa.botonDealer = m.botonDealer == null ? null : m.botonDealer;
  const idPorToken = new Map();
  (datos.jugadores || []).forEach(function (d) {
    const id = d.tipo === "bot" && d.id ? d.id : nuevoId();
    const r = sala.mesa.sentar({ id: id, nombre: d.nombre, tipo: d.tipo, asiento: d.asiento, fichas: d.fichas, avatar: d.avatar, personalidad: d.personalidad || null, token: d.token });
    if (r && r.jugador) {
      r.jugador.token = d.token || null;
      if (d.tipo === "humano") r.jugador.conectado = false;
      if (d.token) idPorToken.set(d.token, r.jugador.id);
    }
  });
  sala.cuentas = (datos.cuentas || []).map(function (c) {
    return {
      token: c.token, id: idPorToken.get(c.token) || null, nombre: c.nombre,
      recargadoBs: c.recargadoBs, fichas: c.fichas, pendienteFichas: c.pendienteFichas || 0,
      seFue: !!c.seFue, conectado: false, avatar: c.avatar || null
    };
  });
  sala.anfitrionId = (datos.anfitrionToken && idPorToken.get(datos.anfitrionToken)) || null;
  sala.partidaIniciada = !!datos.partidaIniciada;
  sala.partidaTerminada = !!datos.partidaTerminada;
  sala.avisoBote = !!datos.avisoBote;
  sala.partidaNum = datos.partidaNum || 1;
  sala.partidasCerradas = datos.partidasCerradas || [];
  sala.grupo = datos.grupo || null;
  sala.grupoRegistradas = datos.grupoRegistradas || [];
  sala.restaurada = true;
  sala.manoAnulada = !!datos.manoAnulada;
  console.log("Sala recuperada del almacén", sala.codigo, datos.manoAnulada ? "(se anuló la mano a medias)" : "");
  programarLimpieza(sala);
  return sala;
}

const cargando = new Map();
/** La sala de ese código: de la memoria o, si el servidor se reinició, del almacén. */
function obtenerSala(codigo) {
  if (!codigo) return Promise.resolve(null);
  if (salas.has(codigo)) return Promise.resolve(salas.get(codigo));
  if (!almacen.persistente) return Promise.resolve(null);
  if (cargando.has(codigo)) return cargando.get(codigo);
  const p = almacen.leer("sala:" + codigo).then(function (datos) {
    if (salas.has(codigo)) return salas.get(codigo);
    if (!datos || datos.version !== Persistencia.VERSION) return null;
    return restaurarSala(datos);
  }).catch(function (e) {
    console.error("No se pudo leer la sala", codigo + ":", e.message);
    return null;
  }).then(function (sala) {
    cargando.delete(codigo);
    return sala;
  });
  cargando.set(codigo, p);
  return p;
}

/** Tras recuperar una sala que estaba jugando, se sigue cuando vuelven los jugadores. */
function quizasReanudar(sala, ws) {
  if (!sala.restaurada) return;
  if (sala.manoAnulada && ws && !ws.avisadoRecuperada) {
    ws.avisadoRecuperada = true;
    enviar(ws, { tipo: "recuperada", mensaje: "La mesa se recuperó tras un reinicio del servidor. La mano que estaba a medias se anuló y cada uno recuperó sus fichas." });
  } else if (ws && !ws.avisadoRecuperada) {
    ws.avisadoRecuperada = true;
    enviar(ws, { tipo: "recuperada", mensaje: "La mesa se recuperó tras un reinicio del servidor." });
  }
  if (!sala.partidaIniciada || sala.partidaTerminada || sala.mesa.fase !== "esperando" || sala.reanudando) return;
  const humanos = sala.mesa.jugadores().filter(function (j) { return j.tipo === "humano"; });
  const conectados = humanos.filter(function (j) { return j.conectado !== false; }).length;
  const hayBots = sala.mesa.jugadores().some(function (j) { return j.tipo === "bot"; });
  if (conectados >= Math.min(2, humanos.length) || (conectados >= 1 && hayBots)) {
    sala.reanudando = true;
    luego(sala, RAPIDO ? 50 : 2500, function () {
      sala.reanudando = false;
      sala.restaurada = false;
      if (sala.partidaIniciada && !sala.partidaTerminada && sala.mesa.fase === "esperando") empezarMano(sala);
    });
  }
}

/* =========================================================
   GRUPOS: cuentas guardadas entre noches
   ========================================================= */
function codigoGrupo() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += letras[crypto.randomInt(letras.length)];
  return c;
}

function normalizarCodigoGrupo(crudo) {
  return String(crudo || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

/** Manda a la sala la vista del grupo y al anfitrión la copia firmada. */
function avisarGrupo(sala, grupo, soloWs) {
  const vista = Persistencia.vistaGrupo(grupo);
  const copia = { datos: grupo, firma: Persistencia.firmar(SECRETO_COPIAS, grupo) };
  const destinos = soloWs ? [[soloWs.jugadorId, soloWs]] : Array.from(sala.clientes.entries());
  for (let i = 0; i < destinos.length; i++) {
    const id = destinos[i][0], ws = destinos[i][1];
    const msg = { tipo: "grupo", grupo: vista };
    if (id === sala.anfitrionId) msg.copia = copia;
    enviar(ws, msg);
  }
}

/** Añade al grupo las partidas cerradas de la sala que todavía no estaban. */
function registrarEnGrupo(sala, soloWs) {
  if (!sala.grupo) return Promise.resolve(null);
  const codigo = sala.grupo.codigo;
  return almacen.leer("grupo:" + codigo).then(function (g) {
    g = g || Persistencia.nuevoGrupo(codigo, sala.grupo.nombre);
    Persistencia.agregarAlGrupo(g, sala.codigo, sala.partidasCerradas || []);
    return almacen.guardar("grupo:" + codigo, g, VIDA_GRUPO_S).then(function () {
      avisarGrupo(sala, g, soloWs);
      return g;
    });
  }).catch(function (e) {
    console.error("grupo:", e.message);
    if (soloWs) enviar(soloWs, { tipo: "error", mensaje: "No se pudo guardar el grupo ahora. Probá de nuevo en un momento." });
    return null;
  });
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
    espectadores: sala.espectadores.size,
    fichasIniciales: sala.mesa.fichasIniciales,
    ciegaPequena: sala.mesa.ciegaPequena,
    ciegaGrande: sala.mesa.ciegaGrande,
    subirCiegasCada: sala.mesa.subirCiegasCada,
    // Reloj de turno: solo vale mientras el turno siga siendo de quien tiene el reloj
    turnoRestanteMs: (sala.turnoVigilado && sala.mesa.turnoId === sala.turnoVigilado.id)
      ? Math.max(0, sala.turnoVigilado.vence - Date.now())
      : null,
    turnoDe: (sala.turnoVigilado && sala.mesa.turnoId === sala.turnoVigilado.id) ? sala.turnoVigilado.id : null,
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
    quizasReanudar(sala, ws);
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
  if (!sala.anfitrionId) sala.anfitrionId = jugador.id;   // sala recuperada sin anfitrión conectado
  console.log("Reconexión", jugador.nombre, "en", sala.codigo);
  entregarEstado(sala, ws);
  transmitir(sala, "sala-actualizada");
  quizasReanudar(sala, ws);
  if (sala.grupo) registrarEnGrupo(sala, ws);
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

  // Si la sala no está en memoria (el servidor se durmió o se reinició), se busca en el almacén
  // y se vuelve a procesar el mismo mensaje. _cargada evita repetirlo más de una vez.
  if ((tipo === "reconectar" || tipo === "unirse" || tipo === "mirar") && !msg._cargada) {
    const codigoBuscado = normalizarCodigo(msg.codigo);
    const yaEsta = tipo === "reconectar" ? buscarPorToken(String(msg.token || "")) : salas.get(codigoBuscado);
    if (!yaEsta && codigoBuscado.length === 5 && almacen.persistente) {
      obtenerSala(codigoBuscado).then(function () {
        if (ws.readyState !== 1) return;
        try { manejar(ws, Object.assign({}, msg, { _cargada: true })); } catch (e) {
          console.error(e);
          enviar(ws, { tipo: "error", mensaje: "Error interno del servidor." });
        }
      });
      return;
    }
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

  if ((tipo === "crear-privada" || tipo === "unirse" || tipo === "unirse-publica" || tipo === "mirar") && !msg._cargada) {
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
    avisarEspectadores(sala);
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
      asientos: leerAsientos(msg),
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
        asientos: leerAsientos(msg),
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
    const yaHay = sala.mesa.jugadores().filter(function (j) { return j.personalidad; }).map(function (j) { return j.personalidad; });
    const libresP = sala.mesa.asientosTotales - sala.mesa.jugadores().length;
    // Mezcla variada: primero las personalidades que todavía no están en la mesa
    const pers = Bots.repartirPersonalidades(libresP + yaHay.length).filter(function (p) {
      const k = yaHay.indexOf(p); if (k >= 0) { yaHay.splice(k, 1); return false; } return true;
    });
    let asiento;
    let k = 0;
    while ((asiento = sala.mesa.asientoLibre()) >= 0) {
      const bot = Bots.crearBot(usados, pers[k++]);
      usados.push(bot.nombre);
      sala.mesa.sentar({
        id: "bot-" + sala.codigo + "-" + asiento,
        nombre: bot.nombre,
        tipo: "bot",
        asiento: asiento,
        personalidad: bot.personalidad,
        avatar: Avatar.aleatorio(bot.nombre)
      });
    }
    transmitir(sala, "sala-actualizada");
    return;
  }

  if (tipo === "iniciar") {
    if (sala.partidaTerminada) {
      enviar(ws, { tipo: "error", mensaje: "Esta partida ya cerró las cuentas. El anfitrión puede empezar «Otra partida» desde las cuentas." });
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
    const actuo = sala.mesa.jugadorPorId(ws.jugadorId);
    if (actuo) actuo.timeoutsSeguidos = 0;
    cancelarTurnoHumano(sala, actuo);
    programarBots(sala);
    return;
  }

  if (tipo === "chat") {
    // Frase rápida de la lista o texto escrito (hasta 80 caracteres, se limpia acá y se muestra escapado)
    let frase;
    let libre = false;
    if (msg.texto != null) {
      if (typeof msg.texto !== "string" || Array.from(msg.texto).length > Util.MAX_CHAT * 4) {
        enviar(ws, { tipo: "error", codigoError: "chat-largo", mensaje: "El mensaje puede tener hasta " + Util.MAX_CHAT + " letras." });
        return;
      }
      frase = Util.limpiarChat(msg.texto);
      libre = true;
      if (!frase) {
        enviar(ws, { tipo: "error", codigoError: "chat-vacio", mensaje: "Escribí algo antes de mandar." });
        return;
      }
    } else {
      frase = String(msg.frase || "");
      if (FRASES_CHAT.indexOf(frase) < 0) {
        enviar(ws, { tipo: "error", mensaje: "Esa frase no está permitida." });
        return;
      }
    }
    const ahora = Date.now();
    if (ws.ultimoChat && ahora - ws.ultimoChat < CHAT_COOLDOWN_MS) {
      enviar(ws, { tipo: "error", codigoError: "chat-rapido", mensaje: "Esperá un segundo antes de mandar otra frase." });
      return;
    }
    ws.chatVentana = (ws.chatVentana || []).filter(function (t) { return ahora - t < CHAT_VENTANA_MS; });
    if (ws.chatVentana.length >= CHAT_MAX_VENTANA) {
      enviar(ws, { tipo: "error", codigoError: "chat-rapido", mensaje: "Muchos mensajes seguidos. Esperá unos segundos." });
      return;
    }
    ws.chatVentana.push(ahora);
    ws.ultimoChat = ahora;
    const j = sala.mesa.jugadorPorId(ws.jugadorId);
    transmitir(sala, "chat", {
      frase: frase,
      libre: libre,
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
    finalizarPartida(sala);
    return;
  }

  if (tipo === "otra-partida") {
    if (sala.anfitrionId !== ws.jugadorId) {
      enviar(ws, { tipo: "error", mensaje: "Solo el anfitrión puede empezar otra partida." });
      return;
    }
    if (!sala.partidaTerminada) {
      enviar(ws, { tipo: "error", mensaje: "Primero hay que terminar esta partida y ver las cuentas." });
      return;
    }
    const conGente = sala.mesa.jugadores().length;
    if (conGente < 2) {
      enviar(ws, { tipo: "error", mensaje: "Se necesitan al menos 2 jugadores en la mesa para otra partida." });
      return;
    }
    otraPartida(sala);
    return;
  }

  if (tipo === "grupo") {
    const accion = String(msg.accion || "");
    if (accion === "ver") {
      if (!sala.grupo) { enviar(ws, { tipo: "grupo", grupo: null }); return; }
      almacen.leer("grupo:" + sala.grupo.codigo).then(function (g) {
        if (g) avisarGrupo(sala, g, ws);
        else enviar(ws, { tipo: "grupo", grupo: null, perdido: sala.grupo });
      }).catch(function () { enviar(ws, { tipo: "error", mensaje: "No se pudo leer el grupo ahora." }); });
      return;
    }
    if (sala.anfitrionId !== ws.jugadorId) {
      enviar(ws, { tipo: "error", mensaje: "Solo el anfitrión puede elegir el grupo donde se guardan las cuentas." });
      return;
    }
    if (accion === "quitar") {
      sala.grupo = null;
      transmitir(sala, "grupo-actualizado", { grupo: null });
      return;
    }
    if (accion === "crear") {
      const nombre = String(msg.nombre || "").replace(/[<>]/g, "").trim().slice(0, 40);
      if (nombre.length < 2) {
        enviar(ws, { tipo: "error", codigoError: "grupo", mensaje: "Ponele un nombre al grupo (al menos 2 letras)." });
        return;
      }
      sala.grupo = { codigo: codigoGrupo(), nombre: nombre };
      registrarEnGrupo(sala).then(function () {
        transmitir(sala, "grupo-actualizado", { grupo: sala.grupo });
      });
      return;
    }
    if (accion === "usar") {
      const codigo = normalizarCodigoGrupo(msg.codigo);
      if (codigo.length !== 6) {
        enviar(ws, { tipo: "error", codigoError: "grupo", mensaje: "El código del grupo tiene 6 letras o números." });
        return;
      }
      almacen.leer("grupo:" + codigo).then(function (g) {
        if (!g) {
          enviar(ws, { tipo: "error", codigoError: "grupo-no-existe", codigo: codigo, mensaje: "No encuentro ese grupo. Si lo tenías guardado en este teléfono, se intentará recuperar." });
          return;
        }
        sala.grupo = { codigo: g.codigo, nombre: g.nombre };
        registrarEnGrupo(sala).then(function () {
          transmitir(sala, "grupo-actualizado", { grupo: sala.grupo });
        });
      }).catch(function () { enviar(ws, { tipo: "error", mensaje: "No se pudo leer el grupo ahora." }); });
      return;
    }
    enviar(ws, { tipo: "error", mensaje: "Acción de grupo desconocida." });
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
    if (sala) {
      sala.espectadores.delete(ws.jugadorId);
      avisarEspectadores(sala);
    }
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
  ws.limiteMensajes = Limites.crearLimitador(MAX_MENSAJES_VENTANA * FACTOR_LIMITES, VENTANA_MENSAJES_MS);
  ws.avisosExceso = 0;
  ws.on("error", function () { /* mensaje demasiado grande o conexión rota: se cierra sola */ });
  ws.jugadorId = nuevoId();
  ws.codigoSala = null;
  ws.token = null;
  ws.isAlive = true;
  ws.salidaIntencional = false;

  ws.on("pong", function () { ws.isAlive = true; });

  ws.on("message", function (raw) {
    // Cualquier mensaje del cliente (incluido su "ping" cada 20 s) demuestra que sigue vivo
    ws.isAlive = true;
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
