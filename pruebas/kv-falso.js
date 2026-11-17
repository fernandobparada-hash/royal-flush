/* Servidor Redis "de mentira" (protocolo RESP) solo para pruebas: AUTH, SELECT, PING, GET, SET [EX], DEL, QUIT. */
"use strict";
const net = require("net");
const { leerRespuesta } = require("../servidor/kv");

function crearKVFalso(opciones) {
  opciones = opciones || {};
  const datos = new Map();
  const comandos = [];
  const server = net.createServer(function (sock) {
    let buf = Buffer.alloc(0);
    let autenticado = !opciones.clave;
    sock.on("data", function (d) {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        let r;
        try { r = leerRespuesta(buf, 0); } catch (e) { sock.destroy(); return; }
        if (!r) break;
        buf = buf.slice(r.pos);
        const partes = r.valor.map(String);
        const cmd = partes[0].toUpperCase();
        comandos.push(partes);
        if (opciones.mudo) continue;   // simula un KV colgado
        if (cmd === "AUTH") {
          const clave = partes[partes.length - 1];
          if (clave === opciones.clave) { autenticado = true; sock.write("+OK\r\n"); }
          else sock.write("-WRONGPASS invalid username-password pair\r\n");
          continue;
        }
        if (!autenticado) { sock.write("-NOAUTH Authentication required.\r\n"); continue; }
        if (cmd === "PING") sock.write("+PONG\r\n");
        else if (cmd === "SELECT" || cmd === "QUIT") sock.write("+OK\r\n");
        else if (cmd === "SET") { datos.set(partes[1], { v: partes[2], ex: partes[3] === "EX" ? Number(partes[4]) : null }); sock.write("+OK\r\n"); }
        else if (cmd === "GET") {
          const x = datos.get(partes[1]);
          if (!x) sock.write("$-1\r\n");
          else { const b = Buffer.from(x.v, "utf8"); sock.write("$" + b.length + "\r\n"); sock.write(b); sock.write("\r\n"); }
        } else if (cmd === "DEL") { const habia = datos.delete(partes[1]); sock.write(":" + (habia ? 1 : 0) + "\r\n"); }
        else sock.write("-ERR unknown command '" + cmd + "'\r\n");
      }
    });
    sock.on("error", function () {});
  });
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () {
      resolve({ puerto: server.address().port, datos: datos, comandos: comandos, cerrar: function () { server.close(); } });
    });
  });
}
module.exports = { crearKVFalso: crearKVFalso };
