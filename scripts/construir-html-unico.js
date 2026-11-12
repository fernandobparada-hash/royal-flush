#!/usr/bin/env node
/* Junta el HTML, el CSS y los JS en un solo archivo que se abre con un doble clic.
   Uso:  node scripts/construir-html-unico.js            (escribe royal-flush.html)
         node scripts/construir-html-unico.js --stdout   (lo imprime, para comprobarlo) */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const publico = path.join(raiz, "public");

// El orden importa: cada archivo usa los anteriores
const SCRIPTS = ["evaluador.js", "motor.js", "bots.js", "avatar.js", "historial.js", "sonidos.js", "utilidades.js", "interfaz.js"];

/** Reemplaza un trozo exacto y AVISA si no lo encuentra (antes fallaba en silencio). */
function reemplazar(html, buscar, poner, nombre) {
  if (html.indexOf(buscar) === -1) {
    throw new Error("No encuentro '" + nombre + "' en public/index.html. ¿Cambiaste el HTML sin actualizar scripts/construir-html-unico.js?");
  }
  return html.replace(buscar, function () { return poner; });
}

function construir() {
  let html = fs.readFileSync(path.join(publico, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(publico, "estilo.css"), "utf8");
  const scripts = SCRIPTS.map(function (n) { return fs.readFileSync(path.join(publico, "js", n), "utf8"); });

  html = reemplazar(
    html,
    '  <link rel="stylesheet" href="/estilo.css">\n',
    "  <!-- Versión de un solo archivo: se puede abrir con un doble clic. El modo solo funciona sin servidor. -->\n  <style>\n" + css + "\n  </style>\n",
    "el enlace a estilo.css"
  );

  // En el archivo suelto no hay servidor que sirva el manifiesto ni los iconos
  html = reemplazar(html, '  <link rel="manifest" href="/manifest.json">\n', "", "el manifiesto");
  html = reemplazar(html, '  <link rel="apple-touch-icon" href="/apple-touch-icon.png">\n', "", "el icono de Apple");

  const bloqueScripts = "\n" + SCRIPTS.map(function (n) { return '  <script src="/js/' + n + '"></script>\n'; }).join("");
  html = reemplazar(html, bloqueScripts, "\n  <script>\n" + scripts.join("\n") + "\n  </script>\n", "la lista de <script>");
  return html;
}

if (require.main === module) {
  const html = construir();
  if (process.argv.indexOf("--stdout") >= 0) {
    process.stdout.write(html);
  } else {
    const destino = path.join(raiz, "royal-flush.html");
    fs.writeFileSync(destino, html);
    console.log("Escrito", destino, "(" + html.length + " bytes)");
  }
}

module.exports = { construir: construir, SCRIPTS: SCRIPTS };
