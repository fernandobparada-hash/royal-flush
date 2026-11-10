#!/usr/bin/env node
/* Junta el HTML, el CSS y los JS en un solo archivo que se abre con un doble clic. */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const publico = path.join(raiz, "public");

let html = fs.readFileSync(path.join(publico, "index.html"), "utf8");
const css = fs.readFileSync(path.join(publico, "estilo.css"), "utf8");
const scripts = ["evaluador.js", "motor.js", "bots.js", "avatar.js", "interfaz.js"]
  .map((n) => fs.readFileSync(path.join(publico, "js", n), "utf8"));

html = html.replace(
  '  <link rel="stylesheet" href="/estilo.css">\n',
  "  <!-- Versión de un solo archivo: se puede abrir con un doble clic. El modo solo funciona sin servidor. -->\n  <style>\n" + css + "\n  </style>\n"
);

// En el archivo suelto no hay servidor que sirva el manifiesto ni los iconos
html = html.replace('  <link rel="manifest" href="/manifest.json">\n', "");
html = html.replace('  <link rel="apple-touch-icon" href="/apple-touch-icon.png">\n', "");

html = html.replace(
  '\n  <script src="/js/evaluador.js"></script>\n  <script src="/js/motor.js"></script>\n  <script src="/js/bots.js"></script>\n  <script src="/js/avatar.js"></script>\n  <script src="/js/interfaz.js"></script>\n',
  "\n  <script>\n" + scripts.join("\n") + "\n  </script>\n"
);

const destino = path.join(raiz, "royal-flush.html");
fs.writeFileSync(destino, html);
console.log("Escrito", destino, "(" + html.length + " bytes)");
