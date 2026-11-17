/* Service worker de Royal Flush.
   - Solo guarda los archivos del juego (HTML, CSS, JS, iconos) para que abra rápido
     y se pueda instalar como app.
   - Siempre intenta la red primero: si hay internet se usa lo último del servidor.
   - NUNCA toca /ws (la conexión en vivo), /api ni /salud. */
"use strict";
const CACHE = "royal-flush-v11";
const ARCHIVOS = [
  "/", "/estilo.css", "/manifest.json", "/favicon.ico", "/favicon-32.png",
  "/icono-192.png", "/icono-512.png", "/apple-touch-icon.png",
  "/js/evaluador.js", "/js/motor.js", "/js/bots.js", "/js/avatar.js", "/js/historial.js",
  "/js/sonidos.js", "/js/utilidades.js", "/js/interfaz.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }).catch(function () {}));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function esEstatico(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  if (p === "/ws" || p.indexOf("/api/") === 0 || p === "/salud" || p === "/sw.js") return false;
  return true;
}

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.headers.get("upgrade")) return;   // WebSocket
  const url = new URL(req.url);
  if (!esEstatico(url)) return;
  const navegacion = req.mode === "navigate";
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === "basic" && !navegacion) {
        const copia = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copia); });
      }
      return res;
    }).catch(function () {
      // Sin internet: lo guardado. Para /m/CODIGO devolvemos la página principal.
      return caches.match(navegacion ? "/" : req).then(function (r) {
        return r || caches.match(req) || Response.error();
      });
    })
  );
});
