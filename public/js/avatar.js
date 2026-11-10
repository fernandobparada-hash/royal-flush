/* Avatares SVG propios de Royal Flush. Se pueden pintar en el
   navegador y en el servidor (bots). El objeto es compacto. */
(function (raiz, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  raiz.PokerAvatar = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CAMPOS = {
    cara: 3,
    piel: 6,
    pelo: 8,
    colorPelo: 7,
    ojos: 4,
    cejas: 4,
    boca: 5,
    barba: 5,
    lentes: 3,
    aretes: 2,
    camisa: 8,
    fondo: 8
  };

  const PIEL = ["#f3e0c8", "#f6d0b1", "#e0aa7b", "#c68642", "#8d5524", "#5c3317"];
  const PELO = ["#1a1a1a", "#3b2a1a", "#8b4513", "#d4a017", "#c0392b", "#4a6fa5", "#d8d4cf"];
  const CAMISA = ["#1f4e79", "#1b7a46", "#8b1e1e", "#3d2b6b", "#c47c16", "#0e7490", "#1f2933", "#7f1d4a"];
  const FONDO = ["#163028", "#1d3a4a", "#3a2040", "#3a2a16", "#14221c", "#2a1a1a", "#1a2840", "#243018"];

  const LABELS = {
    cara: ["Redonda", "Óvalo", "Cuadrada"],
    piel: ["Muy clara", "Clara", "Media", "Morena", "Oscura", "Profunda"],
    pelo: ["Corto", "Largo", "Rizado", "Calvo", "Coleta", "De lado", "Gorra", "Gorro"],
    colorPelo: ["Negro", "Castaño", "Cobre", "Rubio", "Rojo", "Azul", "Canoso"],
    ojos: ["Normales", "Alegres", "Cerrados", "Pícaros"],
    cejas: ["Naturales", "Pobladas", "Finas", "Levantadas"],
    boca: ["Sonrisa", "Gran sonrisa", "Seria", "Sorpresa", "Guiño"],
    barba: ["Sin barba", "Sombra", "Barba", "Bigote", "Perilla"],
    lentes: ["Sin lentes", "Anteojos", "De sol"],
    aretes: ["Sin aretes", "Aretes"],
    camisa: ["Azul", "Verde", "Roja", "Violeta", "Mostaza", "Cielo", "Grafito", "Fucsia"],
    fondo: ["Bosque", "Lago", "Uva", "Tierra", "Musgo", "Vino", "Noche", "Oliva"]
  };

  function acotar(n, max) {
    n = Number(n);
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(max - 1, Math.round(n));
  }

  function normalizar(crudo) {
    const a = {};
    const src = crudo && typeof crudo === "object" ? crudo : {};
    Object.keys(CAMPOS).forEach(function (k) {
      a[k] = acotar(src[k], CAMPOS[k]);
    });
    return a;
  }

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
      return s % n;
    }
    const a = {};
    Object.keys(CAMPOS).forEach(function (k) { a[k] = rnd(CAMPOS[k]); });
    return a;
  }

  function porDefecto() {
    return normalizar({ cara: 1, piel: 1, pelo: 0, colorPelo: 1, ojos: 0, cejas: 0, boca: 0, barba: 0, lentes: 0, aretes: 0, camisa: 0, fondo: 0 });
  }

  function svg(avatar, tam) {
    const a = normalizar(avatar);
    tam = tam || 80;
    const piel = PIEL[a.piel];
    const peloC = PELO[a.colorPelo];
    const camisa = CAMISA[a.camisa];
    const fondo = FONDO[a.fondo];
    const id = "a" + a.cara + a.piel + a.pelo + a.colorPelo + a.ojos + a.cejas + a.boca + a.barba + a.lentes + a.aretes + a.camisa + a.fondo;

    const cx = 40, cy = 36;
    let rx = 18, ry = 21;
    if (a.cara === 0) { rx = 20; ry = 19; }
    if (a.cara === 2) { rx = 17; ry = 21; }

    const oreja = '<ellipse cx="' + (cx - rx + 1) + '" cy="38" rx="3.2" ry="5" fill="' + piel + '"/><ellipse cx="' + (cx + rx - 1) + '" cy="38" rx="3.2" ry="5" fill="' + piel + '"/>';

    let pelo = "";
    if (a.pelo === 0) { // corto
      pelo = '<path d="M' + (cx - rx - 1) + ' 34 C ' + (cx - rx) + ' 16, ' + (cx + rx) + ' 16, ' + (cx + rx + 1) + ' 34 L ' + (cx + rx - 2) + ' 28 C ' + cx + ' 18, ' + (cx - rx + 2) + ' 28, ' + (cx - rx + 2) + ' 28 Z" fill="' + peloC + '"/>';
    } else if (a.pelo === 1) { // largo
      pelo = '<path d="M' + (cx - rx - 2) + ' 58 C ' + (cx - rx - 4) + ' 40, ' + (cx - rx) + ' 14, ' + cx + ' 14 C ' + (cx + rx) + ' 14, ' + (cx + rx + 4) + ' 40, ' + (cx + rx + 2) + ' 58 L ' + (cx + rx - 1) + ' 32 C ' + cx + ' 18, ' + (cx - rx + 1) + ' 32, ' + (cx - rx + 1) + ' 32 Z" fill="' + peloC + '"/>';
    } else if (a.pelo === 2) { // rizado
      pelo = '<circle cx="' + (cx - 12) + '" cy="22" r="7" fill="' + peloC + '"/><circle cx="' + (cx - 4) + '" cy="16" r="7.5" fill="' + peloC + '"/><circle cx="' + (cx + 5) + '" cy="15" r="8" fill="' + peloC + '"/><circle cx="' + (cx + 13) + '" cy="22" r="7" fill="' + peloC + '"/><circle cx="' + (cx - 14) + '" cy="30" r="6" fill="' + peloC + '"/><circle cx="' + (cx + 14) + '" cy="30" r="6" fill="' + peloC + '"/>';
    } else if (a.pelo === 3) { // calvo — brillo
      pelo = '<ellipse cx="' + (cx - 6) + '" cy="22" rx="4" ry="2" fill="rgba(255,255,255,0.25)"/>';
    } else if (a.pelo === 4) { // coleta
      pelo = '<path d="M' + (cx - rx) + ' 34 C ' + (cx - rx) + ' 16, ' + (cx + rx) + ' 16, ' + (cx + rx) + ' 34 C ' + cx + ' 18, ' + (cx - rx) + ' 28, ' + (cx - rx) + ' 34 Z" fill="' + peloC + '"/><ellipse cx="' + (cx + 16) + '" cy="48" rx="6" ry="10" fill="' + peloC + '"/>';
    } else if (a.pelo === 5) { // de lado
      pelo = '<path d="M' + (cx - rx - 1) + ' 36 C ' + (cx - 10) + ' 14, ' + (cx + 16) + ' 14, ' + (cx + rx) + ' 28 L ' + (cx + 8) + ' 24 C ' + (cx - 6) + ' 18, ' + (cx - rx + 2) + ' 28 Z" fill="' + peloC + '"/>';
    } else if (a.pelo === 6) { // gorra
      pelo = '<path d="M' + (cx - 18) + ' 30 C ' + (cx - 16) + ' 16, ' + (cx + 16) + ' 16, ' + (cx + 18) + ' 30 Z" fill="#1f2933"/><rect x="' + (cx - 22) + '" y="28" width="44" height="5" rx="2" fill="#111827"/>';
    } else if (a.pelo === 7) { // gorro
      pelo = '<path d="M' + (cx - 17) + ' 32 C ' + (cx - 16) + ' 14, ' + (cx + 16) + ' 14, ' + (cx + 17) + ' 32 Z" fill="#c0392b"/><circle cx="' + cx + '" cy="14" r="4" fill="#eef5f1"/>';
    }

    let cejas = "";
    const yC = 31;
    if (a.cejas === 0) cejas = '<path d="M26 31 q6 -3 12 0" stroke="#3b2a1a" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M42 31 q6 -3 12 0" stroke="#3b2a1a" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
    if (a.cejas === 1) cejas = '<path d="M25 31 q7 -4 13 1" stroke="#2a1a10" stroke-width="2.3" fill="none" stroke-linecap="round"/><path d="M42 32 q6 -4 13 0" stroke="#2a1a10" stroke-width="2.3" fill="none" stroke-linecap="round"/>';
    if (a.cejas === 2) cejas = '<path d="M27 32 q6 -2 11 0" stroke="#3b2a1a" stroke-width="1.1" fill="none" stroke-linecap="round"/><path d="M42 32 q6 -2 11 0" stroke="#3b2a1a" stroke-width="1.1" fill="none" stroke-linecap="round"/>';
    if (a.cejas === 3) cejas = '<path d="M26 33 q6 -6 12 -1" stroke="#3b2a1a" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M42 32 q6 -6 12 -1" stroke="#3b2a1a" stroke-width="1.7" fill="none" stroke-linecap="round"/>';

    let ojos = "";
    if (a.ojos === 0) {
      ojos = '<ellipse cx="32" cy="36" rx="3.2" ry="3.6" fill="#fff"/><circle cx="32.4" cy="36.3" r="1.6" fill="#2a1a10"/><ellipse cx="48" cy="36" rx="3.2" ry="3.6" fill="#fff"/><circle cx="48.4" cy="36.3" r="1.6" fill="#2a1a10"/>';
    } else if (a.ojos === 1) {
      ojos = '<ellipse cx="32" cy="36" rx="3.4" ry="4" fill="#fff"/><circle cx="32.5" cy="36.4" r="1.7" fill="#2a1a10"/><path d="M28 33 q4 -3 8 0" stroke="#2a1a10" stroke-width="1" fill="none"/><ellipse cx="48" cy="36" rx="3.4" ry="4" fill="#fff"/><circle cx="48.5" cy="36.4" r="1.7" fill="#2a1a10"/><path d="M44 33 q4 -3 8 0" stroke="#2a1a10" stroke-width="1" fill="none"/>';
    } else if (a.ojos === 2) {
      ojos = '<path d="M28 37 q4 3 8 0" stroke="#2a1a10" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M44 37 q4 3 8 0" stroke="#2a1a10" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
    } else {
      ojos = '<ellipse cx="32" cy="36" rx="3.2" ry="3.4" fill="#fff"/><circle cx="33" cy="36" r="1.6" fill="#2a1a10"/><path d="M44 37 q4 0 8 0" stroke="#2a1a10" stroke-width="1.5" fill="none"/><ellipse cx="48" cy="35.5" rx="3.2" ry="2.4" fill="#fff"/><circle cx="49" cy="35.5" r="1.4" fill="#2a1a10"/>';
    }

    let boca = "";
    if (a.boca === 0) boca = '<path d="M33 47 q7 6 14 0" stroke="#a04a3a" stroke-width="1.7" fill="none" stroke-linecap="round"/>';
    if (a.boca === 1) boca = '<path d="M32 46 q8 8 16 0 q-8 4 -16 0" fill="#a04a3a"/><path d="M35 48 q5 3 10 0" stroke="#fff" stroke-width="0.8" fill="none"/>';
    if (a.boca === 2) boca = '<path d="M33 49 h14" stroke="#a04a3a" stroke-width="1.6" stroke-linecap="round"/>';
    if (a.boca === 3) boca = '<ellipse cx="40" cy="49" rx="4.2" ry="3.4" fill="#7a2e2e"/>';
    if (a.boca === 4) boca = '<path d="M33 47 q4 5 8 0" stroke="#a04a3a" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M44 47 q4 2 7 0" stroke="#a04a3a" stroke-width="1.5" fill="none" stroke-linecap="round"/>';

    let barba = "";
    if (a.barba === 1) barba = '<ellipse cx="40" cy="52" rx="12" ry="8" fill="' + peloC + '" opacity="0.35"/>';
    if (a.barba === 2) barba = '<path d="M' + (cx - 13) + ' 46 C ' + (cx - 14) + ' 62, ' + (cx + 14) + ' 62, ' + (cx + 13) + ' 46 C ' + cx + ' 52, ' + (cx - 13) + ' 46 Z" fill="' + peloC + '"/>';
    if (a.barba === 3) barba = '<path d="M30 48 q10 4 20 0" stroke="' + peloC + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
    if (a.barba === 4) barba = '<path d="M36 50 C 36 58, 44 58, 44 50 Q 40 54 36 50" fill="' + peloC + '"/>';

    let lentes = "";
    if (a.lentes === 1) lentes = '<circle cx="32" cy="36.5" r="6" fill="none" stroke="#222" stroke-width="1.5"/><circle cx="48" cy="36.5" r="6" fill="none" stroke="#222" stroke-width="1.5"/><path d="M38 36.5 h4" stroke="#222" stroke-width="1.4"/>';
    if (a.lentes === 2) lentes = '<rect x="25" y="32" width="14" height="10" rx="3" fill="#111" opacity="0.85"/><rect x="41" y="32" width="14" height="10" rx="3" fill="#111" opacity="0.85"/><path d="M39 36 h2" stroke="#111" stroke-width="1.6"/>';

    const aretes = a.aretes ? '<circle cx="' + (cx - rx) + '" cy="44" r="2" fill="#f2c14e"/><circle cx="' + (cx + rx) + '" cy="44" r="2" fill="#f2c14e"/>' : "";

    const camisaG = '<path d="M12 72 C 16 58, 28 56, 40 56 C 52 56, 64 58, 68 72 L 68 80 L 12 80 Z" fill="' + camisa + '"/><path d="M40 56 L 46 80 L 34 80 Z" fill="rgba(255,255,255,0.15)"/>';

    return '<svg class="avatar-svg" viewBox="0 0 80 80" width="' + tam + '" height="' + tam + '" aria-hidden="true"><circle cx="40" cy="40" r="40" fill="' + fondo + '"/>' +
      camisaG + oreja + pelo +
      '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + piel + '"/>' +
      cejas + ojos + barba + boca + lentes + aretes +
      '</svg>';
  }

  const FRASES_CHAT = [
    "¡All in!",
    "Trica",
    "Págame",
    "Si me pagas te pago",
    "Sos un farol",
    "Me estás faroleando",
    "¡Buena mano!",
    "Qué suerte",
    "Apúrate",
    "Gg",
    "😂",
    "😎",
    "🔥",
    "😡",
    "👏"
  ];

  return {
    CAMPOS: CAMPOS,
    LABELS: LABELS,
    normalizar: normalizar,
    aleatorio: aleatorio,
    porDefecto: porDefecto,
    svg: svg,
    FRASES_CHAT: FRASES_CHAT
  };
});
