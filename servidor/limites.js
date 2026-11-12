/* =========================================================
   LÍMITES Y PROTECCIONES DEL SERVIDOR
   ---------------------------------------------------------
   Un servidor abierto a internet recibe de todo: mensajes
   enormes, miles de mensajes por segundo, alguien probando
   códigos de sala al azar... Este archivo reúne las defensas
   pequeñas y sin dependencias que usa server.js:

   - crearLimitador:  "como máximo N cosas cada X segundos"
   - ipDe:            saca la IP real del visitante
   - cabecerasSeguras: cabeceras HTTP que endurecen el navegador
   - ContadorConexiones: cuántas conexiones abiertas tiene cada IP
   ========================================================= */

"use strict";

/**
 * Limitador de ventana deslizante.
 * const lim = crearLimitador(5, 10000);   // 5 cada 10 segundos
 * lim.permitir("1.2.3.4")  -> true / false
 */
function crearLimitador(maximo, ventanaMs, ahoraFn) {
  const ahora = ahoraFn || Date.now;
  const registros = new Map();

  function limpiar(t) {
    for (const [clave, marcas] of registros) {
      while (marcas.length && t - marcas[0] >= ventanaMs) marcas.shift();
      if (marcas.length === 0) registros.delete(clave);
    }
  }

  let ultimaLimpieza = ahora();

  return {
    permitir: function (clave) {
      const t = ahora();
      // Cada cierto tiempo borramos las claves viejas para no gastar memoria
      if (t - ultimaLimpieza > ventanaMs) {
        limpiar(t);
        ultimaLimpieza = t;
      }
      let marcas = registros.get(clave);
      if (!marcas) {
        marcas = [];
        registros.set(clave, marcas);
      }
      while (marcas.length && t - marcas[0] >= ventanaMs) marcas.shift();
      if (marcas.length >= maximo) return false;
      marcas.push(t);
      return true;
    },
    tamano: function () { return registros.size; }
  };
}

/**
 * IP del visitante. Detrás de un proxy (Render, Heroku, nginx...) la IP
 * real viene en X-Forwarded-For; si no hay proxy, esa cabecera la puede
 * inventar cualquiera, así que solo se usa cuando confiamos en el proxy.
 */
function ipDe(req, confiarProxy) {
  if (confiarProxy) {
    const xff = req.headers && req.headers["x-forwarded-for"];
    if (xff) {
      const primera = String(xff).split(",")[0].trim();
      if (primera) return primera;
    }
  }
  return (req.socket && req.socket.remoteAddress) || "desconocida";
}

/** Cabeceras de seguridad para todas las respuestas HTTP. */
function cabecerasSeguras(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'"
    ].join("; ")
  );
  next();
}

/** Cuenta las conexiones abiertas de cada IP. */
function ContadorConexiones(maximoPorIp) {
  this.maximo = maximoPorIp;
  this.porIp = new Map();
}
ContadorConexiones.prototype.entrar = function (ip) {
  const n = this.porIp.get(ip) || 0;
  if (n >= this.maximo) return false;
  this.porIp.set(ip, n + 1);
  return true;
};
ContadorConexiones.prototype.salir = function (ip) {
  const n = (this.porIp.get(ip) || 0) - 1;
  if (n <= 0) this.porIp.delete(ip);
  else this.porIp.set(ip, n);
};

module.exports = {
  crearLimitador: crearLimitador,
  ipDe: ipDe,
  cabecerasSeguras: cabecerasSeguras,
  ContadorConexiones: ContadorConexiones
};
