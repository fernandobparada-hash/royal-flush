/* =========================================================
   CLIENTE MÍNIMO DE REDIS / RENDER KEY VALUE
   ---------------------------------------------------------
   Habla el protocolo RESP de Redis (el mismo que usa Render
   Key Value) sin instalar nada: solo net/tls de Node.
   Comandos que usamos: PING, GET, SET (con EX), DEL, AUTH, SELECT.

   const kv = crearClienteKV("redis://usuario:clave@host:6379");
   await kv.comando(["SET", "clave", "valor", "EX", "60"]);
   const v = await kv.comando(["GET", "clave"]);
   ========================================================= */
"use strict";

const net = require("net");
const tls = require("tls");

/** Convierte un comando ["SET","a","b"] al formato RESP. */
function codificar(partes) {
  let s = "*" + partes.length + "\r\n";
  for (let i = 0; i < partes.length; i++) {
    const b = Buffer.from(String(partes[i]), "utf8");
    s += "$" + b.length + "\r\n" + b.toString("utf8") + "\r\n";
  }
  return s;
}

/**
 * Intenta leer UNA respuesta RESP desde buf[pos].
 * Devuelve { valor, pos } o null si todavía faltan bytes.
 */
function leerRespuesta(buf, pos) {
  if (pos >= buf.length) return null;
  const fin = buf.indexOf("\r\n", pos);
  if (fin < 0) return null;
  const tipo = String.fromCharCode(buf[pos]);
  const linea = buf.toString("utf8", pos + 1, fin);
  const sig = fin + 2;
  if (tipo === "+") return { valor: linea, pos: sig };
  if (tipo === "-") return { valor: new Error(linea), pos: sig };
  if (tipo === ":") return { valor: Number(linea), pos: sig };
  if (tipo === "$") {
    const n = Number(linea);
    if (n < 0) return { valor: null, pos: sig };
    if (buf.length < sig + n + 2) return null;
    return { valor: buf.toString("utf8", sig, sig + n), pos: sig + n + 2 };
  }
  if (tipo === "*") {
    const n = Number(linea);
    if (n < 0) return { valor: null, pos: sig };
    const arr = [];
    let p = sig;
    for (let i = 0; i < n; i++) {
      const r = leerRespuesta(buf, p);
      if (!r) return null;
      arr.push(r.valor);
      p = r.pos;
    }
    return { valor: arr, pos: p };
  }
  // Tipo desconocido: lo devolvemos como texto para no bloquear la conexión
  return { valor: linea, pos: sig };
}

function crearClienteKV(url, opciones) {
  opciones = opciones || {};
  const u = new URL(url);
  const usarTls = u.protocol === "rediss:";
  const host = u.hostname;
  const puerto = Number(u.port) || 6379;
  const usuario = decodeURIComponent(u.username || "");
  const clave = decodeURIComponent(u.password || "");
  const db = Number((u.pathname || "").replace("/", "")) || 0;
  const tiempoMax = opciones.tiempoMaxMs || 5000;

  let socket = null;
  let listo = null;          // promesa de conexión
  let buffer = Buffer.alloc(0);
  const pendientes = [];     // { resolve, reject, timer }

  function fallarTodo(err) {
    while (pendientes.length) {
      const p = pendientes.shift();
      clearTimeout(p.timer);
      p.reject(err);
    }
  }

  function alDatos(chunk) {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
    let pos = 0;
    while (pendientes.length) {
      const r = leerRespuesta(buffer, pos);
      if (!r) break;
      pos = r.pos;
      const p = pendientes.shift();
      clearTimeout(p.timer);
      if (r.valor instanceof Error) p.reject(r.valor);
      else p.resolve(r.valor);
    }
    buffer = pos >= buffer.length ? Buffer.alloc(0) : buffer.slice(pos);
  }

  function enviarCrudo(partes) {
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        const i = pendientes.findIndex(function (p) { return p.timer === timer; });
        if (i >= 0) pendientes.splice(i, 1);
        reject(new Error("KV: sin respuesta a " + partes[0]));
        // La conexión puede quedar desfasada: la cerramos y se rehace al siguiente comando
        if (socket) socket.destroy();
      }, tiempoMax);
      pendientes.push({ resolve: resolve, reject: reject, timer: timer });
      socket.write(codificar(partes));
    });
  }

  function conectar() {
    if (listo) return listo;
    listo = new Promise(function (resolve, reject) {
      const s = usarTls
        ? tls.connect({ host: host, port: puerto, servername: host })
        : net.connect({ host: host, port: puerto });
      socket = s;
      buffer = Buffer.alloc(0);
      const evento = usarTls ? "secureConnect" : "connect";
      const timer = setTimeout(function () { s.destroy(new Error("KV: no conecta")); }, tiempoMax);
      s.once(evento, function () {
        clearTimeout(timer);
        let p = Promise.resolve();
        if (clave) p = p.then(function () { return enviarCrudo(usuario ? ["AUTH", usuario, clave] : ["AUTH", clave]); });
        if (db) p = p.then(function () { return enviarCrudo(["SELECT", db]); });
        p.then(function () { resolve(); }, function (e) { s.destroy(); reject(e); });
      });
      s.on("data", alDatos);
      s.on("error", function (e) { clearTimeout(timer); reject(e); fallarTodo(e); });
      s.on("close", function () {
        clearTimeout(timer);
        if (socket === s) { socket = null; listo = null; }
        fallarTodo(new Error("KV: conexión cerrada"));
      });
    });
    listo.catch(function () { listo = null; });
    return listo;
  }

  return {
    comando: function (partes) {
      return conectar().then(function () { return enviarCrudo(partes); });
    },
    cerrar: function () {
      if (socket) socket.end();
      socket = null;
      listo = null;
    }
  };
}

module.exports = { crearClienteKV: crearClienteKV, codificar: codificar, leerRespuesta: leerRespuesta };
