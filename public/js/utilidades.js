/* =========================================================
   UTILIDADES — funciones pequeñas que no tocan la pantalla
   ---------------------------------------------------------
   Formatear números, escapar texto para HTML, geometría de
   cajas, nombres de acciones... Viven aquí (y no dentro de
   interfaz.js) porque así se pueden probar sin navegador
   (pruebas/probar-utilidades.js) y interfaz.js queda más corto.
   ========================================================= */

(function (raiz) {
  "use strict";

  function formatearFichas(n) {
    n = Math.round(Number(n) || 0);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function formatearBs(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    const s = (v % 1 === 0) ? String(v) : String(v).replace(".", ",");
    return s + " Bs";
  }

  function escapar(texto) {
    return String(texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function rectsSeSolapan(a, b, holgura) {
    holgura = holgura == null ? 2 : holgura;
    return !(a.right + holgura <= b.left || b.right + holgura <= a.left || a.bottom + holgura <= b.top || b.bottom + holgura <= a.top);
  }

  function caja(x, y, w, h) {
    return { x: x, y: y, w: w, h: h, left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 };
  }

  function sePisan(a, b, g) {
    g = g == null ? 3 : g;
    return !(a.right + g <= b.left || b.right + g <= a.left || a.bottom + g <= b.top || b.bottom + g <= a.top);
  }

  function textoAccion(accion) {
    const mapa = {
      "retirarse": "Retirado",
      "pasar": "Pasa",
      "igualar": "Iguala",
      "apostar": "Apuesta",
      "subir": "Sube",
      "all-in": "All-in",
      "ciega-pequena": "Ciega chica",
      "ciega-grande": "Ciega grande"
    };
    return mapa[accion] || "";
  }

  function colorFicha(i, cantidad) {
    if (cantidad >= 10000) {
      const c = ["#f4d35e", "#1a1a1a", "#c41e3a", "#2b6bb0"];
      return c[i % c.length];
    }
    if (cantidad >= 1000) {
      const c = ["#1a1a1a", "#c41e3a", "#2b6bb0", "#e8e0c8"];
      return c[i % c.length];
    }
    const c = ["#c41e3a", "#e8e0c8", "#2b6bb0"];
    return c[i % c.length];
  }

  function primerNombre(nombre) {
    const txt = String(nombre || "").trim();
    if (!txt) return "";
    return txt.split(/\s+/)[0];
  }

  function extraerCodigo(texto) {
    const raw = String(texto || "").trim().toUpperCase();
    const fromPath = raw.match(/\/M\/([A-Z0-9]{4,12})/);
    if (fromPath) return fromPath[1].slice(0, 5);
    const letras = raw.replace(/[^A-Z0-9]/g, "");
    if (letras.length >= 5) return letras.slice(0, 5);
    return letras;
  }

  function anguloAsiento(indice, total, gap) {
    const available = Math.PI * 2 - gap;
    const u = (indice / total) * available;
    const mid = Math.PI - gap / 2;
    return u <= mid ? u : u + gap;
  }

  function textoCiegas(estado) {
    let t = "Ciegas " + estado.ciegaPequena + " / " + estado.ciegaGrande;
    if (estado.subirCiegasCada) {
      // manosParaSubirCiegas = 0 significa "se duplican al empezar la próxima mano"
      const f = estado.manosParaSubirCiegas;
      if (f === 0) t += " · suben en la próxima mano";
      else if (f != null) t += " · suben en " + (f + 1) + " manos";
    }
    return t;
  }

  const api = {
    formatearFichas: formatearFichas,
    formatearBs: formatearBs,
    escapar: escapar,
    clamp: clamp,
    rectsSeSolapan: rectsSeSolapan,
    caja: caja,
    sePisan: sePisan,
    textoAccion: textoAccion,
    colorFicha: colorFicha,
    primerNombre: primerNombre,
    extraerCodigo: extraerCodigo,
    anguloAsiento: anguloAsiento,
    textoCiegas: textoCiegas
  };

  raiz.PokerUtilidades = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
