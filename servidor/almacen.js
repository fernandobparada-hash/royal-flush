/* =========================================================
   ALMACÉN: dónde se guardan las mesas y los grupos
   ---------------------------------------------------------
   El servidor gratis de Render se duerme y al despertar pierde
   la memoria. Para no perder las mesas usamos un almacén con
   tres variantes (la misma interfaz para las tres):

   - "kv":      Render Key Value (gratis). Variable REDIS_URL.
                Es otra máquina: sobrevive a que el juego se
                duerma, se reinicie o se vuelva a publicar.
                Límite: el plan gratis guarda solo en memoria,
                si esa máquina se reinicia se borra todo.
   - "archivo": un archivo JSON (POKER_ALMACEN_ARCHIVO). Para
                probar en tu computadora.
   - "memoria": nada persistente. Lo que había antes.

   Todas las funciones devuelven promesas:
     leer(clave) -> objeto o null
     guardar(clave, objeto, segundosDeVida)
     borrar(clave)
   ========================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { crearClienteKV } = require("./kv.js");

const PREFIJO = "rf:";

function almacenMemoria() {
  const datos = new Map();
  return {
    tipo: "memoria",
    persistente: false,
    leer: function (clave) {
      const e = datos.get(clave);
      if (!e) return Promise.resolve(null);
      if (e.vence && e.vence < Date.now()) { datos.delete(clave); return Promise.resolve(null); }
      return Promise.resolve(JSON.parse(e.json));
    },
    guardar: function (clave, valor, segundos) {
      datos.set(clave, { json: JSON.stringify(valor), vence: segundos ? Date.now() + segundos * 1000 : 0 });
      return Promise.resolve();
    },
    borrar: function (clave) { datos.delete(clave); return Promise.resolve(); }
  };
}

function almacenArchivo(ruta) {
  let cache = null;
  let escribiendo = Promise.resolve();
  function cargar() {
    if (cache) return cache;
    try { cache = JSON.parse(fs.readFileSync(ruta, "utf8")); } catch (e) { cache = {}; }
    return cache;
  }
  function volcar() {
    const texto = JSON.stringify(cache);
    escribiendo = escribiendo.then(function () {
      const tmp = ruta + ".tmp";
      fs.mkdirSync(path.dirname(ruta), { recursive: true });
      fs.writeFileSync(tmp, texto);
      fs.renameSync(tmp, ruta);   // cambio atómico: nunca queda un archivo a medias
    }).catch(function (e) { console.error("almacén archivo:", e.message); });
    return escribiendo;
  }
  return {
    tipo: "archivo",
    persistente: true,
    leer: function (clave) {
      const d = cargar();
      const e = d[clave];
      if (!e) return Promise.resolve(null);
      if (e.vence && e.vence < Date.now()) { delete d[clave]; return Promise.resolve(null); }
      return Promise.resolve(e.valor);
    },
    guardar: function (clave, valor, segundos) {
      const d = cargar();
      d[clave] = { valor: JSON.parse(JSON.stringify(valor)), vence: segundos ? Date.now() + segundos * 1000 : 0 };
      return volcar();
    },
    borrar: function (clave) {
      const d = cargar();
      delete d[clave];
      return volcar();
    }
  };
}

function almacenKV(url) {
  const kv = crearClienteKV(url);
  return {
    tipo: "kv",
    persistente: true,
    leer: function (clave) {
      return kv.comando(["GET", PREFIJO + clave]).then(function (txt) { return txt ? JSON.parse(txt) : null; });
    },
    guardar: function (clave, valor, segundos) {
      const partes = ["SET", PREFIJO + clave, JSON.stringify(valor)];
      if (segundos) partes.push("EX", String(Math.round(segundos)));
      return kv.comando(partes).then(function () {});
    },
    borrar: function (clave) {
      return kv.comando(["DEL", PREFIJO + clave]).then(function () {});
    },
    probar: function () { return kv.comando(["PING"]); },
    cerrar: function () { kv.cerrar(); }
  };
}

/** Elige el almacén según las variables de entorno. */
function crearAlmacen(env) {
  env = env || process.env;
  const url = env.REDIS_URL || env.KV_URL || "";
  if (url) return almacenKV(url);
  if (env.POKER_ALMACEN_ARCHIVO) return almacenArchivo(env.POKER_ALMACEN_ARCHIVO);
  return almacenMemoria();
}

module.exports = {
  crearAlmacen: crearAlmacen,
  almacenMemoria: almacenMemoria,
  almacenArchivo: almacenArchivo,
  almacenKV: almacenKV
};
