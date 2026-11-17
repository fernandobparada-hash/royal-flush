/* =========================================================
   AVATARES SVG DE ROYAL FLUSH (v12)
   ---------------------------------------------------------
   Se pintan igual en el navegador y en el servidor (bots).
   Con degradados para la piel, sombras suaves, contornos,
   ojos con iris/pupila/brillo y texturas (escamas, mechones,
   oro metálico). Cada opción tiene un precio en monedas
   (0 = gratis); la tienda decide qué está desbloqueado.
   ========================================================= */
(function (raiz, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  raiz.PokerAvatar = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Cantidad de opciones por parte (el orden de las primeras se mantiene: los avatares viejos siguen igual)
  const CAMPOS = {
    cabeza: 6, cara: 3, piel: 6, pelo: 8, colorPelo: 7, ojos: 4, colorOjos: 4, cejas: 4, boca: 5,
    barba: 7, marcas: 6, orejas: 7, lentes: 7, mascara: 6, sombrero: 12, aretes: 4, camisa: 8, fondo: 8
  };
  const ORDEN = Object.keys(CAMPOS);
  const NUEVOS = ["cabeza", "colorOjos", "marcas", "orejas", "mascara", "sombrero"];

  const PIEL = ["#f3e0c8", "#f6d0b1", "#e0aa7b", "#c68642", "#8d5524", "#5c3317"];
  const PELO = ["#1a1a1a", "#3b2a1a", "#8b4513", "#d4a017", "#c0392b", "#4a6fa5", "#d8d4cf"];
  const IRIS = ["#6b4423", "#3f8f4f", "#3a7bd5", "#7d8a96"];
  const CAMISA = ["#1f4e79", "#1b7a46", "#8b1e1e", "#3d2b6b", "#c47c16", "#0e7490", "#1f2933", "#7f1d4a"];
  const FONDO = ["#163028", "#1d3a4a", "#3a2040", "#3a2a16", "#14221c", "#2a1a1a", "#1a2840", "#243018"];

  const LABELS = {
    cabeza: ["Humana", "Cabeza de pez", "Rana", "Robot", "Calavera", "Alien"],
    cara: ["Redonda", "Óvalo", "Cuadrada"],
    piel: ["Muy clara", "Clara", "Media", "Morena", "Oscura", "Profunda"],
    pelo: ["Corto", "Largo", "Rizado", "Calvo", "Coleta", "De lado", "Gorra", "Gorro"],
    colorPelo: ["Negro", "Castaño", "Cobre", "Rubio", "Rojo", "Azul", "Canoso"],
    ojos: ["Normales", "Alegres", "Cerrados", "Pícaros"],
    colorOjos: ["Café", "Verdes", "Azules", "Grises"],
    cejas: ["Naturales", "Pobladas", "Finas", "Levantadas"],
    boca: ["Sonrisa", "Gran sonrisa", "Seria", "Sorpresa", "Guiño"],
    barba: ["Sin barba", "Sombra", "Barba", "Bigote", "Perilla", "Bigote manubrio", "Bigotazo"],
    marcas: ["Ninguna", "Cara con granos", "Pecas", "Rubor", "Cicatriz", "Pintura de guerra"],
    orejas: ["Normales", "Orejas de mono", "De gato", "De conejo", "De oso", "De elfo", "De perro"],
    lentes: ["Sin lentes", "Anteojos", "De sol", "Lentes de oro", "Monóculo", "Corazones", "Estrellas"],
    mascara: ["Ninguna", "Antifaz", "Parche pirata", "Luchador", "Nariz de payaso", "Barbijo"],
    sombrero: ["Ninguno", "Corona", "Galera", "Vaquero", "Pirata", "Mago", "Fiesta", "Chef", "Vikingo", "Aureola", "Bombín de cholita", "Chullo"],
    aretes: ["Sin aretes", "Aretes", "Aros de oro", "Perlas"],
    camisa: ["Azul", "Verde", "Roja", "Violeta", "Mostaza", "Cielo", "Grafito", "Fucsia"],
    fondo: ["Bosque", "Lago", "Uva", "Tierra", "Musgo", "Vino", "Noche", "Oliva"]
  };

  const NOMBRES_CAMPO = {
    cabeza: "Cabeza", cara: "Cara", piel: "Piel", pelo: "Pelo", colorPelo: "Color de pelo", ojos: "Ojos",
    colorOjos: "Color de ojos", cejas: "Cejas", boca: "Boca", barba: "Barba y bigote", marcas: "Marcas",
    orejas: "Orejas", lentes: "Lentes", mascara: "Máscaras", sombrero: "Sombreros", aretes: "Aretes",
    camisa: "Camisa", fondo: "Fondo"
  };

  // Precio en monedas de cada opción (0 = gratis). Lo que no aparece es gratis.
  const PRECIOS = {
    cabeza: [0, 1000, 400, 450, 350, 500],
    barba: [0, 0, 0, 0, 0, 80, 60],
    marcas: [0, 1000, 0, 0, 80, 120],
    orejas: [0, 1000, 150, 150, 120, 100, 0],
    lentes: [0, 0, 0, 250, 150, 100, 120],
    mascara: [0, 100, 120, 300, 0, 0],
    sombrero: [0, 500, 200, 150, 180, 220, 0, 100, 250, 300, 150, 0],
    aretes: [0, 0, 120, 90]
  };

  // Exclusivos: 1000 monedas cada uno, solo se consiguen con monedas (los bots nunca los usan)
  const EXCLUSIVOS = ["cabeza:1", "marcas:1", "orejas:1"];
  function esExclusivo(campo, i) { return EXCLUSIVOS.indexOf(campo + ":" + i) >= 0; }

  function precio(campo, i) {
    const p = PRECIOS[campo];
    return p && p[i] ? p[i] : 0;
  }

  function acotar(n, max) {
    n = Number(n);
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(max - 1, Math.round(n));
  }

  function normalizar(crudo) {
    const a = {};
    const src = crudo && typeof crudo === "object" ? crudo : {};
    ORDEN.forEach(function (k) { a[k] = acotar(src[k], CAMPOS[k]); });
    return a;
  }

  /** Avatar al azar (para los bots). Las piezas nuevas salen de vez en cuando. */
  function aleatorio(semilla) {
    let s = 0;
    if (typeof semilla === "string") {
      for (let i = 0; i < semilla.length; i++) s = (s * 33 + semilla.charCodeAt(i)) >>> 0;
    } else if (typeof semilla === "number") {
      s = semilla >>> 0;
    } else {
      s = Math.floor(Math.random() * 0xffffffff);
    }
    function rnd(n) {
      s = (s * 1664525 + 1013904223) >>> 0;
      return (s >>> 8) % n;
    }
    const a = {};
    ORDEN.forEach(function (k) {
      if (NUEVOS.indexOf(k) >= 0 && k !== "colorOjos") a[k] = rnd(100) < (k === "cabeza" ? 6 : 22) ? 1 + rnd(CAMPOS[k] - 1) : 0;
      else a[k] = rnd(CAMPOS[k]);
      if (esExclusivo(k, a[k])) a[k] = 0;
    });
    return a;
  }

  function porDefecto() {
    return normalizar({ cara: 1, piel: 1, pelo: 0, colorPelo: 1, ojos: 0, cejas: 0, boca: 0, barba: 0, lentes: 0, aretes: 0, camisa: 0, fondo: 0 });
  }

  /* ---------- Colores ---------- */
  function hexA(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function aHex(c) { return "#" + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? "0" : "") + v.toString(16); }).join(""); }
  function mezclar(a, b, t) { const x = hexA(a), y = hexA(b); return aHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function aclarar(c, t) { return mezclar(c, "#ffffff", t); }
  function oscurecer(c, t) { return mezclar(c, "#000000", t); }

  /* ---------- Piezas ---------- */
  let contador = 0;
  const cache = {};

  function radial(id, cx, cy, r, paradas) {
    return '<radialGradient id="' + id + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '">' +
      paradas.map(function (p) { return '<stop offset="' + p[0] + '" stop-color="' + p[1] + '"' + (p[2] != null ? ' stop-opacity="' + p[2] + '"' : "") + "/>"; }).join("") + "</radialGradient>";
  }
  function lineal(id, x1, y1, x2, y2, paradas) {
    return '<linearGradient id="' + id + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '">' +
      paradas.map(function (p) { return '<stop offset="' + p[0] + '" stop-color="' + p[1] + '"/>'; }).join("") + "</linearGradient>";
  }

  /** Un ojo con esclerótica, iris, pupila y brillo. */
  function ojo(x, y, iris, tam, mira) {
    tam = tam || 1; mira = mira || 0;
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (3.6 * tam) + '" ry="' + (3.9 * tam) + '" fill="#fbfbf7" stroke="#2a1a10" stroke-width="0.7"/>' +
      '<circle cx="' + (x + 0.3 + mira) + '" cy="' + (y + 0.4) + '" r="' + (2.3 * tam) + '" fill="' + iris + '"/>' +
      '<circle cx="' + (x + 0.3 + mira) + '" cy="' + (y + 0.4) + '" r="' + (2.3 * tam) + '" fill="none" stroke="' + oscurecer(iris, 0.45) + '" stroke-width="0.5"/>' +
      '<circle cx="' + (x + 0.4 + mira) + '" cy="' + (y + 0.5) + '" r="' + (1.15 * tam) + '" fill="#120a06"/>' +
      '<circle cx="' + (x - 0.7 + mira) + '" cy="' + (y - 0.7) + '" r="' + (0.75 * tam) + '" fill="#fff"/>';
  }

  function cuerpoSVG(A, ids) {
    // Cuello con sombra + camisa con degradado y cuello en V
    const piel = PIEL[A.piel];
    return '<path d="M33 50 L33 60 Q40 64 47 60 L47 50 Z" fill="' + oscurecer(piel, 0.12) + '" stroke="' + oscurecer(piel, 0.4) + '" stroke-width="0.8"/>' +
      '<path d="M10 80 C 12 64, 24 58, 33 57.5 Q40 66 47 57.5 C 56 58, 68 64, 70 80 Z" fill="url(#' + ids.camisa + ')" stroke="' + oscurecer(CAMISA[A.camisa], 0.5) + '" stroke-width="1.1"/>' +
      '<path d="M33 57.5 Q40 66 47 57.5 L44 70 Q40 72 36 70 Z" fill="rgba(255,255,255,0.14)"/>' +
      '<path d="M18 70 Q22 64 27 62" stroke="rgba(255,255,255,0.18)" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
  }

  function peloAtras(A, cx, rx, ids) {
    const c = PELO[A.colorPelo];
    if (A.pelo === 1) return '<path d="M' + (cx - rx - 3) + ' 60 C ' + (cx - rx - 6) + ' 38, ' + (cx - rx - 2) + ' 12, ' + cx + ' 12 C ' + (cx + rx + 2) + ' 12, ' + (cx + rx + 6) + ' 38, ' + (cx + rx + 3) + ' 60 Z" fill="url(#' + ids.pelo + ')" stroke="' + oscurecer(c, 0.45) + '" stroke-width="1"/>';
    if (A.pelo === 4) return '<ellipse cx="' + (cx + 17) + '" cy="48" rx="6" ry="11" fill="url(#' + ids.pelo + ')" stroke="' + oscurecer(c, 0.45) + '" stroke-width="0.9"/><path d="M' + (cx + 15) + ' 42 q2 8 0 14 M' + (cx + 18.5) + ' 41 q2 8 0 15" stroke="' + aclarar(c, 0.3) + '" stroke-width="0.6" fill="none" opacity="0.7"/>';
    if (A.pelo === 2) return '<g fill="url(#' + ids.pelo + ')" stroke="' + oscurecer(c, 0.45) + '" stroke-width="0.8"><circle cx="' + (cx - 16) + '" cy="34" r="6.5"/><circle cx="' + (cx + 16) + '" cy="34" r="6.5"/><circle cx="' + (cx - 15) + '" cy="44" r="5.5"/><circle cx="' + (cx + 15) + '" cy="44" r="5.5"/></g>';
    return "";
  }

  function mechones(c, d) {
    return '<path d="' + d + '" stroke="' + aclarar(c, 0.35) + '" stroke-width="0.7" fill="none" opacity="0.65" stroke-linecap="round"/>';
  }

  function peloDelante(A, cx, rx, ids) {
    const c = PELO[A.colorPelo];
    const borde = ' stroke="' + oscurecer(c, 0.45) + '" stroke-width="1"';
    const f = ' fill="url(#' + ids.pelo + ')"';
    switch (A.pelo) {
      case 0: return '<path d="M' + (cx - rx - 1) + ' 35 C ' + (cx - rx - 1) + ' 14, ' + (cx + rx + 1) + ' 14, ' + (cx + rx + 1) + ' 35 L ' + (cx + rx - 2) + ' 27 C ' + (cx + 4) + ' 21, ' + (cx - 8) + ' 25, ' + (cx - rx + 2) + ' 29 Z"' + f + borde + "/>" +
        mechones(c, "M" + (cx - 9) + " 19 q4 3 6 7 M" + (cx - 1) + " 17 q4 3 5 7 M" + (cx + 7) + " 18 q3 3 4 7");
      case 1: return '<path d="M' + (cx - rx - 1) + ' 38 C ' + (cx - rx - 1) + ' 14, ' + (cx + rx + 1) + ' 14, ' + (cx + rx + 1) + ' 38 L ' + (cx + rx - 2) + ' 30 C ' + cx + ' 19, ' + (cx - rx + 2) + ' 30, ' + (cx - rx + 2) + ' 30 Z"' + f + borde + "/>" +
        mechones(c, "M" + (cx - 12) + " 20 q-3 10 -3 20 M" + (cx + 12) + " 20 q3 10 3 20 M" + cx + " 16 q-5 4 -8 10");
      case 2: return '<g' + f + borde + '><circle cx="' + (cx - 12) + '" cy="21" r="7"/><circle cx="' + (cx - 4) + '" cy="16" r="7.5"/><circle cx="' + (cx + 5) + '" cy="15" r="8"/><circle cx="' + (cx + 13) + '" cy="21" r="7"/><circle cx="' + (cx - 16) + '" cy="28" r="5.5"/><circle cx="' + (cx + 16) + '" cy="28" r="5.5"/></g>' +
        '<g fill="none" stroke="' + aclarar(c, 0.35) + '" stroke-width="0.6" opacity="0.7"><path d="M' + (cx - 14) + ' 20 a3 3 0 0 1 4 -2"/><path d="M' + (cx - 5) + ' 14 a3 3 0 0 1 4 -2"/><path d="M' + (cx + 4) + ' 13 a3 3 0 0 1 4 -1"/><path d="M' + (cx + 11) + ' 19 a3 3 0 0 1 4 0"/></g>';
      case 3: return '<ellipse cx="' + (cx - 6) + '" cy="21" rx="5" ry="2.4" fill="rgba(255,255,255,0.35)"/>';
      case 4: return '<path d="M' + (cx - rx) + ' 34 C ' + (cx - rx) + ' 14, ' + (cx + rx) + ' 14, ' + (cx + rx) + ' 34 C ' + (cx + 4) + ' 20, ' + (cx - rx + 2) + ' 26, ' + (cx - rx) + ' 34 Z"' + f + borde + "/>" +
        mechones(c, "M" + (cx - 6) + " 18 q6 1 12 4 M" + (cx - 10) + " 21 q8 0 16 4");
      case 5: return '<path d="M' + (cx - rx - 1) + ' 37 C ' + (cx - 10) + ' 12, ' + (cx + 16) + ' 12, ' + (cx + rx + 1) + ' 29 L ' + (cx + 8) + ' 24 C ' + (cx - 6) + ' 18, ' + (cx - rx + 2) + ' 22, ' + (cx - rx + 2) + ' 30 Z"' + f + borde + "/>" +
        mechones(c, "M" + (cx - 10) + " 21 q10 -6 22 2 M" + (cx - 13) + " 26 q8 -6 18 -4");
      case 6: return '<path d="M' + (cx - 18) + ' 30 C ' + (cx - 16) + ' 13, ' + (cx + 16) + ' 13, ' + (cx + 18) + ' 30 Z" fill="url(#' + ids.gorra + ')" stroke="#0b1016" stroke-width="1"/><path d="M' + (cx - 23) + ' 30 Q ' + cx + ' 25 ' + (cx + 23) + ' 30 L ' + (cx + 22) + ' 33 Q ' + cx + ' 29 ' + (cx - 22) + ' 33 Z" fill="#111827" stroke="#05080c" stroke-width="0.8"/><circle cx="' + cx + '" cy="14" r="1.6" fill="#374151"/>';
      case 7: return '<path d="M' + (cx - 17.5) + ' 32 C ' + (cx - 16) + ' 12, ' + (cx + 16) + ' 12, ' + (cx + 17.5) + ' 32 Z" fill="url(#' + ids.gorro + ')" stroke="#6b1a12" stroke-width="1"/><rect x="' + (cx - 18) + '" y="28" width="36" height="5" rx="2.5" fill="#eef5f1" stroke="#b9c4be" stroke-width="0.6"/><circle cx="' + cx + '" cy="12" r="4" fill="#f4f8f6" stroke="#b9c4be" stroke-width="0.6"/>';
    }
    return "";
  }

  function orejasAnimal(A, cx, rx, ids) {
    const piel = PIEL[A.piel];
    const pelo = PELO[A.colorPelo];
    const linea = ' stroke="' + oscurecer(piel, 0.45) + '" stroke-width="1"';
    switch (A.orejas) {
      case 1: { // mono: grandes, redondas, a los lados, con interior claro
        const marron = "#7a4a2a";
        return '<g stroke="#3f2414" stroke-width="1.1"><circle cx="' + (cx - rx - 4) + '" cy="37" r="8.5" fill="' + marron + '"/><circle cx="' + (cx + rx + 4) + '" cy="37" r="8.5" fill="' + marron + '"/></g>' +
          '<circle cx="' + (cx - rx - 3.4) + '" cy="37" r="5.2" fill="url(#' + ids.orejaMono + ')"/><circle cx="' + (cx + rx + 3.4) + '" cy="37" r="5.2" fill="url(#' + ids.orejaMono + ')"/>' +
          '<path d="M' + (cx - rx - 6) + ' 34 q2 -2 4 0 M' + (cx + rx + 2) + ' 34 q2 -2 4 0" stroke="rgba(255,255,255,0.35)" stroke-width="0.8" fill="none"/>';
      }
      case 2: return '<g stroke="' + oscurecer(pelo, 0.45) + '" stroke-width="1"><path d="M23 26 L25 7 L37 18 Z" fill="' + pelo + '"/><path d="M57 26 L55 7 L43 18 Z" fill="' + pelo + '"/></g><path d="M26 21 L26.5 12 L33 18 Z M54 21 L53.5 12 L47 18 Z" fill="#f4a3b4"/>';
      case 3: return '<g stroke="#9aa3a8" stroke-width="1"><ellipse cx="32" cy="9" rx="4.6" ry="13" fill="#f4f6f7" transform="rotate(-10 32 9)"/><ellipse cx="48" cy="9" rx="4.6" ry="13" fill="#f4f6f7" transform="rotate(10 48 9)"/></g><ellipse cx="32" cy="10" rx="2.2" ry="9" fill="#f6b7c4" transform="rotate(-10 32 10)"/><ellipse cx="48" cy="10" rx="2.2" ry="9" fill="#f6b7c4" transform="rotate(10 48 10)"/>';
      case 4: return '<g stroke="#3b2414" stroke-width="1"><circle cx="24" cy="18" r="7" fill="#6b4226"/><circle cx="56" cy="18" r="7" fill="#6b4226"/></g><circle cx="24.5" cy="18.5" r="3.8" fill="#b07a52"/><circle cx="55.5" cy="18.5" r="3.8" fill="#b07a52"/>';
      case 5: return '<path d="M' + (cx - rx + 1) + ' 34 L' + (cx - rx - 11) + ' 26 L' + (cx - rx + 1) + ' 44 Z" fill="url(#' + ids.piel + ')"' + linea + '/><path d="M' + (cx + rx - 1) + ' 34 L' + (cx + rx + 11) + ' 26 L' + (cx + rx - 1) + ' 44 Z" fill="url(#' + ids.piel + ')"' + linea + "/>";
      case 6: return '<g stroke="#4a2c17" stroke-width="1"><path d="M' + (cx - rx + 2) + ' 24 C ' + (cx - rx - 10) + ' 24, ' + (cx - rx - 10) + ' 46, ' + (cx - rx - 3) + ' 50 C ' + (cx - rx + 1) + ' 44, ' + (cx - rx + 2) + ' 34, ' + (cx - rx + 2) + ' 24 Z" fill="#8a5a36"/><path d="M' + (cx + rx - 2) + ' 24 C ' + (cx + rx + 10) + ' 24, ' + (cx + rx + 10) + ' 46, ' + (cx + rx + 3) + ' 50 C ' + (cx + rx - 1) + ' 44, ' + (cx + rx - 2) + ' 34, ' + (cx + rx - 2) + ' 24 Z" fill="#8a5a36"/></g>';
    }
    return "";
  }

  function marcasSVG(A) {
    switch (A.marcas) {
      case 1: { // cara con granos: rojos, con halo rosado y punto de brillo
        const pts = [[27, 43, 1.5], [52, 44, 1.6], [30, 25, 1.2], [47, 23, 1.3], [40, 21, 1.1], [35, 52, 1.2], [46, 52, 1.0], [24, 37, 1.1], [56, 38, 1.2], [43, 42, 0.9]];
        return pts.map(function (p) {
          return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (p[2] + 1.3) + '" fill="#e8838a" opacity="0.45"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + p[2] + '" fill="#d6404e" stroke="#9c2633" stroke-width="0.35"/><circle cx="' + (p[0] - p[2] * 0.35) + '" cy="' + (p[1] - p[2] * 0.4) + '" r="' + (p[2] * 0.35) + '" fill="#ffe3e3"/>';
        }).join("");
      }
      case 2: return '<g fill="#a0612f" opacity="0.75">' + [[30, 42], [33, 44], [28, 45], [50, 42], [47, 44], [52, 45], [37, 40], [43, 40], [40, 42]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="0.75"/>'; }).join("") + "</g>";
      case 3: return '<ellipse cx="28" cy="44" rx="5" ry="3" fill="#ff7a8a" opacity="0.45"/><ellipse cx="52" cy="44" rx="5" ry="3" fill="#ff7a8a" opacity="0.45"/>';
      case 4: return '<path d="M47 27 L53 45" stroke="#8a3b3b" stroke-width="1.4" stroke-linecap="round"/><path d="M47.5 31 l3 -1 M49 36 l3 -1 M50.5 41 l3 -1" stroke="#8a3b3b" stroke-width="0.9" stroke-linecap="round"/>';
      case 5: return '<g stroke-linecap="round"><path d="M24 42 L33 44 M24 46 L33 48" stroke="#c0392b" stroke-width="2"/><path d="M47 44 L56 42 M47 48 L56 46" stroke="#f2f2f2" stroke-width="2"/></g>';
    }
    return "";
  }

  function cejasSVG(A) {
    const c = oscurecer(PELO[A.colorPelo], 0.25);
    const p = ' fill="none" stroke-linecap="round" stroke="' + c + '"';
    if (A.cejas === 1) return '<path d="M25 30.5 q7 -4.5 13 1"' + p + ' stroke-width="2.6"/><path d="M42 31.5 q6 -5 13 -1"' + p + ' stroke-width="2.6"/>';
    if (A.cejas === 2) return '<path d="M27 31 q6 -2 11 0"' + p + ' stroke-width="1.1"/><path d="M42 31 q6 -2 11 0"' + p + ' stroke-width="1.1"/>';
    if (A.cejas === 3) return '<path d="M26 32 q6 -6.5 12 -1.5"' + p + ' stroke-width="1.8"/><path d="M42 30.5 q6 -6.5 12 -1"' + p + ' stroke-width="1.8"/>';
    return '<path d="M26 30.5 q6 -3.5 12 0"' + p + ' stroke-width="1.8"/><path d="M42 30.5 q6 -3.5 12 0"' + p + ' stroke-width="1.8"/>';
  }

  function ojosSVG(A) {
    const iris = IRIS[A.colorOjos];
    if (A.ojos === 2) return '<path d="M28.5 36.5 q3.5 3 7 0" stroke="#2a1a10" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M44.5 36.5 q3.5 3 7 0" stroke="#2a1a10" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M29 38.5 l-1 1.2 M51 38.5 l1 1.2" stroke="#2a1a10" stroke-width="0.7"/>';
    if (A.ojos === 1) return ojo(32, 36, iris, 1.05) + ojo(48, 36, iris, 1.05) + '<path d="M28.5 40 q3.5 1.8 7 0 M44.5 40 q3.5 1.8 7 0" stroke="rgba(120,60,40,0.45)" stroke-width="0.8" fill="none"/>';
    if (A.ojos === 3) return ojo(32, 36, iris, 1, 0.7) + '<path d="M44 37 q4 -1.2 8 0" stroke="#2a1a10" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
    return ojo(32, 36, iris) + ojo(48, 36, iris);
  }

  function narizSVG(A) {
    const piel = PIEL[A.piel];
    return '<path d="M40 38 Q38 44 36.8 45.2 Q39 46.6 41.8 45.6" stroke="' + oscurecer(piel, 0.35) + '" stroke-width="0.9" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="41" cy="41" rx="1" ry="2.2" fill="rgba(255,255,255,0.28)"/>';
  }

  function bocaSVG(A) {
    const labio = "#b24a3d";
    if (A.boca === 1) return '<path d="M32 47 q8 9 16 0 q-8 3.5 -16 0" fill="#7a2420" stroke="#5e1a16" stroke-width="0.7"/><path d="M34 47.6 q6 2.4 12 0 l-0.6 1.6 q-5.4 1.8 -10.8 0 Z" fill="#fff"/><path d="M36.5 52 q3.5 1.6 7 0" stroke="#e46b6b" stroke-width="1.1" fill="none"/>';
    if (A.boca === 2) return '<path d="M33.5 49 h13" stroke="' + labio + '" stroke-width="1.8" stroke-linecap="round"/>';
    if (A.boca === 3) return '<ellipse cx="40" cy="49.5" rx="4.2" ry="3.6" fill="#6b1f1f" stroke="' + labio + '" stroke-width="1"/><ellipse cx="40" cy="51" rx="2.2" ry="1.3" fill="#d45f5f"/>';
    if (A.boca === 4) return '<path d="M33 47 q4 5 8 0" stroke="' + labio + '" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M44 47 q4 2 7 0" stroke="' + labio + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
    return '<path d="M33 47 q7 6.5 14 0" stroke="' + labio + '" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M36 50.4 q4 1.2 8 0" stroke="rgba(255,255,255,0.25)" stroke-width="0.8" fill="none"/>';
  }

  function barbaSVG(A, cx) {
    const c = PELO[A.colorPelo];
    const o = oscurecer(c, 0.45);
    switch (A.barba) {
      case 1: return '<ellipse cx="40" cy="51" rx="13" ry="8.5" fill="' + c + '" opacity="0.28"/>';
      case 2: return '<path d="M' + (cx - 14) + ' 44 C ' + (cx - 15) + ' 63, ' + (cx + 15) + ' 63, ' + (cx + 14) + ' 44 C ' + (cx + 9) + ' 51, ' + (cx - 9) + ' 51, ' + (cx - 14) + ' 44 Z" fill="' + c + '" stroke="' + o + '" stroke-width="0.9"/>' + mechones(c, "M34 53 q1 4 2 6 M40 54 v6 M46 53 q-1 4 -2 6");
      case 3: return '<path d="M30.5 47.5 q4.5 -3 9.5 -0.5 q5 -2.5 9.5 0.5 q-4.5 2 -9.5 0.2 q-5 1.8 -9.5 -0.2 Z" fill="' + c + '" stroke="' + o + '" stroke-width="0.7"/>';
      case 4: return '<path d="M36 51 C 36 59, 44 59, 44 51 Q 40 54 36 51" fill="' + c + '" stroke="' + o + '" stroke-width="0.7"/>';
      case 5: return '<path d="M40 46.5 q-5 -2 -9 1 q-3 1 -4 -2.5 q-1 4 3 5 q5 0.5 10 -1.3 q5 1.8 10 1.3 q4 -1 3 -5 q-1 3.5 -4 2.5 q-4 -3 -9 -1 Z" fill="' + c + '" stroke="' + o + '" stroke-width="0.7"/>';
      case 6: return '<path d="M28 49 q2 -5 12 -3.5 q10 -1.5 12 3.5 q-3 3 -6 1.5 q-3 -1.5 -6 0 q-3 -1.5 -6 0 q-3 1.5 -6 -1.5 Z" fill="' + c + '" stroke="' + o + '" stroke-width="0.9"/>' + mechones(c, "M33 47.5 q2 1.5 4 2 M43 49.5 q2 -0.5 4 -2");
    }
    return "";
  }

  function mascaraSVG(A, cx, rx, ids) {
    switch (A.mascara) {
      case 1: return '<path fill-rule="evenodd" d="M23 36 Q24 29 32 30 Q38 31 40 33 Q42 31 48 30 Q56 29 57 36 Q56 42 48 42 Q43 42 40 39 Q37 42 32 42 Q24 42 23 36 Z M28 36 a4 3.6 0 1 0 8 0 a4 3.6 0 1 0 -8 0 Z M44 36 a4 3.6 0 1 0 8 0 a4 3.6 0 1 0 -8 0 Z" fill="#14141a" stroke="#000" stroke-width="0.8"/><path d="M25 33 q4 -3 9 -2" stroke="rgba(255,255,255,0.3)" stroke-width="0.8" fill="none"/>';
      case 2: return '<path d="M' + (cx - rx + 1) + ' 27 L' + (cx + rx - 1) + ' 31" stroke="#111" stroke-width="1.3"/><ellipse cx="48" cy="36.5" rx="5.6" ry="5" fill="#141414" stroke="#000" stroke-width="0.8"/><path d="M45 34 q2 -1.5 5 -0.5" stroke="rgba(255,255,255,0.3)" stroke-width="0.7" fill="none"/>';
      case 3: return '<path fill-rule="evenodd" d="M' + (cx - rx) + ' 40 C ' + (cx - rx) + ' 14, ' + (cx + rx) + ' 14, ' + (cx + rx) + ' 40 C ' + (cx + rx) + ' 47, ' + (cx + 8) + ' 46, ' + (cx + 4) + ' 45 L ' + (cx - 4) + ' 45 C ' + (cx - 8) + ' 46, ' + (cx - rx) + ' 47, ' + (cx - rx) + ' 40 Z M27 36 Q32 30 37 36 Q32 40 27 36 Z M43 36 Q48 30 53 36 Q48 40 43 36 Z" fill="url(#' + ids.luchador + ')" stroke="#5c0d0d" stroke-width="1"/>' +
        '<path d="M27 36 Q32 29 37 36 M43 36 Q48 29 53 36" stroke="url(#' + ids.oro + ')" stroke-width="1.4" fill="none"/><path d="M40 18 V30" stroke="url(#' + ids.oro + ')" stroke-width="1.6"/>';
      case 4: return '<circle cx="40" cy="43" r="4.4" fill="url(#' + ids.payaso + ')" stroke="#8e1010" stroke-width="0.7"/><circle cx="38.6" cy="41.6" r="1.2" fill="#fff" opacity="0.85"/>';
      case 5: return '<path d="M' + (cx - rx + 1) + ' 44 Q40 41 ' + (cx + rx - 1) + ' 44 L' + (cx + rx - 3) + ' 52 Q40 58 ' + (cx - rx + 3) + ' 52 Z" fill="#a9d3ee" stroke="#5f93b5" stroke-width="0.9"/><path d="M27 47 h26 M28 50 h24" stroke="#86b7d8" stroke-width="0.6"/><path d="M' + (cx - rx + 1) + ' 44 L' + (cx - rx - 2) + ' 38 M' + (cx + rx - 1) + ' 44 L' + (cx + rx + 2) + ' 38" stroke="#e8eef2" stroke-width="0.9"/>';
    }
    return "";
  }

  function lentesSVG(A, ids) {
    switch (A.lentes) {
      case 1: return '<g fill="rgba(200,230,255,0.18)" stroke="#20242a" stroke-width="1.4"><circle cx="32" cy="36.5" r="6"/><circle cx="48" cy="36.5" r="6"/></g><path d="M38 36.5 h4 M26 35.5 l-3 -1 M54 35.5 l3 -1" stroke="#20242a" stroke-width="1.3"/><path d="M28.5 33.5 l3 -1.5 M44.5 33.5 l3 -1.5" stroke="rgba(255,255,255,0.6)" stroke-width="0.8"/>';
      case 2: return '<g stroke="#050505" stroke-width="1"><rect x="25" y="31.5" width="14" height="10" rx="3.2" fill="url(#' + ids.sol + ')"/><rect x="41" y="31.5" width="14" height="10" rx="3.2" fill="url(#' + ids.sol + ')"/></g><path d="M39 35.5 h2" stroke="#111" stroke-width="1.6"/><path d="M27 34 l5 -1.5 M43 34 l5 -1.5" stroke="rgba(255,255,255,0.55)" stroke-width="1"/>';
      case 3: return '<g fill="rgba(255,214,120,0.18)" stroke="url(#' + ids.oro + ')" stroke-width="2"><circle cx="32" cy="36.5" r="6.2"/><circle cx="48" cy="36.5" r="6.2"/></g><path d="M38.2 36 q1.8 -1.6 3.6 0" stroke="url(#' + ids.oro + ')" stroke-width="1.6" fill="none"/><path d="M25.8 35 l-3 -1 M54.2 35 l3 -1" stroke="#b8860b" stroke-width="1.3"/><path d="M28 33 l3 -1.6 M44 33 l3 -1.6" stroke="rgba(255,255,255,0.75)" stroke-width="0.8"/><circle cx="26.5" cy="33" r="0.8" fill="#fff8d6"/>';
      case 4: return '<circle cx="48" cy="36.5" r="6.2" fill="rgba(220,240,255,0.15)" stroke="url(#' + ids.oro + ')" stroke-width="1.8"/><path d="M53 40 q4 6 1 14 q-2 4 -6 6" stroke="#c9a227" stroke-width="0.8" fill="none" stroke-dasharray="1.2 0.8"/><path d="M44.5 33.5 l3 -1.5" stroke="rgba(255,255,255,0.7)" stroke-width="0.8"/>';
      case 5: return '<g fill="#ff4d8d" stroke="#a3124a" stroke-width="1"><path d="M32 42 L25.8 35.6 a3.4 3.4 0 0 1 6.2 -3.3 a3.4 3.4 0 0 1 6.2 3.3 Z"/><path d="M48 42 L41.8 35.6 a3.4 3.4 0 0 1 6.2 -3.3 a3.4 3.4 0 0 1 6.2 3.3 Z"/></g><path d="M38 36 h4" stroke="#a3124a" stroke-width="1.2"/><circle cx="28.5" cy="34.4" r="0.9" fill="#fff" opacity="0.8"/><circle cx="44.5" cy="34.4" r="0.9" fill="#fff" opacity="0.8"/>';
      case 6: {
        function estrella(x, y) {
          let d = "";
          for (let i = 0; i < 10; i++) {
            const r = i % 2 ? 3 : 7;
            const a = -Math.PI / 2 + i * Math.PI / 5;
            d += (i ? "L" : "M") + (x + Math.cos(a) * r).toFixed(1) + " " + (y + Math.sin(a) * r).toFixed(1);
          }
          return '<path d="' + d + 'Z"/>';
        }
        return '<g fill="url(#' + ids.oro + ')" stroke="#a0740a" stroke-width="0.9">' + estrella(32, 37) + estrella(48, 37) + '</g><path d="M38.5 36.5 h3" stroke="#a0740a" stroke-width="1.1"/>';
      }
    }
    return "";
  }

  function aretesSVG(A, cx, rx, ids) {
    const x1 = cx - rx, x2 = cx + rx;
    if (A.aretes === 1) return '<circle cx="' + x1 + '" cy="45" r="2" fill="url(#' + ids.oro + ')"/><circle cx="' + x2 + '" cy="45" r="2" fill="url(#' + ids.oro + ')"/>';
    if (A.aretes === 2) return '<circle cx="' + x1 + '" cy="47" r="3.4" fill="none" stroke="url(#' + ids.oro + ')" stroke-width="1.4"/><circle cx="' + x2 + '" cy="47" r="3.4" fill="none" stroke="url(#' + ids.oro + ')" stroke-width="1.4"/>';
    if (A.aretes === 3) return '<circle cx="' + x1 + '" cy="46" r="2.3" fill="url(#' + ids.perla + ')" stroke="#c9c2b8" stroke-width="0.4"/><circle cx="' + x2 + '" cy="46" r="2.3" fill="url(#' + ids.perla + ')" stroke="#c9c2b8" stroke-width="0.4"/>';
    return "";
  }

  function sombreroSVG(A, cx, ids) {
    const oro = "url(#" + ids.oro + ")";
    switch (A.sombrero) {
      case 1: return '<path d="M25 22 L23 7 L31.5 14 L40 4 L48.5 14 L57 7 L55 22 Z" fill="' + oro + '" stroke="#8a6100" stroke-width="1"/><rect x="25" y="19" width="30" height="5" rx="1.5" fill="' + oro + '" stroke="#8a6100" stroke-width="0.8"/>' +
        '<circle cx="40" cy="21.5" r="1.8" fill="#d62839" stroke="#7a0f1c" stroke-width="0.5"/><circle cx="31" cy="21.5" r="1.3" fill="#2b6cd6"/><circle cx="49" cy="21.5" r="1.3" fill="#2b6cd6"/><circle cx="23" cy="7" r="1.4" fill="#fff4c2"/><circle cx="40" cy="4" r="1.6" fill="#fff4c2"/><circle cx="57" cy="7" r="1.4" fill="#fff4c2"/><path d="M28 18 L30 11" stroke="rgba(255,255,255,0.6)" stroke-width="0.8"/>';
      case 2: return '<rect x="28" y="0" width="24" height="20" rx="1.5" fill="url(#' + ids.negro + ')" stroke="#000" stroke-width="1"/><rect x="28" y="14" width="24" height="4" fill="#9b1c1c"/><ellipse cx="40" cy="20.5" rx="19" ry="3.6" fill="#15151a" stroke="#000" stroke-width="0.9"/><path d="M31 2 v11" stroke="rgba(255,255,255,0.2)" stroke-width="1.6"/>';
      case 3: return '<path d="M29 18 Q30 5 40 7 Q50 5 51 18 Z" fill="url(#' + ids.cuero + ')" stroke="#4a2a0f" stroke-width="1"/><path d="M33 9 q7 4 14 0" stroke="#4a2a0f" stroke-width="0.8" fill="none"/><path d="M12 19 Q40 30 68 19 Q60 15 52 17 Q40 21 28 17 Q20 15 12 19 Z" fill="url(#' + ids.cuero + ')" stroke="#4a2a0f" stroke-width="1"/><rect x="29" y="15" width="22" height="3" fill="#2a1a0c"/>';
      case 4: return '<path d="M14 22 Q20 6 40 6 Q60 6 66 22 Q52 16 40 18 Q28 16 14 22 Z" fill="#17171c" stroke="#000" stroke-width="1"/><path d="M14 22 Q40 14 66 22" stroke="url(#' + ids.oro + ')" stroke-width="1.2" fill="none"/><circle cx="40" cy="12" r="2.6" fill="#f2f2f2"/><path d="M38.4 15 h3.2 M37.6 13.6 l4.8 2.8 M42.4 13.6 l-4.8 2.8" stroke="#f2f2f2" stroke-width="0.6"/>';
      case 5: return '<path d="M25 21 L45 -1 L55 21 Z" fill="url(#' + ids.mago + ')" stroke="#22104a" stroke-width="1"/><ellipse cx="40" cy="21" rx="19" ry="3.6" fill="#3b1d78" stroke="#22104a" stroke-width="0.9"/>' +
        '<path d="M38 12 l1 2 2 .3 -1.5 1.4 .4 2 -1.9 -1 -1.9 1 .4 -2 -1.5 -1.4 2 -.3 Z" fill="#ffd54a"/><circle cx="46" cy="9" r="1" fill="#ffd54a"/><circle cx="33" cy="17" r="0.8" fill="#ffd54a"/>';
      case 6: return '<g transform="rotate(12 44 12)"><path d="M36 21 L44 0 L52 21 Z" fill="#ff5d8f" stroke="#a3124a" stroke-width="0.9"/><path d="M39.5 12 L48.5 12 M38 16.5 L50 16.5 M41.5 7 L46.5 7" stroke="#ffe066" stroke-width="2"/><circle cx="44" cy="0" r="2.6" fill="#4dd0e1" stroke="#1b8a99" stroke-width="0.6"/></g>';
      case 7: return '<g fill="#fbfbfb" stroke="#c9cfd3" stroke-width="0.9"><circle cx="32" cy="10" r="7"/><circle cx="40" cy="7" r="8"/><circle cx="48" cy="10" r="7"/></g><rect x="27" y="13" width="26" height="9" rx="1.5" fill="#f4f6f7" stroke="#c9cfd3" stroke-width="0.9"/><path d="M33 14 v7 M40 14 v7 M47 14 v7" stroke="#dde3e6" stroke-width="0.8"/>';
      case 8: return '<path d="M22 24 Q22 8 40 8 Q58 8 58 24 Z" fill="url(#' + ids.metal + ')" stroke="#4b5563" stroke-width="1"/><path d="M22 24 h36" stroke="#8b6914" stroke-width="2.4"/><circle cx="30" cy="23.8" r="0.8" fill="#e5e7eb"/><circle cx="40" cy="23.8" r="0.8" fill="#e5e7eb"/><circle cx="50" cy="23.8" r="0.8" fill="#e5e7eb"/>' +
        '<path d="M23 17 Q14 14 12 3 Q18 10 25 12 Z" fill="#f4ecd8" stroke="#a89a7a" stroke-width="0.9"/><path d="M57 17 Q66 14 68 3 Q62 10 55 12 Z" fill="#f4ecd8" stroke="#a89a7a" stroke-width="0.9"/><path d="M40 9 v15" stroke="#6b7280" stroke-width="1.2"/>';
      case 9: return '<ellipse cx="40" cy="7" rx="13" ry="3.4" fill="none" stroke="#fff6c8" stroke-width="4" opacity="0.35"/><ellipse cx="40" cy="7" rx="13" ry="3.4" fill="none" stroke="' + oro + '" stroke-width="2.2"/>';
      case 10: return '<ellipse cx="40" cy="17" rx="14" ry="3" fill="#2a1f1a" stroke="#0e0906" stroke-width="0.9"/><path d="M31 17 Q31 4 40 4 Q49 4 49 17 Z" fill="url(#' + ids.bombin + ')" stroke="#0e0906" stroke-width="1"/><path d="M31.5 14.5 h17" stroke="#7a1f2b" stroke-width="2"/><path d="M34 8 q3 -3 7 -3" stroke="rgba(255,255,255,0.25)" stroke-width="1" fill="none"/>';
      case 11: return '<path d="M21 28 Q20 8 40 7 Q60 8 59 28 Z" fill="#c0392b" stroke="#6e1a12" stroke-width="1"/><path d="M22 14 h36 M21.5 20 h37" stroke="#f1c40f" stroke-width="2.4"/><path d="M22 17 h36" stroke="#1e8449" stroke-width="1.6"/><path d="M24 23.5 l3 -3 3 3 3 -3 3 3 3 -3 3 3 3 -3 3 3 3 -3 3 3 3 -3" stroke="#fff" stroke-width="0.9" fill="none"/>' +
        '<path d="M21 26 L19 40 Q21 42 24 40 L25 28 Z M59 26 L61 40 Q59 42 56 40 L55 28 Z" fill="#c0392b" stroke="#6e1a12" stroke-width="0.9"/><path d="M20 40 v6 M60 40 v6" stroke="#f1c40f" stroke-width="1.4"/><circle cx="40" cy="6" r="3.2" fill="#f1c40f" stroke="#a37d07" stroke-width="0.7"/>';
    }
    return "";
  }

  /* ---------- Cabezas especiales (reemplazan la cara humana) ---------- */
  function cabezaEspecial(A, ids) {
    const iris = IRIS[A.colorOjos];
    switch (A.cabeza) {
      case 1: { // cabeza de pez: escamas, aletas, ojo grande, boca redonda
        let escamas = "";
        for (let fila = 0; fila < 4; fila++) {
          for (let k = 0; k < 6; k++) {
            const x = 26 + k * 6 + (fila % 2) * 3;
            const y = 24 + fila * 6;
            if (Math.hypot((x - 42) / 21, (y - 36) / 17) < 0.92) escamas += '<path d="M' + (x - 3) + " " + y + " a3 3 0 0 0 6 0" + '"/>';
          }
        }
        return '<path d="M42 16 L48 4 L58 10 L56 20 Z" fill="url(#' + ids.aleta + ')" stroke="#9a3b0b" stroke-width="1"/>' +
          '<path d="M60 36 L72 26 L70 48 Z" fill="url(#' + ids.aleta + ')" stroke="#9a3b0b" stroke-width="1"/>' +
          '<ellipse cx="41" cy="36" rx="23" ry="19" fill="url(#' + ids.pez + ')" stroke="#9a3b0b" stroke-width="1.4"/>' +
          '<g fill="none" stroke="#c4520f" stroke-width="0.8" opacity="0.75">' + escamas + "</g>" +
          '<path d="M30 22 Q24 36 30 50" stroke="#b3470c" stroke-width="1.3" fill="none"/><path d="M33 23 Q28 36 33 49" stroke="rgba(255,255,255,0.35)" stroke-width="0.8" fill="none"/>' +
          '<path d="M44 48 L50 58 L56 47 Z" fill="url(#' + ids.aleta + ')" stroke="#9a3b0b" stroke-width="0.9"/>' +
          '<ellipse cx="34" cy="28" rx="9" ry="4" fill="rgba(255,255,255,0.28)"/>' +
          ojo(23, 31, iris, 1.55, -0.6) +
          '<ellipse cx="18.5" cy="43" rx="3.4" ry="3" fill="#7a1d1d" stroke="#d95a5a" stroke-width="1.6"/><circle cx="12" cy="36" r="1.4" fill="#cfefff" stroke="#7fb8d6" stroke-width="0.5"/><circle cx="9" cy="30" r="1" fill="#cfefff" stroke="#7fb8d6" stroke-width="0.4"/>';
      }
      case 2: return '<ellipse cx="40" cy="40" rx="22" ry="16" fill="url(#' + ids.rana + ')" stroke="#1d5e20" stroke-width="1.3"/>' +
        '<circle cx="29" cy="25" r="8" fill="url(#' + ids.rana + ')" stroke="#1d5e20" stroke-width="1.2"/><circle cx="51" cy="25" r="8" fill="url(#' + ids.rana + ')" stroke="#1d5e20" stroke-width="1.2"/>' +
        ojo(29, 25, "#c9a227", 1.3) + ojo(51, 25, "#c9a227", 1.3) +
        '<path d="M24 44 Q40 56 56 44" stroke="#1d5e20" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="36" cy="38" r="0.9" fill="#1d5e20"/><circle cx="44" cy="38" r="0.9" fill="#1d5e20"/><ellipse cx="27" cy="44" rx="3.2" ry="2" fill="#ff8aa0" opacity="0.5"/><ellipse cx="53" cy="44" rx="3.2" ry="2" fill="#ff8aa0" opacity="0.5"/>';
      case 3: return '<path d="M40 14 V6" stroke="#6b7280" stroke-width="1.6"/><circle cx="40" cy="5" r="2.6" fill="#ef4444" stroke="#7f1d1d" stroke-width="0.6"/><circle cx="39.2" cy="4.2" r="0.8" fill="#fff"/>' +
        '<rect x="21" y="14" width="38" height="40" rx="7" fill="url(#' + ids.metal + ')" stroke="#374151" stroke-width="1.4"/>' +
        '<rect x="25" y="26" width="30" height="11" rx="5.5" fill="#0f172a" stroke="#1f2937" stroke-width="0.8"/><circle cx="32" cy="31.5" r="3.4" fill="#22d3ee"/><circle cx="48" cy="31.5" r="3.4" fill="#22d3ee"/><circle cx="31" cy="30.5" r="1" fill="#e0fdff"/><circle cx="47" cy="30.5" r="1" fill="#e0fdff"/>' +
        '<rect x="29" y="42" width="22" height="7" rx="1.5" fill="#1f2937"/><path d="M33 42 v7 M37 42 v7 M41 42 v7 M45 42 v7" stroke="#9ca3af" stroke-width="0.8"/>' +
        '<circle cx="24.5" cy="17.5" r="1" fill="#9ca3af"/><circle cx="55.5" cy="17.5" r="1" fill="#9ca3af"/><circle cx="24.5" cy="50.5" r="1" fill="#9ca3af"/><circle cx="55.5" cy="50.5" r="1" fill="#9ca3af"/><rect x="17" y="28" width="4" height="10" rx="1.5" fill="#6b7280"/><rect x="59" y="28" width="4" height="10" rx="1.5" fill="#6b7280"/><path d="M24 17 h18" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>';
      case 4: return '<path d="M40 13 C 24 13, 19 25, 20 35 C 21 42, 26 45, 29 46 L 29 53 L 51 53 L 51 46 C 54 45, 59 42, 60 35 C 61 25, 56 13, 40 13 Z" fill="url(#' + ids.hueso + ')" stroke="#6b6458" stroke-width="1.3"/>' +
        '<ellipse cx="32" cy="33" rx="5.6" ry="6" fill="#1b1714"/><ellipse cx="48" cy="33" rx="5.6" ry="6" fill="#1b1714"/><circle cx="33" cy="33" r="1.4" fill="#ffb347" opacity="0.85"/><circle cx="49" cy="33" r="1.4" fill="#ffb347" opacity="0.85"/>' +
        '<path d="M40 38 L37 44 L43 44 Z" fill="#1b1714"/><path d="M31 48 h18 M34 46 v7 M38 46 v7 M42 46 v7 M46 46 v7" stroke="#6b6458" stroke-width="0.9"/><path d="M28 19 q6 -4 13 -4" stroke="rgba(255,255,255,0.55)" stroke-width="1.2" fill="none"/>';
      case 5: return '<path d="M40 11 C 18 11, 16 30, 22 40 C 27 49, 34 56, 40 56 C 46 56, 53 49, 58 40 C 64 30, 62 11, 40 11 Z" fill="url(#' + ids.alien + ')" stroke="#2f6b2a" stroke-width="1.3"/>' +
        '<path d="M24 32 C 26 26, 35 27, 37 36 C 33 40, 26 39, 24 32 Z" fill="#0a0a0a"/><path d="M56 32 C 54 26, 45 27, 43 36 C 47 40, 54 39, 56 32 Z" fill="#0a0a0a"/>' +
        '<ellipse cx="29" cy="31" rx="2" ry="1.3" fill="#fff" opacity="0.85"/><ellipse cx="51" cy="31" rx="2" ry="1.3" fill="#fff" opacity="0.85"/><path d="M36 48 q4 2 8 0" stroke="#2f6b2a" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M30 16 q8 -4 18 -1" stroke="rgba(255,255,255,0.45)" stroke-width="1.2" fill="none"/>';
    }
    return "";
  }

  function construir(a) {
    const P = "§"; // se reemplaza por un prefijo único en cada dibujo
    const ids = {};
    ["fondo", "piel", "pelo", "camisa", "oro", "sol", "metal", "negro", "cuero", "mago", "bombin", "gorra", "gorro", "luchador", "payaso", "perla", "orejaMono", "pez", "aleta", "rana", "hueso", "alien"].forEach(function (k) { ids[k] = P + k; });

    const piel = PIEL[a.piel];
    const peloC = PELO[a.colorPelo];
    const camisa = CAMISA[a.camisa];
    const fondo = FONDO[a.fondo];
    const cx = 40, cy = 36;
    let rx = 18, ry = 21;
    if (a.cara === 0) { rx = 20; ry = 19; }
    if (a.cara === 2) { rx = 17.5; ry = 21; }
    const humana = a.cabeza === 0;

    // Solo se definen los degradados que se usan (más liviano)
    let defs = radial(ids.fondo, "50%", "38%", "62%", [["0", aclarar(fondo, 0.22)], ["0.7", fondo], ["1", oscurecer(fondo, 0.35)]]) +
      lineal(ids.camisa, "0", "0", "0", "1", [["0", aclarar(camisa, 0.18)], ["1", oscurecer(camisa, 0.3)]]) +
      lineal(ids.oro, "0", "0", "1", "1", [["0", "#fff6c8"], ["0.35", "#f2c14e"], ["0.65", "#b8860b"], ["1", "#ffe08a"]]);
    if (humana) {
      defs += radial(ids.piel, "42%", "36%", "68%", [["0", aclarar(piel, 0.22)], ["0.65", piel], ["1", oscurecer(piel, 0.18)]]) +
        lineal(ids.pelo, "0", "0", "0", "1", [["0", aclarar(peloC, 0.22)], ["0.55", peloC], ["1", oscurecer(peloC, 0.3)]]);
    }
    if (a.lentes === 2) defs += lineal(ids.sol, "0", "0", "0", "1", [["0", "#3a4a5a"], ["1", "#05070a"]]);
    if (a.cabeza === 3 || a.sombrero === 8) defs += lineal(ids.metal, "0", "0", "1", "1", [["0", "#e5e7eb"], ["0.45", "#9ca3af"], ["0.7", "#6b7280"], ["1", "#d1d5db"]]);
    if (a.sombrero === 2) defs += lineal(ids.negro, "0", "0", "1", "0", [["0", "#2a2a33"], ["0.5", "#111116"], ["1", "#2a2a33"]]);
    if (a.sombrero === 3) defs += lineal(ids.cuero, "0", "0", "0", "1", [["0", "#b07a3c"], ["1", "#6b4218"]]);
    if (a.sombrero === 5) defs += lineal(ids.mago, "0", "0", "1", "1", [["0", "#7b4dd6"], ["1", "#2e1665"]]);
    if (a.sombrero === 10) defs += lineal(ids.bombin, "0", "0", "1", "1", [["0", "#5a463a"], ["1", "#1d1410"]]);
    if (a.pelo === 6) defs += lineal(ids.gorra, "0", "0", "0", "1", [["0", "#3b4654"], ["1", "#141a22"]]);
    if (a.pelo === 7) defs += lineal(ids.gorro, "0", "0", "0", "1", [["0", "#e05a4a"], ["1", "#8e2318"]]);
    if (a.mascara === 3) defs += lineal(ids.luchador, "0", "0", "0", "1", [["0", "#e53935"], ["1", "#8e0f0f"]]);
    if (a.mascara === 4) defs += radial(ids.payaso, "35%", "35%", "70%", [["0", "#ff8080"], ["1", "#c41212"]]);
    if (a.aretes === 3) defs += radial(ids.perla, "35%", "35%", "70%", [["0", "#ffffff"], ["1", "#d9d2c5"]]);
    if (a.orejas === 1) defs += radial(ids.orejaMono, "50%", "45%", "60%", [["0", "#f2c7a5"], ["1", "#c98b62"]]);
    if (a.cabeza === 1) defs += radial(ids.pez, "40%", "35%", "70%", [["0", "#ffc27a"], ["0.6", "#ff8c2a"], ["1", "#d9590c"]]) + lineal(ids.aleta, "0", "0", "1", "1", [["0", "#ffb04d"], ["1", "#e0601b"]]);
    if (a.cabeza === 2) defs += radial(ids.rana, "40%", "35%", "70%", [["0", "#9be36d"], ["1", "#3f9a2c"]]);
    if (a.cabeza === 4) defs += radial(ids.hueso, "42%", "35%", "70%", [["0", "#fffdf5"], ["1", "#cfc6b1"]]);
    if (a.cabeza === 5) defs += radial(ids.alien, "45%", "35%", "70%", [["0", "#b8f5a0"], ["1", "#4caf50"]]);

    let s = "<defs>" + defs + "</defs>";
    // Fondo con luz de borde y sombra suave
    s += '<circle cx="40" cy="40" r="40" fill="url(#' + ids.fondo + ')"/>' +
      '<circle cx="40" cy="40" r="38.6" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1.4"/>' +
      '<ellipse cx="40" cy="60" rx="20" ry="5" fill="rgba(0,0,0,0.28)"/>';
    s += cuerpoSVG(a, ids);

    if (humana) {
      s += peloAtras(a, cx, rx, ids);
      s += orejasAnimal(a, cx, rx, ids);
      if (a.orejas !== 1 && a.orejas !== 5) {
        s += '<ellipse cx="' + (cx - rx + 1) + '" cy="38" rx="3.4" ry="5.2" fill="url(#' + ids.piel + ')" stroke="' + oscurecer(piel, 0.4) + '" stroke-width="0.9"/><ellipse cx="' + (cx + rx - 1) + '" cy="38" rx="3.4" ry="5.2" fill="url(#' + ids.piel + ')" stroke="' + oscurecer(piel, 0.4) + '" stroke-width="0.9"/>';
      }
      // Cara: degradado, contorno y sombra bajo la mandíbula
      s += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="url(#' + ids.piel + ')" stroke="' + oscurecer(piel, 0.42) + '" stroke-width="1.2"/>';
      s += '<path d="M' + (cx - rx + 4) + " " + (cy + 10) + " Q" + cx + " " + (cy + ry + 3) + " " + (cx + rx - 4) + " " + (cy + 10) + '" stroke="' + oscurecer(piel, 0.15) + '" stroke-width="2" fill="none" opacity="0.4"/>';
      s += '<ellipse cx="' + (cx - 6) + '" cy="' + (cy - 10) + '" rx="7" ry="4" fill="rgba(255,255,255,0.16)"/>';
      s += marcasSVG(a) + cejasSVG(a) + ojosSVG(a) + narizSVG(a) + bocaSVG(a) + barbaSVG(a, cx) + mascaraSVG(a, cx, rx, ids);
      if (!(a.sombrero && (a.pelo === 6 || a.pelo === 7))) s += peloDelante(a, cx, rx, ids);
      s += lentesSVG(a, ids) + aretesSVG(a, cx, rx, ids);
    } else {
      s += cabezaEspecial(a, ids);
      if (a.cabeza !== 1) s += lentesSVG(a, ids);
    }
    s += sombreroSVG(a, cx, ids);
    return s;
  }

  function claveDe(a) { return ORDEN.map(function (k) { return a[k]; }).join("."); }

  function svg(avatar, tam) {
    const a = normalizar(avatar);
    tam = tam || 80;
    const clave = claveDe(a);
    let cuerpo = cache[clave];
    if (!cuerpo) {
      cuerpo = construir(a);
      cache[clave] = cuerpo;
    }
    // Prefijo único por dibujo: así los degradados nunca se pisan entre avatares
    const pref = "av" + (++contador).toString(36) + "-";
    return '<svg class="avatar-svg" viewBox="0 0 80 80" width="' + tam + '" height="' + tam + '" aria-hidden="true">' + cuerpo.split("§").join(pref) + "</svg>";
  }

  /** Lista de todas las piezas que se compran (para la tienda). */
  function piezasDePago() {
    const lista = [];
    Object.keys(PRECIOS).forEach(function (campo) {
      PRECIOS[campo].forEach(function (p, i) {
        if (p > 0) lista.push({ id: "avatar:" + campo + ":" + i, campo: campo, valor: i, nombre: LABELS[campo][i], precio: p, exclusivo: esExclusivo(campo, i) });
      });
    });
    return lista;
  }

  function totalOpciones() {
    return ORDEN.reduce(function (s, k) { return s + CAMPOS[k]; }, 0);
  }

  const FRASES_CHAT = [
    "¡All in!", "Trica", "Págame", "Si me pagas te pago", "Sos un farol", "Me estás faroleando",
    "¡Buena mano!", "Qué suerte", "Apúrate", "Gg", "😂", "😎", "🔥", "😡", "👏"
  ];

  return {
    CAMPOS: CAMPOS,
    ORDEN: ORDEN,
    LABELS: LABELS,
    NOMBRES_CAMPO: NOMBRES_CAMPO,
    PRECIOS: PRECIOS,
    EXCLUSIVOS: EXCLUSIVOS,
    esExclusivo: esExclusivo,
    precio: precio,
    piezasDePago: piezasDePago,
    totalOpciones: totalOpciones,
    normalizar: normalizar,
    aleatorio: aleatorio,
    porDefecto: porDefecto,
    svg: svg,
    FRASES_CHAT: FRASES_CHAT
  };
});
