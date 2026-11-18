/* =========================================================
   INTERFAZ — menú, mesa, animaciones y modo en línea
   ---------------------------------------------------------
   Este archivo "pinta" el juego y captura lo que pulsas.
   La lógica (quién gana, de quién es el turno) vive en
   motor.js. Aquí solo preguntamos al motor y dibujamos.
   ========================================================= */

(function () {
  "use strict";

  const Motor = window.PokerMotor;
  const Bots = window.PokerBots;
  const Ev = window.PokerEvaluador;
  const Avatar = window.PokerAvatar;
  const Historial = window.PokerHistorial;
  const ModuloSonidos = window.PokerSonidos;
  const Util = window.PokerUtilidades;
  // Funciones puras (no tocan la pantalla) que viven en utilidades.js
  const formatearFichas = Util.formatearFichas;
  const formatearBs = Util.formatearBs;
  const escapar = Util.escapar;
  const clamp = Util.clamp;
  const rectsSeSolapan = Util.rectsSeSolapan;
  const caja = Util.caja;
  const sePisan = Util.sePisan;
  const textoAccion = Util.textoAccion;
  const colorFicha = Util.colorFicha;
  const primerNombre = Util.primerNombre;
  const extraerCodigo = Util.extraerCodigo;
  const anguloAsiento = Util.anguloAsiento;
  const textoCiegas = Util.textoCiegas;

  const ui = {
    modo: "menu",
    mesa: null,
    tuId: null,
    ws: null,
    estado: null,
    codigo: null,
    esAnfitrion: false,
    publica: false,
    animando: false,
    cola: [],
    procesandoCola: false,
    timerBot: null,
    timerNuevaMano: null,
    ultimaSecuencia: null,
    token: null,
    avatar: null,
    reconectando: false,
    despuesAvatar: null,
    globos: {},
    logChat: [],
    timerPing: null,
    timerSalud: null,
    timerReconnect: null,
    cuentas: null,
    historial: Historial ? Historial.crearHistorial(50) : null,
    historialSala: null,
    ultimaCiegaGrande: null,
    espectador: false,
    turnoLimite: null,   // momento (reloj de este navegador) en que se acaba el turno del que tiene el reloj
    turnoDe: null
  };

  const LS_NOMBRE = "rf_nombre";
  const LS_AVATAR = "rf_avatar";
  const LS_TOKEN = "rf_token";
  const LS_CODIGO = "rf_codigo";
  const LS_SONIDO = "rf_sonido";
  const FRASES_CHAT = (Avatar && Avatar.FRASES_CHAT) ? Avatar.FRASES_CHAT : [];

  const $ = function (id) { return document.getElementById(id); };

  function nombreJugador(exigir) {
    const v = ($("nombre-jugador") && $("nombre-jugador").value || "").trim();
    if (v) return v;
    if (exigir) {
      mostrarError("Escribí tu nombre (al menos 2 letras) para entrar.");
      const inp = $("nombre-jugador");
      if (inp) inp.focus();
      return "";
    }
    return "Jugador";
  }

  function guardarNombre() {
    const n = ($("nombre-jugador") && $("nombre-jugador").value || "").trim();
    try { if (n) localStorage.setItem(LS_NOMBRE, n); } catch (e) { /* */ }
    return n;
  }

  function cargarPreferencias() {
    try {
      const n = localStorage.getItem(LS_NOMBRE);
      if (n && $("nombre-jugador") && !$("nombre-jugador").value) $("nombre-jugador").value = n;
      const raw = localStorage.getItem(LS_AVATAR);
      if (raw) ui.avatar = Avatar.normalizar(JSON.parse(raw));
      const tok = localStorage.getItem(LS_TOKEN);
      if (tok) ui.token = tok;
      const cod = localStorage.getItem(LS_CODIGO);
      if (cod && !ui.codigo) ui.codigo = cod;
    } catch (e) { /* */ }
    if (!ui.avatar) ui.avatar = Avatar.porDefecto();
  }

  function guardarAvatar(a) {
    ui.avatar = Avatar.normalizar(a || ui.avatar || Avatar.porDefecto());
    // Lo que no se compró no se lleva a la mesa
    if (window.PokerTienda && ui.monedero) ui.avatar = window.PokerTienda.avatarPermitido(ui.monedero, ui.avatar);
    try { localStorage.setItem(LS_AVATAR, JSON.stringify(ui.avatar)); } catch (e) { /* */ }
    return ui.avatar;
  }

  function guardarSesionSala(token, codigo) {
    if (token) {
      ui.token = token;
      try { localStorage.setItem(LS_TOKEN, token); } catch (e) { /* */ }
    }
    if (codigo) {
      ui.codigo = codigo;
      try { localStorage.setItem(LS_CODIGO, codigo); } catch (e) { /* */ }
    }
  }

  function borrarSesionSala() {
    ui.token = null;
    ui.codigo = null;
    try {
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_CODIGO);
    } catch (e) { /* */ }
  }

  function mostrarError(msg) {
    if (!msg) return;
    toast(msg, "err");
    const ids = ["aviso-menu", "aviso-sala", "aviso-online"];
    for (let i = 0; i < ids.length; i++) {
      const el = $(ids[i]);
      if (el && el.closest && el.closest("section") && !el.closest("section").hidden) {
        el.textContent = msg;
        el.hidden = false;
      } else if (el && !el.closest("section").hidden) {
        el.textContent = msg;
      }
    }
    const menu = $("aviso-menu");
    if (menu && $("pantalla-menu") && !$("pantalla-menu").hidden) menu.textContent = msg;
    const sala = $("aviso-sala");
    if (sala && $("pantalla-sala") && !$("pantalla-sala").hidden) sala.textContent = msg;
  }

  function limpiarAvisos() {
    ["aviso-menu", "aviso-sala", "aviso-online"].forEach(function (id) {
      if ($(id)) $(id).textContent = "";
    });
  }

  function asientosElegidos(nombre) {
    const marcado = document.querySelector('input[name="' + nombre + '"]:checked');
    return marcado ? Number(marcado.value) : 9;
  }

  /* ---------- Sonido ---------- */

  function leerSonidoGuardado() {
    try { return localStorage.getItem(LS_SONIDO) !== "0"; } catch (e) { return true; }
  }

  const sonidos = ModuloSonidos ? ModuloSonidos.crearSonidos({ activo: leerSonidoGuardado() }) : null;

  function sonar(nombre, opciones) {
    if (sonidos) sonidos.reproducir(nombre, opciones);
  }

  function pintarBotonSonido() {
    const b = $("btn-sonido");
    if (!b || !sonidos) return;
    const activo = sonidos.estaActivo();
    b.textContent = activo ? "🔊" : "🔇";
    b.setAttribute("aria-pressed", activo ? "true" : "false");
    b.title = activo ? "Silenciar el sonido" : "Activar el sonido";
  }

  function alternarSonido() {
    if (!sonidos) return;
    const activo = sonidos.alternar();
    try { localStorage.setItem(LS_SONIDO, activo ? "1" : "0"); } catch (e) { /* */ }
    pintarBotonSonido();
    if (activo) sonar("ficha");
  }

  /** Suena según lo que pasa en la mesa (sirve tanto para el modo solo como para el online). */
  function sonarEvento(ev) {
    if (!sonidos || !ev) return;
    if (ev.tipo === "accion") {
      const a = ev.accion;
      if (a === "retirarse") sonar("retirarse");
      else if (a === "pasar") sonar("pasar");
      else if (a === "igualar") sonar("igualar");
      else if (a === "apostar") sonar("apostar");
      else if (a === "subir") sonar("subir");
      else if (a === "all-in") sonar("allin");
    } else if (ev.tipo === "turno") {
      if (ev.jugadorId && ev.jugadorId === ui.tuId) sonar("turno");
    } else if (ev.tipo === "calle") {
      sonar("carta", { veces: (ev.nuevas && ev.nuevas.length) || 1, cada: 0.15 });
    } else if (ev.tipo === "mano-iniciada") {
      sonar("carta", { veces: (ev.secuenciaReparto && ev.secuenciaReparto.length) || 4, cada: 0.13 });
      if (ev.ciegasSubieron) setTimeout(function () { sonar("ciegas"); }, 700);
    }
  }

  function sonarResultado(estado) {
    const r = estado && estado.resultadoShowdown;
    if (!r || !sonidos) return;
    const gane = (r.ganadores || []).some(function (g) { return g.id === ui.tuId; });
    sonar(gane ? "ganar" : "fin");
  }

  /* ---------- Historial de manos ---------- */

  /* ---------- Reloj de turno (modo online) ---------- */

  function pintarReloj() {
    const el = $("reloj-turno");
    if (!el) return;
    const e = ui.estado;
    if (!ui.turnoLimite || !e || ui.modo !== "online" || !e.turnoId || e.turnoId !== ui.turnoDe) {
      el.hidden = true;
      return;
    }
    const seg = Math.max(0, Math.ceil((ui.turnoLimite - Date.now()) / 1000));
    const suyo = e.turnoId === ui.tuId;
    const j = (e.jugadores || []).find(function (x) { return x.id === e.turnoId; });
    el.textContent = suyo ? "⏱ Te quedan " + seg + " s" : "⏱ " + (j ? j.nombre : "") + " · " + seg + " s";
    el.classList.toggle("urgente", suyo && seg <= 5);
    el.hidden = false;
  }

  /* ---------- Tu mano en vivo ("Tu mano: Pareja de ases · proyecto de color") ---------- */

  function pintarTuMano(estado) {
    const el = $("tu-mano");
    if (!el) return;
    const yo = (estado.jugadores || []).find(function (j) { return j.id === ui.tuId; });
    const comunes = estado.comunitarias || [];
    const propias = yo && yo.cartas ? yo.cartas.filter(function (c) { return !c.oculta; }) : [];
    const enJuego = yo && yo.enMano && !yo.retirado && propias.length === 2 && comunes.length >= 3 && !estado.resultadoShowdown;
    if (!enJuego) {
      el.hidden = true;
      return;
    }
    const todas = propias.concat(comunes);
    let t = "Tu mano: " + Ev.describirMano(Ev.mejorMano(todas));
    if (comunes.length < 5) {
      const dr = Ev.detectarProyectadas(todas);
      if (dr.color) t += " · proyecto de color";
      else if (dr.escaleraAbierta) t += " · proyecto de escalera";
    }
    el.textContent = t;
    el.hidden = false;
  }

  /* ---------- Atajos de teclado ---------- */

  function iniciarAtajos() {
    document.addEventListener("keydown", function (ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" ||
          (t.tagName === "INPUT" && t.type !== "range" && t.type !== "checkbox"))) return;
      const panel = $("panel-acciones");
      if (!panel || panel.hidden || !$("pantalla-mesa") || $("pantalla-mesa").hidden) return;
      function usable(id) {
        const b = $(id);
        return (b && !b.hidden && !b.disabled && b.offsetParent !== null) ? b : null;
      }
      const k = String(ev.key || "").toLowerCase();
      let boton = null;
      if (k === "r" || k === "f") {
        if (usable("btn-pasar")) {   // retirarse cuando pasar es gratis casi nunca es lo que quieres
          ev.preventDefault();
          toast("Puedes pasar gratis: pulsa C.", "ok");
          return;
        }
        boton = usable("btn-retirarse");
      } else if (k === "c") {
        boton = usable("btn-pasar") || usable("btn-igualar");
      } else if (k === "s") {
        boton = usable("btn-subir");
      } else if (k === "a" && ev.shiftKey) {
        boton = usable("btn-allin");
      }
      if (boton) {
        ev.preventDefault();
        boton.click();
      }
    });
  }

  function registrarHistorial(estado) {
    if (!ui.historial || !estado) return;
    const entrada = ui.historial.registrar(estado, ui.tuId);
    if (entrada && $("panel-historial") && !$("panel-historial").hidden) pintarHistorial();
  }

  function pintarHistorial() {
    const caja = $("lista-historial");
    if (!caja) return;
    caja.textContent = "";
    const lista = ui.historial ? ui.historial.lista() : [];
    const resumen = $("resumen-historial");
    if (resumen) {
      if (lista.length && Historial) {
        const r = Historial.resumenSesion(lista);
        resumen.textContent = "Últimas " + r.manos + (r.manos === 1 ? " mano" : " manos") + ": ganaste " + r.ganadas +
          (r.mejorPremio ? " · tu mejor premio " + formatearFichas(r.mejorPremio) : "");
      } else {
        resumen.textContent = "";
      }
    }
    if (!lista.length) {
      const p = document.createElement("p");
      p.className = "historial-vacio";
      p.textContent = "Todavía no ha terminado ninguna mano.";
      caja.appendChild(p);
      return;
    }
    function linea(clase, texto) {
      const d = document.createElement("div");
      d.className = clase;
      d.textContent = texto;
      return d;
    }
    for (let i = 0; i < lista.length; i++) {
      const e = lista[i];
      const fila = document.createElement("div");
      fila.className = "fila-historial" + (e.gane ? " gane" : "");
      const cab = document.createElement("header");
      const a = document.createElement("span");
      a.textContent = "Mano " + e.mano + (e.gane ? " · ¡Ganaste!" : "");
      const b = document.createElement("span");
      b.textContent = "Bote " + formatearFichas(e.bote);
      cab.appendChild(a);
      cab.appendChild(b);
      fila.appendChild(cab);
      for (let g = 0; g < e.ganadores.length; g++) {
        const gan = e.ganadores[g];
        let t = gan.nombre + " se lleva " + formatearFichas(gan.premio);
        if (gan.descripcion && !e.sinShowdown) t += " con " + gan.descripcion;
        if (e.sinShowdown) t += " (todos se retiraron)";
        fila.appendChild(linea("ganador-linea", t));
      }
      if (e.comunitarias.length) fila.appendChild(linea("detalle cartas-texto", "Mesa: " + e.comunitarias.join("  ")));
      for (let r = 0; r < e.reveladas.length; r++) {
        const rev = e.reveladas[r];
        fila.appendChild(linea("detalle", rev.nombre + ": " + rev.cartas.join(" ") + " · " + rev.descripcion));
      }
      fila.appendChild(linea("detalle", "Ciegas " + e.ciegas));
      caja.appendChild(fila);
    }
  }

  function abrirHistorial() {
    const panel = $("panel-historial");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) pintarHistorial();
  }

  function torneoElegido(grupo) {
    const el = $("torneo-" + grupo);
    return !!(el && el.checked);
  }

  /** "Ciegas 5 / 10" y, en modo torneo, cuántas manos faltan para que suban. */

  function movimientoReducido() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function fichasElegidas(grupo) {
    const caja = document.querySelector('.selector-fichas[data-grupo="' + grupo + '"]');
    const input = caja ? caja.querySelector(".input-fichas") : null;
    const r = Motor.normalizarFichas(input ? input.value : Motor.FICHAS_INICIALES);
    return r.error ? Motor.FICHAS_INICIALES : r.fichas;
  }

  function actualizarSelectorFichas(caja, valor) {
    const r = Motor.normalizarFichas(valor);
    const fichas = r.error ? Motor.FICHAS_INICIALES : r.fichas;
    const ciegas = Motor.ciegasPara(fichas);
    const rango = caja.querySelector(".rango-fichas");
    const input = caja.querySelector(".input-fichas");
    const formato = caja.querySelector(".fichas-formato");
    const preview = caja.querySelector(".ciegas-preview");
    if (rango) rango.value = String(fichas);
    if (input && document.activeElement !== input) input.value = String(fichas);
    if (formato) formato.textContent = formatearFichas(fichas) + " fichas";
    if (preview) preview.textContent = "Ciegas " + ciegas.ciegaPequena + " / " + ciegas.ciegaGrande;
    const bots = caja.querySelectorAll(".presets-fichas button");
    for (let i = 0; i < bots.length; i++) {
      bots[i].classList.toggle("activo", Number(bots[i].getAttribute("data-fichas")) === fichas);
    }
  }

  function iniciarSelectoresFichas() {
    const cajas = document.querySelectorAll(".selector-fichas");
    for (let c = 0; c < cajas.length; c++) {
      (function (caja) {
        const rango = caja.querySelector(".rango-fichas");
        const input = caja.querySelector(".input-fichas");
        if (rango) rango.addEventListener("input", function () { actualizarSelectorFichas(caja, rango.value); });
        if (input) {
          input.addEventListener("input", function () { actualizarSelectorFichas(caja, input.value); });
          input.addEventListener("change", function () {
            const r = Motor.normalizarFichas(input.value);
            actualizarSelectorFichas(caja, r.error ? Motor.FICHAS_INICIALES : r.fichas);
          });
        }
        const bots = caja.querySelectorAll(".presets-fichas button");
        for (let i = 0; i < bots.length; i++) {
          bots[i].addEventListener("click", function () { actualizarSelectorFichas(caja, bots[i].getAttribute("data-fichas")); });
        }
        actualizarSelectorFichas(caja, (input && input.value) || 1000);
      })(cajas[c]);
    }
  }

  function mostrar(idPantalla) {
    const ids = ["pantalla-menu", "pantalla-avatar", "pantalla-tienda", "pantalla-vivo", "pantalla-solo", "pantalla-online", "pantalla-sala", "pantalla-mesa"];
    for (let i = 0; i < ids.length; i++) {
      const el = $(ids[i]);
      if (!el) continue;
      if (ids[i] === idPantalla) el.hidden = false;
      else el.hidden = true;
    }
    document.documentElement.classList.toggle("en-mesa", idPantalla === "pantalla-mesa");
    if ($("btn-abrir-cuentas")) $("btn-abrir-cuentas").hidden = idPantalla !== "pantalla-mesa" || ui.modo !== "online" || ui.espectador;
    if ($("btn-abrir-chat")) $("btn-abrir-chat").hidden = idPantalla === "pantalla-mesa" && ui.espectador;
    if (idPantalla !== "pantalla-mesa" && idPantalla !== "pantalla-sala") {
      if ($("panel-cuentas")) $("panel-cuentas").hidden = true;
    }
  }

  /* ---------- Enlaces de sala y avisos ---------- */

  function toast(msg, kind) {
    const box = $("toasts");
    if (!box) return;
    const el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = msg;
    while (box.children.length >= 2) box.firstChild.remove();
    box.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, kind === "err" ? 5000 : 2800);
  }

  function codigoDesdeUbicacion() {
    try {
      const path = location.pathname || "";
      const m = path.match(/\/m\/([A-Za-z0-9]{4,12})\/?$/i);
      if (m) return m[1].toUpperCase().slice(0, 5);
      const q = new URLSearchParams(location.search || "");
      const c = q.get("sala") || q.get("m") || q.get("codigo");
      if (c) return extraerCodigo(c);
    } catch (e) { /* archivo local u origen nulo */ }
    return "";
  }

  function enlaceInvitacion(codigo) {
    if (!codigo) return "";
    try {
      if (location.protocol !== "file:" && location.origin && location.origin !== "null") {
        return location.origin + "/m/" + codigo;
      }
    } catch (e) { /* */ }
    const base = (location.href || "").split("?")[0].split("#")[0];
    return base + "?sala=" + codigo;
  }

  function actualizarUrlSala(codigo) {
    if (location.protocol === "file:") return;
    try {
      const dest = codigo ? ("/m/" + codigo) : "/";
      if (location.pathname !== dest) history.replaceState({}, "", dest);
    } catch (e) { /* */ }
  }

  function copiarEnlaceSala(codigo) {
    const link = enlaceInvitacion(codigo || ui.codigo);
    if (!link) { toast("Todavía no hay una sala para compartir.", "err"); return; }
    const done = function () { toast("Enlace copiado. Compártelo con tus amigos.", "ok"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done).catch(function () { fallbackCopy(link, done); });
    } else {
      fallbackCopy(link, done);
    }
  }

  function fallbackCopy(text, done) {
    try {
      const inp = document.createElement("input");
      inp.value = text;
      document.body.appendChild(inp);
      inp.select();
      document.execCommand("copy");
      document.body.removeChild(inp);
      if (done) done();
    } catch (e) {
      toast("No se pudo copiar. El enlace es: " + text, "err");
    }
  }

  function compartirOCopiar(codigo) {
    const link = enlaceInvitacion(codigo || ui.codigo);
    if (!link) return copiarEnlaceSala(codigo);
    if (navigator.share) {
      navigator.share({
        title: "Royal Flush",
        text: "Sumate a mi mesa de Royal Flush",
        url: link
      }).catch(function () { copiarEnlaceSala(codigo); });
    } else {
      copiarEnlaceSala(codigo);
    }
  }

  function mostrarInvitacionPendiente() {
    const codigo = codigoDesdeUbicacion();
    const aviso = $("aviso-invitacion");
    const caja = $("caja-entrar-invitacion");
    const texto = $("texto-codigo-invitacion");
    const normal = $("acciones-menu-normal");
    const opciones = $("opciones-online");
    const disc = document.querySelector("#pantalla-menu .disclaimer");
    if (codigo) {
      if (aviso) aviso.hidden = false;
      if (caja) caja.hidden = false;
      if (texto) texto.textContent = "Mesa " + codigo;
      if ($("input-codigo")) $("input-codigo").value = codigo;
      if (normal) normal.hidden = true;
      if (opciones) opciones.hidden = true;
      if (disc) disc.hidden = true;
      return codigo;
    }
    if (aviso) aviso.hidden = true;
    if (caja) caja.hidden = true;
    if (normal) normal.hidden = false;
    if (opciones) opciones.hidden = false;
    if (disc) disc.hidden = false;
    return "";
  }

  function abrirPersonalizar(luego) {
    ui.despuesAvatar = luego || null;
    if (!ui.avatar) ui.avatar = Avatar.porDefecto();
    ui.avatarEdicion = Avatar.normalizar(ui.avatar);
    mostrar("pantalla-avatar");
    montarControlesAvatar();
    pintarPreviewAvatar();
  }

  function terminarAvatar(saltar) {
    if (!saltar && piezasBloqueadasEdicion().length) {
      toast("Comprá lo que tiene 🔒 o elegí otra opción.", "err");
      pintarAvisoBloqueadas();
      return;
    }
    if (saltar && !localStorage.getItem(LS_AVATAR)) {
      guardarAvatar(Avatar.aleatorio(nombreJugador(false)));
    } else if (saltar) {
      guardarAvatar(ui.avatar || Avatar.porDefecto());
    } else {
      guardarAvatar(ui.avatarEdicion || ui.avatar || Avatar.porDefecto());
    }
    ui.avatarEdicion = null;
    const fn = ui.despuesAvatar;
    ui.despuesAvatar = null;
    if (typeof fn === "function") fn();
    else irMenu();
  }

  function necesitaPersonalizar() {
    try { return !localStorage.getItem(LS_AVATAR); } catch (e) { return true; }
  }

  function conNombreYAvatar(fn, opciones) {
    opciones = opciones || {};
    const n = nombreJugador(true);
    if (!n || n.length < 2) return;
    if (n.length < 2) { mostrarError("Escribí tu nombre (al menos 2 letras) para entrar."); return; }
    guardarNombre();
    if (!opciones.saltarAvatar && necesitaPersonalizar()) {
      abrirPersonalizar(fn);
      return;
    }
    if (!ui.avatar) guardarAvatar(Avatar.porDefecto());
    fn();
  }

  function invitarAmigo() {
    const codigo = ui.codigo;
    const link = enlaceInvitacion(codigo);
    if (!link) { mostrarError("Todavía no hay una sala para compartir."); return; }
    const texto = "Sumate a mi mesa de Royal Flush. Entrá con este enlace: " + link;
    if (navigator.share) {
      navigator.share({ title: "Royal Flush", text: texto, url: link }).catch(function () {
        fallbackCopy(texto, function () { toast("Enlace copiado. Mandáselo a tu amigo.", "ok"); });
      });
    } else {
      fallbackCopy(texto, function () { toast("Enlace copiado. Mandáselo a tu amigo por WhatsApp o como quieras.", "ok"); });
    }
  }

  /* =========================================================
     v12: MONEDAS VIRTUALES, TIENDA Y MESAS EN VIVO
     Las monedas son solo cosméticas (no son dinero real).
     ========================================================= */
  const Tienda = window.PokerTienda;
  const LS_MONEDERO = "rf_monedero";
  const LS_MONEDERO_ID = "rf_monedero_id";

  function idMonedero() {
    let id = "";
    try { id = localStorage.getItem(LS_MONEDERO_ID) || ""; } catch (e) { /* */ }
    if (!/^[a-f0-9]{24}$/.test(id)) {
      const bytes = new Uint8Array(12);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
      else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
      id = Array.prototype.map.call(bytes, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      try { localStorage.setItem(LS_MONEDERO_ID, id); } catch (e) { /* */ }
    }
    return id;
  }

  function cargarMonedero() {
    if (!Tienda) return;
    let guardado = null;
    try { guardado = JSON.parse(localStorage.getItem(LS_MONEDERO) || "null"); } catch (e) { guardado = null; }
    ui.monedero = guardado ? Tienda.normalizar(guardado) : Tienda.nuevoMonedero();
    if (!guardado) guardarMonedero();
    else { pintarSaldo(); aplicarCosmeticos(); }
    setTimeout(revisarBonoDiario, 600);
  }

  function guardarMonedero(sinRespaldo) {
    if (!Tienda || !ui.monedero) return;
    try { localStorage.setItem(LS_MONEDERO, JSON.stringify(ui.monedero)); } catch (e) { /* */ }
    pintarSaldo();
    aplicarCosmeticos();
    if (!sinRespaldo) programarRespaldoMonedero();
  }

  /** Copia en el servidor (Key Value) unos segundos después del último cambio. */
  function programarRespaldoMonedero() {
    if (location.protocol === "file:" || !window.fetch) return;
    clearTimeout(ui.timerRespaldo);
    ui.timerRespaldo = setTimeout(function () {
      fetch("/api/monedero/" + idMonedero(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monedero: ui.monedero })
      }).catch(function () { /* sin conexión: queda en el aparato */ });
    }, 1200);
  }

  function pintarSaldo() {
    if (!ui.monedero) return;
    const txt = Tienda.formatear(ui.monedero.saldo);
    document.querySelectorAll(".saldo-monedas").forEach(function (el) { el.textContent = txt; });
  }

  function aplicarCosmeticos() {
    if (!ui.monedero) return;
    const raiz = document.documentElement;
    raiz.setAttribute("data-tema", ui.monedero.tema.split(":")[1] || "clasico");
    raiz.setAttribute("data-dorso", ui.monedero.dorso.split(":")[1] || "azul");
    if (sonidos && sonidos.ponerTema) sonidos.ponerTema(ui.monedero.sonido);
  }

  /** Monedas por la mano que acaba de terminar (una sola vez por mano; los espectadores no ganan). */
  function premiarMano(estado) {
    if (!Tienda || !ui.monedero || !estado || ui.espectador) return 0;
    const r = estado.resultadoShowdown;
    if (!r) return 0;
    const yo = (estado.jugadores || []).find(function (j) { return j.id === ui.tuId; });
    if (!yo || !(yo.cartas && yo.cartas.length)) return 0;
    const clave = (ui.modo === "solo" ? "solo" : (ui.codigo || "")) + ":" + estado.manosJugadas;
    if (ui.ultimaManoPremiada === clave) return 0;
    ui.ultimaManoPremiada = clave;
    const mio = (r.ganadores || []).find(function (g) { return g.id === ui.tuId; });
    const bb = Number(estado.ciegaGrande) || 0;
    const racha = Tienda.registrarRacha(ui.monedero, {
      jugo: true,
      gano: !!mio,
      retiro: !!yo.retirado,
      // Retirarse habiendo puesto como mucho una ciega grande no corta la racha
      gratis: !!yo.retirado && (Number(yo.aportado) || 0) <= bb
    });
    pintarRacha(racha);
    revisarBonoDiario();
    const solo = ui.modo === "solo";
    const res = Tienda.premioMano(ui.monedero, {
      jugo: true,
      gano: !!mio,
      showdown: !r.sinShowdown,
      categoria: categoriaPropia(estado, yo),
      solo: solo
    });
    res.logros.forEach(function (l) { toast("🏆 ¡Logro! " + Tienda.NOMBRE_LOGRO[l] + " (+" + Tienda.REGLAS.logros[l] + (solo ? ", la mitad en solo" : "") + ")", "ok"); });
    revisarPuestoPartida(estado, yo);
    guardarMonedero();
    if (res.n > 0) avisarMonedas(res.n, res.partes.map(function (p) { return p.motivo; }).join(" · ") + (solo ? " (solo: la mitad)" : ""));
    return res.n;
  }

  /** Tu mejor jugada al final de la mano (0-9), o -1 si te retiraste o no hubo 5 cartas en la mesa. */
  function categoriaPropia(estado, yo) {
    if (!Ev || !yo || yo.retirado) return -1;
    const propias = (yo.cartas || []).filter(function (c) { return c && !c.oculta && c.numero; });
    const mesa = (estado.comunitarias || []).filter(function (c) { return c && c.numero; });
    if (propias.length < 2 || propias.length + mesa.length < 5) return -1;
    try { return Ev.mejorMano(propias.concat(mesa)).categoria; } catch (e) { return -1; }
  }

  /**
   * Partida o torneo: +25 al ganarla (quedarte con todas las fichas) y +10 al 2.º puesto
   * (quedar eliminado cuando solo queda uno). Una vez por partida.
   */
  function revisarPuestoPartida(estado, yo) {
    if (ui.puestoPremiado || !yo) return;
    const vivos = (estado.jugadores || []).filter(function (j) { return j.fichas > 0; });
    let puesto = 0;
    if (yo.fichas > 0 && vivos.length === 1) puesto = 1;
    else if (yo.fichas <= 0 && vivos.length === 1) puesto = 2;
    if (puesto) premiarPuesto(puesto);
  }

  function premiarPuesto(puesto) {
    if (ui.puestoPremiado || !Tienda || !ui.monedero || ui.espectador) return;
    const solo = ui.modo === "solo";
    const res = Tienda.premioPartida(ui.monedero, puesto, solo);
    ui.puestoPremiado = true;
    guardarMonedero();
    toast(puesto === 1 ? "🏆 ¡Ganaste la partida!" : "🥈 ¡Segundo puesto!", "ok");
    if (res.n > 0) avisarMonedas(res.n, (puesto === 1 ? "ganaste la partida" : "2.º puesto") + (solo ? " (solo: la mitad)" : ""));
  }

  /** Al cerrar el anfitrión una partida online: puesto según las fichas de la mesa. */
  function premiarFinPartidaOnline() {
    const est = ui.estado;
    if (!est || ui.espectador || !(est.manosJugadas > 0)) return;
    const yo = (est.jugadores || []).find(function (j) { return j.id === ui.tuId; });
    if (!yo) return;
    const mas = (est.jugadores || []).filter(function (j) { return j.id !== ui.tuId && j.fichas > yo.fichas; }).length;
    if (mas < 2) premiarPuesto(mas + 1);
  }

  /** Bono diario: se cobra al abrir la app o al jugar el primer mano del día. */
  function revisarBonoDiario() {
    if (!Tienda || !ui.monedero) return;
    const b = Tienda.bonoDiario(ui.monedero);
    if (!b) return;
    guardarMonedero();
    avisarMonedas(b.n, "bono diario" + (b.dias > 1 ? " · " + b.dias + " días seguidos" : ""));
  }

  /** "+N 🪙" en un aviso (y flotando sobre la mesa si estás jugando). */
  function avisarMonedas(n, motivo) {
    toast("+" + n + " 🪙" + (motivo ? " · " + motivo : ""), "ok");
    mostrarGanancia(n);
  }

  /** Contador de manos ganadas seguidas en la barra de la mesa. */
  function pintarRacha(r) {
    const el = $("info-racha");
    if (!el || !ui.monedero) return;
    const n = r ? r.racha : (ui.monedero.racha || 0);
    el.hidden = ui.espectador || n < 1;
    el.textContent = "🔥 " + n;
    el.title = "Manos ganadas seguidas: " + n + " · Récord: " + (ui.monedero.mejorRacha || 0);
    el.classList.toggle("racha-caliente", n >= 3);
    if (r && r.cambio === "+1" && n >= 3) toast((r.nueva ? "¡Récord! " : "") + "🔥 Racha de " + n + " manos ganadas seguidas", "ok");
    if (r && r.cambio === "corte") toast("Se cortó tu racha.", "");
  }

  function mostrarGanancia(n) {
    const pant = $("pantalla-mesa");
    if (!pant || pant.hidden) return;
    const el = document.createElement("div");
    el.className = "ganancia-monedas";
    el.textContent = "+" + n + " 🪙";
    pant.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1900);
  }

  /* ---------- Editor de avatar (con piezas que se compran) ---------- */

  function pintarPreviewAvatar() {
    const caja = $("preview-avatar");
    if (!caja || !Avatar) return;
    caja.innerHTML = Avatar.svg(ui.avatarEdicion || ui.avatar, 132);
    const ed = Avatar.normalizar(ui.avatarEdicion || ui.avatar);
    if ($("nombre-preview-avatar")) {
      $("nombre-preview-avatar").textContent = nombreJugador(false) +
        (ed.cabeza ? " · Con «" + Avatar.LABELS.cabeza[ed.cabeza] + "» se ven el sombrero" + (ed.cabeza === 1 ? "" : " y los lentes") + "; lo demás queda tapado." : "");
    }
    pintarAvisoBloqueadas();
  }

  function piezasBloqueadasEdicion() {
    if (!Tienda || !ui.monedero) return [];
    return Tienda.piezasBloqueadas(ui.monedero, ui.avatarEdicion || ui.avatar);
  }

  function pintarAvisoBloqueadas() {
    const caja = $("aviso-bloqueadas");
    if (!caja) return;
    const bl = piezasBloqueadasEdicion();
    caja.hidden = !bl.length;
    if (!bl.length) return;
    const total = bl.reduce(function (s, p) { return s + p.precio; }, 0);
    const nombres = bl.map(function (p) { return Avatar.LABELS[p.campo][p.valor]; }).join(", ");
    $("texto-bloqueadas").textContent = "Te estás probando: " + nombres + ".";
    const btn = $("btn-comprar-bloqueadas");
    const alcanza = ui.monedero.saldo >= total;
    btn.disabled = !alcanza;
    btn.textContent = alcanza ? "Comprar por 🪙 " + Tienda.formatear(total) : "Te faltan 🪙 " + Tienda.formatear(total - ui.monedero.saldo);
  }

  function comprarBloqueadas() {
    const bl = piezasBloqueadasEdicion();
    const total = bl.reduce(function (s, p) { return s + p.precio; }, 0);
    if (!bl.length || ui.monedero.saldo < total) return;
    bl.forEach(function (p) { Tienda.comprar(ui.monedero, p.id); });
    guardarMonedero();
    guardarAvatar(ui.avatarEdicion);
    sonar("premio");
    toast("¡Comprado! Ya es tuyo.", "ok");
    montarControlesAvatar();
    pintarPreviewAvatar();
  }

  function montarControlesAvatar() {
    const caja = $("controles-avatar");
    if (!caja || !Avatar) return;
    const scroll = caja.scrollTop;
    caja.innerHTML = "";
    if (!ui.avatarEdicion) ui.avatarEdicion = Avatar.normalizar(ui.avatar);
    const a = ui.avatarEdicion;
    (Avatar.ORDEN || Object.keys(Avatar.CAMPOS)).forEach(function (campo) {
      const fila = document.createElement("div");
      fila.className = "fila-avatar-opcion";
      const tit = document.createElement("strong");
      tit.textContent = (Avatar.NOMBRES_CAMPO && Avatar.NOMBRES_CAMPO[campo]) || campo;
      fila.appendChild(tit);
      const chips = document.createElement("div");
      chips.className = "opciones-chips";
      const ops = Avatar.LABELS[campo] || [];
      for (let i = 0; i < Avatar.CAMPOS[campo]; i++) {
        const b = document.createElement("button");
        b.type = "button";
        const nombre = ops[i] || String(i + 1);
        const precio = Avatar.precio ? Avatar.precio(campo, i) : 0;
        const tiene = !Tienda || !ui.monedero || Tienda.tienePieza(ui.monedero, campo, i);
        if (precio > 0 && !tiene) {
          b.className = "bloqueado";
          b.innerHTML = "🔒 " + escapar(nombre) + ' <span class="chip-precio">🪙' + precio + "</span>";
          b.title = (Avatar.esExclusivo && Avatar.esExclusivo(campo, i) ? "Exclusivo: solo con monedas. " : "") + "Cuesta " + precio + " monedas. Tocalo para probártelo.";
          if (Avatar.esExclusivo && Avatar.esExclusivo(campo, i)) b.classList.add("exclusivo");
          b.dataset.precio = String(precio);
        } else {
          b.textContent = nombre;
          if (precio > 0) b.classList.add("comprado");
        }
        if (a[campo] === i) b.classList.add("activo");
        b.dataset.campo = campo;
        b.dataset.valor = String(i);
        b.addEventListener("click", function () {
          ui.avatarEdicion = Avatar.normalizar(ui.avatarEdicion);
          ui.avatarEdicion[campo] = i;
          if (!piezasBloqueadasEdicion().length) guardarAvatar(ui.avatarEdicion);
          montarControlesAvatar();
          pintarPreviewAvatar();
        });
        chips.appendChild(b);
      }
      fila.appendChild(chips);
      caja.appendChild(fila);
    });
    caja.scrollTop = scroll;
  }

  /* ---------- Tienda ---------- */

  function abrirTienda(tab) {
    ui.tabTienda = tab || ui.tabTienda || "avatar";
    mostrar("pantalla-tienda");
    pintarTienda();
  }

  function pintarTienda() {
    if (!Tienda || !ui.monedero) return;
    const tab = ui.tabTienda;
    document.querySelectorAll(".tabs-tienda button").forEach(function (b) { b.classList.toggle("activo", b.dataset.tab === tab); });
    const grilla = $("grilla-tienda");
    const codigos = $("vista-codigos");
    pintarSaldo();
    if (tab === "codigo") {
      grilla.hidden = true;
      codigos.hidden = false;
      $("codigo-monedero").textContent = idMonedero();
      return;
    }
    grilla.hidden = false;
    codigos.hidden = true;
    const base = Avatar.normalizar(ui.avatar);
    let html = "";
    Tienda.catalogo().filter(function (it) { return it.tipo === tab; }).forEach(function (it) {
      const tiene = Tienda.tiene(ui.monedero, it.id);
      let muestra = "";
      let enUso = false;
      if (it.tipo === "avatar") {
        const prueba = Object.assign({}, base);
        prueba[it.campo] = it.valor;
        muestra = Avatar.svg(prueba, 76);
        enUso = base[it.campo] === it.valor;
      } else if (it.tipo === "tema") {
        muestra = '<div class="muestra-tema" data-tema="' + it.id.split(":")[1] + '"><span>♠</span></div>';
        enUso = ui.monedero.tema === it.id;
      } else if (it.tipo === "sonido") {
        muestra = '<div class="muestra-sonido"><span aria-hidden="true">🎵</span><small>' + escapar(it.desc || "") + '</small><button type="button" class="btn chico ghost" data-accion="probar" data-id="' + it.id + '">▶ Probar</button></div>';
        enUso = ui.monedero.sonido === it.id;
      } else {
        muestra = '<div class="muestra-dorso" data-dorso="' + it.id.split(":")[1] + '"><div class="carta-dorso"></div><div class="carta-dorso"></div></div>';
        enUso = ui.monedero.dorso === it.id;
      }
      let boton;
      if (!tiene) boton = '<button type="button" class="btn chico ' + (ui.monedero.saldo >= it.precio ? "primary" : "") + '" data-accion="comprar" data-id="' + it.id + '">🪙 ' + Tienda.formatear(it.precio) + "</button>";
      else if (enUso) boton = '<button type="button" class="btn chico ghost" data-accion="quitar" data-id="' + it.id + '"' + (it.tipo === "avatar" ? "" : " disabled") + ">" + (it.tipo === "avatar" ? "Quitar" : "En uso ✓") + "</button>";
      else boton = '<button type="button" class="btn chico" data-accion="usar" data-id="' + it.id + '">Usar</button>';
      html += '<div class="item-tienda' + (tiene ? " tiene" : "") + (enUso ? " en-uso" : "") + (it.exclusivo ? " exclusivo" : "") + '" data-id="' + it.id + '">' +
        (it.exclusivo ? '<span class="sello-exclusivo" title="Solo se consigue con monedas">★ Exclusivo</span>' : "") +
        '<div class="muestra' + (it.tipo === "sonido" ? " muestra-alta" : "") + '">' + muestra + "</div>" +
        '<div class="nombre-item">' + escapar(it.nombre) + "</div>" +
        (it.tipo === "avatar" ? '<div class="campo-item">' + escapar(Avatar.NOMBRES_CAMPO[it.campo] || "") + "</div>" : "") +
        boton + "</div>";
    });
    grilla.innerHTML = html;
  }

  function accionTienda(accion, id) {
    const it = Tienda.item(id);
    if (!it) return;
    if (accion === "probar") {
      if (!sonidos) return;
      const antes = sonidos.tema();
      const estaba = sonidos.estaActivo();
      sonidos.activar(true);
      sonidos.ponerTema(id);
      sonidos.reproducir("ficha");
      setTimeout(function () { sonidos.reproducir("ganar"); }, 250);
      setTimeout(function () { sonidos.ponerTema(antes); sonidos.activar(estaba); }, 1100);
      return;
    }
    if (accion === "comprar") {
      const r = Tienda.comprar(ui.monedero, id);
      if (!r.ok) { toast(r.error, "err"); return; }
      sonar("premio");
      toast("¡Compraste " + it.nombre + "!", "ok");
      accion = "usar";
    }
    if (accion === "usar") {
      if (it.tipo === "avatar") {
        const a = Avatar.normalizar(ui.avatar);
        a[it.campo] = it.valor;
        guardarAvatar(a);
        ui.avatarEdicion = null;
      } else {
        Tienda.equipar(ui.monedero, id);
      }
    } else if (accion === "quitar" && it.tipo === "avatar") {
      const a = Avatar.normalizar(ui.avatar);
      a[it.campo] = 0;
      guardarAvatar(a);
      ui.avatarEdicion = null;
    }
    guardarMonedero();
    pintarTienda();
  }

  function canjearCodigo(idInput, idAviso) {
    const inp = $(idInput || "input-codigo-monedas");
    const r = Tienda.canjear(ui.monedero, inp ? inp.value : "");
    const aviso = $(idAviso || "aviso-canje");
    if (aviso) {
      aviso.textContent = r.mensaje;
      aviso.className = "hint centro " + (r.ok ? "form-ok" : "form-err");
    }
    if (r.ok) {
      guardarMonedero();
      sonar("premio");
      toast(r.mensaje + " Tenés " + Tienda.formatear(ui.monedero.saldo) + ".", "ok");
    }
  }

  function alternarCodigoMenu() {
    const caja = $("caja-codigo-menu");
    if (!caja) return;
    caja.hidden = !caja.hidden;
    if ($("btn-codigo-menu")) $("btn-codigo-menu").setAttribute("aria-expanded", String(!caja.hidden));
    if (!caja.hidden && $("input-codigo-menu")) $("input-codigo-menu").focus();
  }

  function recuperarMonedero() {
    const inp = $("input-recuperar-monedero");
    const id = String((inp && inp.value) || "").trim().toLowerCase();
    if (!/^[a-f0-9]{24}$/.test(id)) { toast("El código tiene 24 letras y números (0-9, a-f).", "err"); return; }
    fetch("/api/monedero/" + id).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) { toast(d.mensaje || "No encontré ese monedero.", "err"); return; }
      ui.monedero = Tienda.normalizar(d.monedero);
      try { localStorage.setItem(LS_MONEDERO_ID, id); } catch (e) { /* */ }
      guardarMonedero(true);
      guardarAvatar(ui.avatar);
      toast("Recuperaste " + Tienda.formatear(ui.monedero.saldo) + " monedas.", "ok");
      pintarTienda();
    }).catch(function () { toast("No me pude conectar al servidor.", "err"); });
  }

  /* ---------- Mesas en vivo (para mirar) ---------- */

  function abrirMesasVivo() {
    mostrar("pantalla-vivo");
    cargarMesasVivo();
    clearInterval(ui.timerVivo);
    ui.timerVivo = setInterval(function () {
      if ($("pantalla-vivo").hidden) { clearInterval(ui.timerVivo); return; }
      cargarMesasVivo();
    }, 5000);
  }

  function cargarMesasVivo() {
    const lista = $("lista-mesas-vivo");
    const aviso = $("aviso-vivo");
    if (location.protocol === "file:") {
      if (aviso) aviso.textContent = "Para ver mesas en vivo abrí el juego desde el servidor.";
      return;
    }
    fetch("/api/mesas-publicas", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      const mesas = (d && d.mesas) || [];
      if (aviso) aviso.textContent = mesas.length ? "" : "Ahora no hay mesas públicas jugando. Probá en un rato o abrí una con «Mesa con desconocidos».";
      lista.innerHTML = mesas.map(function (m) {
        return '<li class="mesa-vivo">' +
          '<div class="mesa-vivo-info"><strong>' + escapar(m.codigo) + "</strong>" +
          '<span class="mesa-vivo-estado ' + (m.enJuego ? "en-juego" : "") + '">' + (m.enJuego ? "● Jugando" : "Esperando") + "</span>" +
          '<span class="mesa-vivo-datos">👥 ' + m.jugadores + "/" + m.asientos + " · 👁 " + m.espectadores + " · Ciegas " + escapar(m.ciegas) + "</span>" +
          '<span class="mesa-vivo-nombres">' + escapar(m.nombres.join(", ")) + (m.jugadores > m.nombres.length ? "…" : "") + "</span></div>" +
          '<button type="button" class="btn chico primary" data-mirar="' + escapar(m.codigo) + '"' + (m.lleno ? " disabled" : "") + ">" + (m.lleno ? "Llena" : "Mirar") + "</button>" +
          "</li>";
      }).join("");
    }).catch(function () {
      if (aviso) aviso.textContent = "No me pude conectar al servidor.";
    });
  }

  function pintarEspectadores() {
    const el = $("info-espectadores");
    if (!el) return;
    const n = ui.espectadores || 0;
    el.hidden = !(ui.modo === "online" && n > 0);
    el.textContent = "👁 " + n;
    el.title = n === 1 ? "1 persona mirando" : n + " personas mirando";
  }

  /* ---------- Navegación del menú ---------- */

  function irMenu() {
    detenerPartidaLocal();
    cerrarWS(false);
    ui.modo = "menu";
    ui.espectador = false;
    ui.espectadores = 0;
    pintarEspectadores();
    pintarSaldo();
    ui.turnoLimite = null;
    ui.turnoDe = null;
    ui.ultimaCiegaGrande = null;
    if ($("panel-historial")) $("panel-historial").hidden = true;
    limpiarAvisos();
    mostrar("pantalla-menu");
    mostrarInvitacionPendiente();
  }

  function irSolo() {
    mostrar("pantalla-solo");
  }

  function irOnline() {
    $("aviso-online").textContent = "";
    if (location.protocol === "file:") {
      $("aviso-online").textContent =
        "Para jugar online tienes que arrancar el servidor (npm start) y abrir http://localhost:3000 en el navegador. El modo solo sí funciona abriendo este archivo.";
    }
    const codigo = codigoDesdeUbicacion();
    if (codigo && $("input-codigo")) $("input-codigo").value = codigo;
    mostrar("pantalla-online");
  }

  function entrarInvitacion() {
    const codigo = codigoDesdeUbicacion() || extraerCodigo(($("input-codigo") && $("input-codigo").value) || "");
    if (!codigo) { mostrarError("No encuentro el código de la mesa."); return; }
    if ($("input-codigo")) $("input-codigo").value = codigo;
    conNombreYAvatar(function () { unirseCodigo(); }, { saltarAvatar: true });
  }

  function jugarConAmigos() {
    conNombreYAvatar(function () { crearPrivada(); });
  }

  function jugarPublica() {
    conNombreYAvatar(function () { unirsePublica(); });
  }

  /* ---------- Modo solo ---------- */

  function empezarSolo() {
    detenerPartidaLocal();
    const n = asientosElegidos("asientos-solo");
    const fichas = fichasElegidas("solo");
    const ciegas = Motor.ciegasPara(fichas);
    const mesa = new Motor.Mesa({
      asientos: n,
      fichasIniciales: ciegas.fichasIniciales,
      ciegaPequena: ciegas.ciegaPequena,
      ciegaGrande: ciegas.ciegaGrande,
      subirCiegasCada: torneoElegido("solo") ? Motor.MANOS_POR_NIVEL : 0
    });
    ui.mesa = mesa;
    ui.tuId = "humano";
    ui.modo = "solo";
    ui.codigo = null;
    ui.ultimaCiegaGrande = null;
    ui.recargaSoloPendiente = 0;
    ui.puestoPremiado = false;
    if (ui.historial) ui.historial.limpiar();

    mesa.sentar({ id: "humano", nombre: nombreJugador(false), tipo: "humano", asiento: 0, fichas: ciegas.fichasIniciales, avatar: guardarAvatar(ui.avatar) });
    const usados = [nombreJugador(false)];
    const pers = Bots.repartirPersonalidades(n - 1);
    for (let i = 1; i < n; i++) {
      const bot = Bots.crearBot(usados, pers[i - 1]);
      usados.push(bot.nombre);
      mesa.sentar({ id: "bot-" + i, nombre: bot.nombre, tipo: "bot", personalidad: bot.personalidad, asiento: i, fichas: ciegas.fichasIniciales, avatar: Avatar ? Avatar.aleatorio(bot.nombre) : null });
    }

    mesa.on(alEventoLocal);
    $("info-sala").textContent = "Solo · " + n + " asientos";
    if ($("btn-compartir-mesa")) $("btn-compartir-mesa").hidden = true;
    $("info-ciegas").textContent = "Ciegas " + mesa.ciegaPequena + " / " + mesa.ciegaGrande;
    mostrar("pantalla-mesa");
    renderMesa(mesa.estadoPublico(ui.tuId));
    mesa.iniciarMano();
  }

  function detenerPartidaLocal() {
    if (ui.timerBot) clearTimeout(ui.timerBot);
    if (ui.timerNuevaMano) clearTimeout(ui.timerNuevaMano);
    ui.timerBot = null;
    ui.timerNuevaMano = null;
    ui.mesa = null;
    ui.cola = [];
    ui.procesandoCola = false;
    ui.animando = false;
  }

  function alEventoLocal(ev) {
    ui.cola.push(ev);
    if (ui.procesandoCola) return;
    ui.procesandoCola = true;
    setTimeout(procesarCola, 0);
  }

  async function procesarCola() {
    while (ui.cola.length > 0) {
      const ev = ui.cola.shift();
      await manejarEvento(ev);
    }
    ui.procesandoCola = false;
    programarBotsOEsperar();
  }

  async function manejarEvento(ev) {
    if (!ui.mesa) return;
    const estado = ui.mesa.estadoPublico(ui.tuId);
    sonarEvento(ev);

    if (ev.tipo === "mano-iniciada") {
      ui.animando = true;
      $("mensaje-mesa").className = "";
      $("mensaje-mesa").textContent = "Don Luis reparte las cartas…";
      renderMesa(estado, { ocultarPrivadas: true, vaciarComunitarias: true });
      await animarReparto(ev.secuenciaReparto);
      ui.animando = false;
      renderMesa(ui.mesa.estadoPublico(ui.tuId));
      $("mensaje-mesa").textContent = "Preflop · a hablar.";
      ui.mesa.empezarApuestas();
      return;
    }

    if (ev.tipo === "calle") {
      ui.animando = true;
      const etiqueta = ev.calle === "flop" ? "Flop" : ev.calle === "turn" ? "Turn" : "River";
      $("mensaje-mesa").textContent = etiqueta + "…";
      await animarFichasAlBote();
      await animarComunitarias(ev.nuevas);
      ui.animando = false;
      renderMesa(ui.mesa.estadoPublico(ui.tuId), { voltear: true, voltearDesde: (ui.mesa.comunitarias.length - (ev.nuevas ? ev.nuevas.length : 0)) });
      pintarLineaCalle(etiqueta, ui.mesa.estadoPublico(ui.tuId));
      return;
    }

    if (ev.tipo === "accion") {
      renderMesa(estado);
      return;
    }

    if (ev.tipo === "turno") {
      renderMesa(estado);
      return;
    }

    if (ev.tipo === "showdown" || ev.tipo === "ganador-sin-showdown") {
      if (ev.tipo === "showdown") await animarFichasAlBote();
      renderMesa(estado);
      const msg = $("mensaje-mesa");
      msg.textContent = estado.mensaje || "";
      msg.className = "premio";
      registrarHistorial(estado);
      celebrar(estado);
      programarNuevaMano();
      return;
    }

    renderMesa(estado);
  }

  function programarNuevaMano() {
    if (ui.timerNuevaMano) clearTimeout(ui.timerNuevaMano);
    ui.timerNuevaMano = setTimeout(function () {
      if (ui.modo === "solo" && ui.mesa) {
        if (ui.recargaSoloPendiente) {
          const yo = ui.mesa.jugadorPorId(ui.tuId);
          if (yo) yo.fichas += ui.recargaSoloPendiente;
          ui.recargaSoloPendiente = 0;
        }
        ui.mesa.iniciarMano();
      }
    }, 5500);
  }

  function programarBotsOEsperar() {
    if (!ui.mesa || ui.modo !== "solo" || ui.animando) return;
    const id = ui.mesa.turnoId;
    if (!id) return;
    const j = ui.mesa.jugadorPorId(id);
    if (!j || j.tipo !== "bot") {
      renderMesa(ui.mesa.estadoPublico(ui.tuId));
      return;
    }
    if (ui.timerBot) clearTimeout(ui.timerBot);
    const delay = 550 + Math.random() * 900;
    ui.timerBot = setTimeout(function () {
      if (!ui.mesa || ui.mesa.turnoId !== id) return;
      const legales = ui.mesa.accionesLegales(id);
      const decision = Bots.decidir(legales, j, ui.mesa.estadoPublico(id));
      ui.mesa.accion(id, decision.tipo, decision.cantidad);
      chatPersonalidad(j, Bots.momentoDeAccion(decision.tipo));
    }, delay);
  }

  /* ---------- Dibujo de la mesa ---------- */

  function htmlCarta(carta, extraClase) {
    if (!carta || carta.oculta) return htmlDorso(extraClase);
    const clases = ["carta"];
    if (carta.color === "roja") clases.push("roja");
    if (extraClase) clases.push(extraClase);
    const fill = carta.color === "roja" ? "#c41e3a" : "#161616";
    const rango = escapar(String(carta.texto || ""));
    const palo = carta.palo || "";
    const esDiez = rango === "10";
    const fsRango = esDiez ? 12 : 15;
    const xRango = esDiez ? 4.5 : 6;
    function esquina() {
      return (
        '<text class="rango-svg" x="' + xRango + '" y="15" font-size="' + fsRango + '" text-anchor="start">' + rango + "</text>" +
        '<text class="mini-palo-svg" x="' + (esDiez ? 10 : 10.5) + '" y="26" font-size="11" text-anchor="middle">' + palo + "</text>"
      );
    }
    return (
      '<div class="' + clases.join(" ") + '" aria-label="' + escapar(rango + " " + palo) + '">' +
        '<svg class="cara-carta" viewBox="0 0 70 98" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' +
          '<g fill="' + fill + '" font-family="ui-sans-serif, system-ui, -apple-system, \'Segoe UI\', sans-serif" font-weight="800" style="font-variant-numeric:tabular-nums">' +
            esquina() +
            '<text class="palo-centro-svg" x="35" y="58" font-size="28" text-anchor="middle" dominant-baseline="middle">' + palo + "</text>" +
            '<g transform="rotate(180 35 49)">' + esquina() + "</g>" +
          "</g>" +
        "</svg>" +
      "</div>"
    );
  }

  function htmlDorso(extraClase) {
    return '<div class="carta-dorso' + (extraClase ? " " + extraClase : "") + '"></div>';
  }

  function esVerticalEstrecho() {
    return window.matchMedia("(orientation: portrait) and (max-width: 800px)").matches;
  }

  function esHorizontalBajo() {
    return window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches;
  }

  function actualizarOrientacionMesa() {
    const mesa = $("mesa-oval");
    if (!mesa) return;
    mesa.classList.toggle("vertical", esVerticalEstrecho());
  }

  function zonaDeAngulo(ang, indice) {
    if (indice === 0) return "abajo";
    const c = Math.cos(ang);
    if (c > 0.45) return "abajo";
    if (c < -0.35) return "arriba";
    return "lado";
  }

  function htmlPilaFichas(cantidad, conValor) {
    if (!cantidad) return "";
    const n = Math.min(5, Math.max(2, 1 + Math.round(Math.log10(cantidad + 1))));
    let d = '<span class="pila-fichas">';
    for (let i = 0; i < n; i++) {
      d += '<span class="disco-ficha" style="background:' + colorFicha(i, cantidad) + '"></span>';
    }
    if (conValor) d += '<span class="pila-valor">' + formatearFichas(cantidad) + "</span>";
    d += "</span>";
    return d;
  }

  function estiloPx(x, y) {
    return "left:" + Math.round(x) + "px;top:" + Math.round(y) + "px;";
  }

  function instalarObservadorMesa() {
    if (ui._ro || !window.ResizeObserver) return;
    const esc = $("escenario");
    if (!esc) return;
    ui._ro = new ResizeObserver(function () {
      if (ui.estado && $("pantalla-mesa") && !$("pantalla-mesa").hidden) {
        aplicarLayout(ui.estado);
      }
    });
    ui._ro.observe(esc);
  }

  function medidasFicha(mesa, total) {
    const W = mesa.clientWidth;
    const H = mesa.clientHeight;
    const vertical = esVerticalEstrecho();
    const s = vertical ? Math.min(W / 720, H / 1200) : Math.min(W / 1200, H / 720);
    const compacto = s < 0.52 || H < 400 || W < 760;
    const nFactor = (total >= 15 ? 0.74 : (total >= 10 ? 0.88 : 1)) * (compacto ? 0.82 : 1) * (H < 340 || W < 640 ? 0.86 : 1);
    const cardW = clamp(Math.round(s * 56 * nFactor), 12, 52);
    const cardH = Math.round(cardW * 1.38);
    // Tus cartas tienen que leerse siempre: su tamaño depende de la pantalla, no de
    // cuántos asientos hay (en la mesa de 15 del teléfono antes quedaban de 18 px).
    const ownW = clamp(Math.max(Math.round(cardW * 1.18), Math.round(vertical ? W * 0.09 : H * 0.08)), 28, 62);
    const ownH = Math.round(ownW * 1.38);
    const commW = clamp(Math.round(s * 62 * (compacto ? 0.9 : 1)), 14, 68);
    const commH = Math.round(commW * 1.4);
    const infoW = clamp(Math.round(s * (total >= 15 ? 118 : (total >= 10 ? 112 : 126)) * nFactor), total >= 15 ? (H < 400 ? 38 : 42) : 46, 138);
    // Avatar del asiento: más grande en la compu (v12), chico en el teléfono y en mesas de 15
    const tamAvatar = clamp(Math.round(s * (total >= 15 ? 36 : 48) * (compacto ? 0.78 : 1)), total >= 15 ? 16 : 20, 50);
    const infoH = clamp(Math.round(s * (compacto ? 44 : 52) * (total >= 15 ? 0.86 : 1)), 22, 54) + Math.round(tamAvatar / 2);
    const betW = clamp(Math.round(s * 52), 28, 72);
    const betH = clamp(Math.round(s * 20), 12, 24);
    const dealerW = clamp(Math.round(s * 108 * (compacto ? 0.85 : 1)), 32, 112);
    const dealerH = Math.round(dealerW * 1.0);
    const vaso = clamp(Math.round(s * 22), 6, 22);
    return {
      W: W, H: H, s: s, vertical: vertical,
      cardW: cardW, cardH: cardH, ownW: ownW, ownH: ownH,
      commW: commW, commH: commH, infoW: infoW, infoH: infoH, tamAvatar: tamAvatar,
      betW: betW, betH: betH, dealerW: dealerW, dealerH: dealerH, vaso: vaso
    };
  }

  function aplicarVariablesCarta(mesa, m) {
    mesa.style.setProperty("--carta-c", m.commW + "px");
    mesa.style.setProperty("--carta-c-h", m.commH + "px");
    mesa.style.setProperty("--carta-j", m.cardW + "px");
    mesa.style.setProperty("--carta-j-h", m.cardH + "px");
    mesa.style.setProperty("--carta-p", m.ownW + "px");
    mesa.style.setProperty("--carta-p-h", m.ownH + "px");
    const minPropio = (m.W < 520 || m.H < 320) ? Math.max(m.infoW, 72) : 92;
    m.infoW0 = Math.min(Math.max(m.infoW, minPropio), Math.round(m.W * 0.26));
    mesa.style.setProperty("--ancho-info", m.infoW + "px");
    mesa.style.setProperty("--ancho-propio", m.infoW0 + "px");
    mesa.style.setProperty("--tam-avatar", m.tamAvatar + "px");
  }

  /** Asiento que se dibuja abajo: el tuyo si estás sentado (así tus cartas siempre van abajo y grandes). */
  function asientoAbajo(estado) {
    if (ui.espectador || !estado) return 0;
    const yo = (estado.jugadores || []).find(function (j) { return j.id === ui.tuId; });
    return yo && typeof yo.asiento === "number" ? yo.asiento : 0;
  }

  function calcularLayout(estado, mesa) {
    const total = estado.asientosTotales;
    const base = asientoAbajo(estado);
    const m = medidasFicha(mesa, total);
    const W = m.W, H = m.H;
    const cx = W / 2, cy = H / 2;
    const vertical = m.vertical;
    const pad = 3;

    aplicarVariablesCarta(mesa, m);

    const insetX = vertical ? 0.115 : 0.07;
    const insetY = vertical ? 0.07 : 0.115;
    const feltRx = W * (0.5 - insetX);
    const feltRy = H * (0.5 - insetY);

    const infoRx = Math.min(feltRx + m.infoW * 0.08, W / 2 - m.infoW / 2 - pad);
    const infoRy = Math.min(feltRy + m.infoH * 0.02, H / 2 - m.infoH / 2 - pad);

    const dealer = caja(cx, m.dealerH / 2 + 4, m.dealerW, m.dealerH);

    let commAncho = 5 * m.commW + 4 * Math.max(3, Math.round(m.s * 8));
    if (commAncho > W * 0.42) {
      const fit = Math.floor((W * 0.42 - 16) / 5);
      m.commW = clamp(fit, 12, m.commW);
      m.commH = Math.round(m.commW * 1.4);
      commAncho = 5 * m.commW + 16;
      mesa.style.setProperty("--carta-c", m.commW + "px");
      mesa.style.setProperty("--carta-c-h", m.commH + "px");
    }
    const centroH = m.commH + 16 + m.betH;
    const centro = caja(cx, cy + H * 0.04, commAncho + 8, centroH);

    const gap = vertical ? (total >= 15 ? 0.9 : 1.05) : (total >= 15 ? 0.62 : (total >= 10 ? 0.92 : 0.82));

    const seats = [];
    for (let v = 0; v < total; v++) {
      // v = lugar en pantalla (0 = abajo, el tuyo); i = asiento real
      const i = (v + base) % total;
      const propio = v === 0;
      const ang = anguloAsiento(v, total, gap);
      const ux = Math.sin(ang);
      const uy = Math.cos(ang);
      const zona = zonaDeAngulo(ang, v);
      let ix = cx + ux * infoRx;
      let iy = cy + uy * infoRy;
      const iW = (propio ? m.infoW0 : m.infoW);
      ix = clamp(ix, iW / 2 + pad, W - iW / 2 - pad);
      iy = clamp(iy, m.infoH / 2 + pad, H - m.infoH / 2 - pad);
      const info = caja(ix, iy, iW, m.infoH);
      const rSeat = Math.hypot(ix - cx, iy - cy);

      const cW = (propio ? m.ownW * 1.7 : m.cardW * 1.7);
      const cH = (propio ? m.ownH : m.cardH);
      const dAng = (m.infoW / 2 + 10 + cW / 2) / Math.max(36, rSeat);

      function cardsEn(angC) {
        const rx = infoRx;
        const ry = infoRy;
        let x = clamp(cx + Math.sin(angC) * rx, cW / 2 + pad, W - cW / 2 - pad);
        let y = clamp(cy + Math.cos(angC) * ry, cH / 2 + pad, H - cH / 2 - pad);
        return caja(x, y, cW, cH);
      }
      function pena(c, angC) {
        let p = 0;
        if (sePisan(c, info, 3)) p += 90;
        if (sePisan(c, centro, 3)) p += 120;
        if (sePisan(c, dealer, 3)) p += 100;
        const out = Math.max(0, pad - c.left) + Math.max(0, c.right - (W - pad)) +
          Math.max(0, pad - c.top) + Math.max(0, c.bottom - (H - pad));
        p += out * 8;
        for (let k = 0; k < seats.length; k++) {
          if (sePisan(c, seats[k].info, 3)) p += 70;
          if (sePisan(c, seats[k].cards, 3)) p += 70;
        }
        return p;
      }
      let cards, angCards;
      // Tus cartas van siempre justo encima de tu nombre (antes, en la compu, se iban al costado
      // y en la mesa de 15 terminaban tapando o pegadas a otro jugador).
      if (propio) {
        cards = elegirCartasPropias(info, cW, cH, W, H, pad, centro, dealer, m.betH, [], null);
        angCards = ang;
      } else {
        const cand = [];
        const offs = [dAng, -dAng, dAng * 1.2, -dAng * 1.2, dAng * 1.45, -dAng * 1.45];
        for (let o = 0; o < offs.length; o++) {
          const a = ang + offs[o];
          const c = cardsEn(a);
          cand.push({ c: c, p: pena(c, a), a: a });
        }
        cand.sort(function (a, b) { return a.p - b.p; });
        cards = cand[0].c;
        angCards = cand[0].a;
      }

      const rNameInner = Math.max(24, rSeat - Math.max(m.infoW, m.infoH) / 2 - 6);
      const rCent = Math.max(
        16,
        Math.min(
          (centro.w / 2 + m.betH / 2 + 6) / Math.max(0.15, Math.abs(ux)),
          (centro.h / 2 + m.betH / 2 + 6) / Math.max(0.15, Math.abs(uy))
        )
      );
      const rInner = rCent;
      const rOuter = rNameInner;
      const rBet = rOuter >= rInner ? rOuter - 2 : (rInner + rOuter) / 2;

      seats.push({
        i: i, v: v, propio: propio, ang: ang, ux: ux, uy: uy, zona: zona, rSeat: rSeat, angCards: angCards,
        info: info, cards: cards,
        rLo: rOuter, rHi: rInner, rBet: rBet,
        bet: caja(cx + ux * rBet, cy + uy * rBet, m.betW, m.betH)
      });
    }

    return { m: m, cx: cx, cy: cy, dealer: dealer, centro: centro, seats: seats, pad: pad, W: W, H: H, infoRx: infoRx, infoRy: infoRy };
  }

  function resolverNombres(L) {
    const pad = L.pad;
    for (let iter = 0; iter < 20; iter++) {
      let movio = false;
      for (let i = 0; i < L.seats.length; i++) {
        const A = L.seats[i];
        const fijos = [L.dealer, L.centro];
        for (let j = 0; j < L.seats.length; j++) {
          if (j !== i) fijos.push(L.seats[j].info);
        }
        for (let k = 0; k < fijos.length; k++) {
          const o = fijos[k];
          if (!o || !sePisan(A.info, o, 3)) continue;
          let dx = A.info.x - o.x;
          let dy = A.info.y - o.y;
          if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) { dx = A.ux; dy = A.uy; }
          const len = Math.hypot(dx, dy) || 1;
          const nx = clamp(A.info.x + (dx / len) * 4, A.info.w / 2 + pad, L.W - A.info.w / 2 - pad);
          const ny = clamp(A.info.y + (dy / len) * 4, A.info.h / 2 + pad, L.H - A.info.h / 2 - pad);
          A.info = caja(nx, ny, A.info.w, A.info.h);
          movio = true;
        }
      }
      if (!movio) break;
    }
  }

  function posBetXY(s, L, x, y) {
    const bw = s.mBetW || L.m.betW;
    const bh = s.mBetH || L.m.betH;
    x = clamp(x, bw / 2 + 2, L.W - bw / 2 - 2);
    y = clamp(y, bh / 2 + 2, L.H - bh / 2 - 2);
    s.bet = caja(x, y, bw, bh);
    s.rBet = Math.hypot(x - L.cx, y - L.cy);
  }

  function posBet(s, L, r, tOff) {
    tOff = tOff || 0;
    const x = L.cx + s.ux * r + (-s.uy) * tOff;
    const y = L.cy + s.uy * r + (s.ux) * tOff;
    s.tOff = tOff;
    posBetXY(s, L, x, y);
  }

  function betChoca(s, L, extraSeats) {
    if (sePisan(s.bet, L.centro, 3) || sePisan(s.bet, L.dealer, 3)) return true;
    if (sePisan(s.bet, s.info, 3) || sePisan(s.bet, s.cards, 3)) return true;
    const lista = extraSeats || L.seats;
    for (let i = 0; i < lista.length; i++) {
      const o = lista[i];
      if (o.i === s.i) continue;
      if (o.info && sePisan(s.bet, o.info, 3)) return true;
      if (o.cards && sePisan(s.bet, o.cards, 3)) return true;
      if (o.tieneApuesta && o.bet && sePisan(s.bet, o.bet, 4)) return true;
    }
    return false;
  }

  function colocarApuesta(s, L, conBet) {
    const rMin = Math.min(s.rHi, s.rLo);
    const rMax = Math.max(s.rHi, s.rLo);
    const rPref = s.rLo >= s.rHi ? s.rLo - 2 : (s.rHi + s.rLo) / 2;
    const radios = [];
    for (let r = rPref; r >= rMin; r -= 3) radios.push(r);
    for (let r = rPref + 3; r <= rMax + 12; r += 3) radios.push(r);
    const offs = [0, 8, -8, 16, -16, 24, -24, 32, -32, 42, -42, 54, -54];
    for (let oi = 0; oi < offs.length; oi++) {
      for (let ri = 0; ri < radios.length; ri++) {
        posBet(s, L, radios[ri], offs[oi]);
        if (!betChoca(s, L, conBet)) return;
      }
    }
  }

  function resolverApuestas(L, estado) {
    const conBet = [];
    for (let i = 0; i < L.seats.length; i++) {
      const j = (estado.jugadores || []).find(function (p) { return p.asiento === L.seats[i].i; });
      if (j && j.apuestaRonda > 0) {
        L.seats[i].tieneApuesta = true;
        conBet.push(L.seats[i]);
      } else {
        L.seats[i].tieneApuesta = false;
      }
    }
    for (let i = 0; i < conBet.length; i++) colocarApuesta(conBet[i], L, conBet);
    for (let iter = 0; iter < 12; iter++) {
      let movio = false;
      for (let a = 0; a < conBet.length; a++) {
        for (let b = a + 1; b < conBet.length; b++) {
          if (!sePisan(conBet[a].bet, conBet[b].bet, 4)) continue;
          conBet[b].tOff = (conBet[b].tOff || 0) + 8;
          posBet(conBet[b], L, conBet[b].rBet, conBet[b].tOff);
          if (betChoca(conBet[b], L, conBet)) colocarApuesta(conBet[b], L, conBet);
          movio = true;
        }
      }
      if (!movio) break;
    }
  }

  function resolverPiezas(L) {
    const m = L.m, pad = L.pad;
    function cardsEn(S, angC) {
      const cW = S.cards.w, cH = S.cards.h;
      const x = clamp(L.cx + Math.sin(angC) * L.infoRx, cW / 2 + pad, L.W - cW / 2 - pad);
      const y = clamp(L.cy + Math.cos(angC) * L.infoRy, cH / 2 + pad, L.H - cH / 2 - pad);
      return caja(x, y, cW, cH);
    }
    for (let iter = 0; iter < 20; iter++) {
      let movio = false;
      for (let i = 0; i < L.seats.length; i++) {
        const S = L.seats[i];
        if (S.propio) continue; // tus cartas no se mueven: se corren las de los demás
        const others = [L.centro, L.dealer, S.info];
        for (let j = 0; j < L.seats.length; j++) {
          if (j === i) continue;
          others.push(L.seats[j].info);
          others.push(L.seats[j].cards);
        }
        let choca = false;
        for (let k = 0; k < others.length; k++) {
          if (others[k] && sePisan(S.cards, others[k], 3)) { choca = true; break; }
        }
        if (!choca) continue;
        const base = S.angCards != null ? S.angCards : S.ang;
        const tryA = [base + 0.06, base - 0.06, base + 0.12, base - 0.12, base + 0.18, base - 0.18, base + 0.25, base - 0.25];
        let best = null, bestP = 1e9;
        for (let t = 0; t < tryA.length; t++) {
          const c = cardsEn(S, tryA[t]);
          let p = 0;
          for (let k = 0; k < others.length; k++) {
            if (others[k] && sePisan(c, others[k], 3)) p += 10;
          }
          const out = Math.max(0, pad - c.left) + Math.max(0, c.right - (L.W - pad)) +
            Math.max(0, pad - c.top) + Math.max(0, c.bottom - (L.H - pad));
          p += out * 5;
          if (p < bestP) { bestP = p; best = { c: c, a: tryA[t] }; }
        }
        if (best) {
          S.cards = best.c;
          S.angCards = best.a;
          movio = true;
        }
      }
      if (!movio) break;
    }
  }

  /**
   * Dónde van tus cartas: encima de tu nombre si queda lugar para tu apuesta, si no al costado
   * (izquierda o derecha, donde molesten menos). Siempre pegadas a tu asiento.
   */
  function elegirCartasPropias(info, w, h, W, H, pad, centro, dealer, betH, seats, yo) {
    function en(x, y) {
      return caja(clamp(x, w / 2 + pad, W - w / 2 - pad), clamp(y, h / 2 + pad, H - h / 2 - pad), w, h);
    }
    const cands = [
      { c: en(info.x, info.top - 5 - h / 2), extra: 0, arriba: true },
      { c: en(info.left - 6 - w / 2, info.y), extra: 6 },
      { c: en(info.right + 6 + w / 2, info.y), extra: 6 }
    ];
    let mejor = null;
    for (let k = 0; k < cands.length; k++) {
      const o = cands[k];
      let p = o.extra;
      if (sePisan(o.c, info, 2)) p += 400;
      if (centro && sePisan(o.c, centro, 3)) p += 300;
      if (dealer && sePisan(o.c, dealer, 3)) p += 300;
      if (o.arriba && centro) p += Math.max(0, (betH + 10) - (o.c.top - centro.bottom)) * 0.5;
      for (let q = 0; q < seats.length; q++) {
        const T = seats[q];
        if (T === yo) continue;
        if (T.info && sePisan(o.c, T.info, 3)) p += 60;
        if (T.cards && sePisan(o.c, T.cards, 3)) p += 40;
      }
      if (!mejor || p < mejor.p) mejor = { c: o.c, p: p };
    }
    return mejor.c;
  }

  function unirCajas(a, b) {
    const l = Math.min(a.left, b.left), t = Math.min(a.top, b.top);
    const r = Math.max(a.right, b.right), d = Math.max(a.bottom, b.bottom);
    return caja((l + r) / 2, (t + d) / 2, r - l, d - t);
  }

  function separarTodo(L) {
    const pad = L.pad;
    function apply(obj, sx, sy) {
      if (!obj || !obj.b || obj.fixed) return 0;
      const w = obj.b.w, h = obj.b.h;
      const nx = clamp(obj.b.x + sx, w / 2 + pad, L.W - w / 2 - pad);
      const ny = clamp(obj.b.y + sy, h / 2 + pad, L.H - h / 2 - pad);
      const moved = Math.abs(nx - obj.b.x) + Math.abs(ny - obj.b.y);
      if (obj.k === "grupo") {
        // tu nombre y tus cartas se mueven juntos: nunca se separan
        const dx = nx - obj.b.x, dy = ny - obj.b.y;
        obj.s.info = caja(obj.s.info.x + dx, obj.s.info.y + dy, obj.s.info.w, obj.s.info.h);
        obj.s.cards = caja(obj.s.cards.x + dx, obj.s.cards.y + dy, obj.s.cards.w, obj.s.cards.h);
      }
      obj.b = caja(nx, ny, w, h);
      if (obj.k === "info") obj.s.info = obj.b;
      if (obj.k === "cards") obj.s.cards = obj.b;
      if (obj.k === "bet") obj.s.bet = obj.b;
      return moved;
    }
    for (let iter = 0; iter < 120; iter++) {
      const arr = [{ k: "centro", b: L.centro, fixed: true }, { k: "dealer", b: L.dealer, fixed: true }];
      for (let i = 0; i < L.seats.length; i++) {
        const s = L.seats[i];
        if (s.propio && s.cards) {
          // Tu nombre y tus cartas son un solo bloque (antes las cartas se iban solas a otro asiento)
          // con un margen alrededor, para que nadie quede pegado y se note de quién son las cartas
          const u = unirCajas(s.info, s.cards);
          arr.push({ k: "grupo", s: s, b: caja(u.x, u.y, u.w + 16, u.h + 4), fixed: false });
        } else {
          arr.push({ k: "info", s: s, b: s.info, fixed: false });
          arr.push({ k: "cards", s: s, b: s.cards, fixed: false });
        }
        if (s.tieneApuesta && s.bet) arr.push({ k: "bet", s: s, b: s.bet, fixed: false });
      }
      let hits = 0;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const A = arr[i], B = arr[j];
          if (!A.b || !B.b || !sePisan(A.b, B.b, 4)) continue;
          hits++;
          const ox = Math.min(A.b.right, B.b.right) - Math.max(A.b.left, B.b.left) + 5;
          const oy = Math.min(A.b.bottom, B.b.bottom) - Math.max(A.b.top, B.b.top) + 5;
          let px = 0, py = 0;
          const step = 10;
          if (ox < oy) px = (A.b.x >= B.b.x ? 1 : -1) * Math.min(ox, step) / 2;
          else py = (A.b.y >= B.b.y ? 1 : -1) * Math.min(oy, step) / 2;
          if (A.fixed && !B.fixed) apply(B, -px * 2, -py * 2);
          else if (B.fixed && !A.fixed) apply(A, px * 2, py * 2);
          else if (!A.fixed && !B.fixed) {
            apply(A, px, py);
            apply(B, -px, -py);
            if (A.b && B.b && sePisan(A.b, B.b, 4)) {
              const qx = px ? 0 : (A.b.x >= B.b.x ? 1 : -1) * 6;
              const qy = py ? 0 : (A.b.y >= B.b.y ? 1 : -1) * 6;
              apply(A, qx, qy);
              apply(B, -qx, -qy);
            }
          }
        }
      }
      if (!hits) break;
    }
  }

  function aplicarLayout(estado) {

    const mesa = $("mesa-oval");
    if (!mesa || !estado) return;
    actualizarOrientacionMesa();
    if (mesa.clientWidth < 40 || mesa.clientHeight < 40) return;
    const L = calcularLayout(estado, mesa);
    resolverNombres(L);
    resolverApuestas(L, estado);
    resolverPiezas(L);

    const cr = $("crupier");
    if (cr) {
      cr.style.left = Math.round(L.dealer.x) + "px";
      cr.style.top = Math.round(L.dealer.y) + "px";
      cr.style.width = Math.round(L.m.dealerW) + "px";
      cr.style.transform = "translate(-50%, -50%)";
    }
    const centro = $("centro-mesa");
    if (centro) {
      centro.style.left = Math.round(L.centro.x) + "px";
      centro.style.top = Math.round(L.centro.y) + "px";
    }

    for (let i = 0; i < L.seats.length; i++) {
      const S = L.seats[i];
      const info = document.querySelector('.pieza-info[data-asiento="' + S.i + '"]');
      const cartas = document.querySelector('.pieza-cartas[data-asiento="' + S.i + '"]');
      const ap = document.querySelector('.pieza-apuesta[data-asiento="' + S.i + '"]');
      if (info) { info.style.left = Math.round(S.info.x) + "px"; info.style.top = Math.round(S.info.y) + "px"; }
      if (cartas) { cartas.style.left = Math.round(S.cards.x) + "px"; cartas.style.top = Math.round(S.cards.y) + "px"; }
      if (ap) { ap.style.left = Math.round(S.bet.x) + "px"; ap.style.top = Math.round(S.bet.y) + "px"; }
      const globo = document.querySelector('.pieza-globo[data-asiento="' + S.i + '"]');
      if (globo) {
        globo.style.left = Math.round(S.info.x) + "px";
        globo.style.top = Math.round(S.info.y - S.info.h / 2 - 16) + "px";
      }
    }

    const vasos = $("porta-vasos");
    if (vasos) {
      const insetX = L.m.vertical ? 0.10 : 0.055;
      const insetY = L.m.vertical ? 0.055 : 0.10;
      const vRx = L.W * (0.5 - insetX);
      const vRy = L.H * (0.5 - insetY);
      const els = vasos.querySelectorAll(".porta-vaso");
      for (let i = 0; i < els.length && i < L.seats.length; i++) {
        const S = L.seats[i];
        els[i].style.left = Math.round(L.cx + S.ux * vRx) + "px";
        els[i].style.top = Math.round(L.cy + S.uy * vRy) + "px";
        els[i].style.width = L.m.vaso + "px";
        els[i].style.height = L.m.vaso + "px";
      }
    }
    ajustarDesdeMedidas(L, estado);
    ajustarNombres();
    ui._layout = L;
  }

  function cajaDesdeEl(el, mesaRect) {
    const r = el.getBoundingClientRect();
    return {
      x: r.left - mesaRect.left + r.width / 2,
      y: r.top - mesaRect.top + r.height / 2,
      w: r.width,
      h: r.height,
      left: r.left - mesaRect.left,
      right: r.right - mesaRect.left,
      top: r.top - mesaRect.top,
      bottom: r.bottom - mesaRect.top
    };
  }

  /** Caja del jugador incluyendo el avatar que sobresale arriba (v12). */
  function cajaInfoConAvatar(info, mr) {
    const b = cajaDesdeEl(info, mr);
    const av = info.querySelector && info.querySelector(".avatar-asiento");
    if (!av) return b;
    const a = cajaDesdeEl(av, mr);
    const left = Math.min(b.left, a.left), right = Math.max(b.right, a.right);
    const top = Math.min(b.top, a.top), bottom = Math.max(b.bottom, a.bottom);
    return { x: (left + right) / 2, y: (top + bottom) / 2, w: right - left, h: bottom - top, left: left, right: right, top: top, bottom: bottom };
  }

  /** Caja que cubre las cartas de verdad (con margen negativo se salen un poco del contenedor). */
  function cajaCartasReal(cont, mr) {
    const hijos = cont.querySelectorAll(".carta, .carta-dorso");
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (let k = 0; k < hijos.length; k++) {
      const q = hijos[k].getBoundingClientRect();
      if (!q.width || !q.height) continue;
      l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    }
    if (!isFinite(l)) return cajaDesdeEl(cont, mr);
    return caja((l + r) / 2 - mr.left, (t + b) / 2 - mr.top, r - l, b - t);
  }

  /** Tus cartas quedan pegadas a tu asiento (encima del nombre, o al costado si no entran). */
  function anclarCartasPropias(L) {
    for (let i = 0; i < L.seats.length; i++) {
      const S = L.seats[i];
      if (!S.propio || !S.cards || !S.info) continue;
      S.cards = elegirCartasPropias(S.info, S.cards.w, S.cards.h, L.W, L.H, L.pad, L.centro, L.dealer, L.m.betH, L.seats, S);
    }
  }

  function ajustarDesdeMedidas(L, estado) {
    const mesa = $("mesa-oval");
    if (!mesa) return;
    const mr = mesa.getBoundingClientRect();
    const cr = $("crupier");
    const ce = $("centro-mesa");
    if (cr) {
      L.dealer = cajaDesdeEl(cr, mr);
      const minY = L.dealer.h / 2 + 2;
      if (L.dealer.y < minY || L.dealer.top < 0) {
        L.dealer = caja(L.dealer.x, minY, L.dealer.w, L.dealer.h);
        cr.style.top = Math.round(L.dealer.y) + "px";
      }
    }
    if (ce) L.centro = cajaDesdeEl(ce, mr);
    for (let i = 0; i < L.seats.length; i++) {
      const S = L.seats[i];
      const info = document.querySelector('.pieza-info[data-asiento="' + S.i + '"] .info-jugador') ||
        document.querySelector('.pieza-info[data-asiento="' + S.i + '"]');
      const cartasInner = document.querySelector('.pieza-cartas[data-asiento="' + S.i + '"] .cartas-asiento');
      const cartas = document.querySelector('.pieza-cartas[data-asiento="' + S.i + '"]');
      const apInner = document.querySelector('.pieza-apuesta[data-asiento="' + S.i + '"] .apuesta-frente');
      const ap = document.querySelector('.pieza-apuesta[data-asiento="' + S.i + '"]');
      if (info) S.info = cajaInfoConAvatar(info, mr);
      if (cartasInner && cartasInner.querySelector(".carta, .carta-dorso")) S.cards = cajaCartasReal(cartasInner, mr);
      else if (cartas && cartas.querySelector(".carta, .carta-dorso")) S.cards = cajaDesdeEl(cartas, mr);
      if (apInner || ap) {
        const box = cajaDesdeEl(apInner || ap, mr);
        S.bet = box;
        S.mBetW = box.w;
        S.mBetH = box.h;
      }
      const rSeat = Math.hypot(S.info.x - L.cx, S.info.y - L.cy);
      S.rLo = Math.max(24, rSeat - Math.max(S.info.w, S.info.h) / 2 - S.mBetH / 2 - 6);
      S.rHi = Math.max(
        16,
        Math.min(
          (L.centro.w / 2 + (S.mBetW || L.m.betW) / 2 + 6) / Math.max(0.15, Math.abs(S.ux)),
          (L.centro.h / 2 + (S.mBetH || L.m.betH) / 2 + 6) / Math.max(0.15, Math.abs(S.uy))
        )
      );
    }
    anclarCartasPropias(L);
    resolverApuestas(L, estado);
    separarTodo(L);

    function escribirL() {
      if (cr) {
        cr.style.left = Math.round(L.dealer.x) + "px";
        cr.style.top = Math.round(L.dealer.y) + "px";
      }
      if (ce) {
        ce.style.left = Math.round(L.centro.x) + "px";
        ce.style.top = Math.round(L.centro.y) + "px";
      }
      for (let i = 0; i < L.seats.length; i++) {
        const S = L.seats[i];
        const info = document.querySelector('.pieza-info[data-asiento="' + S.i + '"]');
        const cartas = document.querySelector('.pieza-cartas[data-asiento="' + S.i + '"]');
        const ap = document.querySelector('.pieza-apuesta[data-asiento="' + S.i + '"]');
        if (info) { info.style.left = Math.round(S.info.x) + "px"; info.style.top = Math.round(S.info.y) + "px"; }
        if (cartas) { cartas.style.left = Math.round(S.cards.x) + "px"; cartas.style.top = Math.round(S.cards.y) + "px"; }
        if (ap) { ap.style.left = Math.round(S.bet.x) + "px"; ap.style.top = Math.round(S.bet.y) + "px"; }
        const globo = document.querySelector('.pieza-globo[data-asiento="' + S.i + '"]');
        if (globo) {
          globo.style.left = Math.round(S.info.x) + "px";
          globo.style.top = Math.round(S.info.y - S.info.h / 2 - 16) + "px";
        }
      }
    }
    escribirL();
    // Segunda pasada: medir de nuevo lo que el navegador pintó y separar restos.
    (function segunda() {
      if (cr) L.dealer = cajaDesdeEl(cr, mr);
      if (ce) L.centro = cajaDesdeEl(ce, mr);
      for (let i = 0; i < L.seats.length; i++) {
        const S = L.seats[i];
        const info = document.querySelector('.pieza-info[data-asiento="' + S.i + '"] .info-jugador') ||
          document.querySelector('.pieza-info[data-asiento="' + S.i + '"]');
        const cartasInner = document.querySelector('.pieza-cartas[data-asiento="' + S.i + '"] .cartas-asiento');
        const apInner = document.querySelector('.pieza-apuesta[data-asiento="' + S.i + '"] .apuesta-frente');
        if (info) S.info = cajaInfoConAvatar(info, mr);
        if (cartasInner && cartasInner.querySelector(".carta, .carta-dorso")) S.cards = cajaCartasReal(cartasInner, mr);
        if (apInner) { S.bet = cajaDesdeEl(apInner, mr); S.mBetW = S.bet.w; S.mBetH = S.bet.h; }
      }
      anclarCartasPropias(L);
      separarTodo(L);
      escribirL();
    })();
    ajustarNombres();
  }

  function ajustarNombres() {
    const nombres = document.querySelectorAll(".pieza-info .nombre-jugador");
    for (let i = 0; i < nombres.length; i++) {
      const el = nombres[i];
      const propio = !!(el.closest(".propio") || el.getAttribute("data-propio") === "1");
      let fs = propio ? 13 : 11;
      el.style.fontSize = fs + "px";
      el.style.letterSpacing = "0";
      el.style.textOverflow = propio ? "clip" : "ellipsis";
      while (fs > (propio ? 8 : 7) && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
        fs -= 0.5;
        el.style.fontSize = fs + "px";
      }
    }
  }

    function pintarPortaVasos(total) {
    const cajaV = $("porta-vasos");
    if (!cajaV) return;
    let html = "";
    for (let i = 0; i < total; i++) {
      html += '<div class="porta-vaso" data-asiento="' + i + '"></div>';
    }
    cajaV.innerHTML = html;
  }

  function medirSolapes() {
    const items = [];
    function push(el, name) {
      if (!el || el.hidden || el.closest("[hidden]")) return;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (st.display === "none" || r.width < 1 || r.height < 1) return;
      const asiento = (el.dataset && el.dataset.asiento != null) ? el.dataset.asiento : (el.closest && el.closest("[data-asiento]") && el.closest("[data-asiento]").dataset.asiento);
      items.push({
        name: name,
        id: asiento != null ? name + "-" + asiento : (el.id || name),
        left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height
      });
    }
    push($("crupier"), "crupier");
    push($("centro-mesa"), "centro");
    document.querySelectorAll(".pieza-info").forEach(function (el) {
      push(el.querySelector(".info-jugador") || el, "info");
      // El avatar sobresale arriba de la caja: también tiene que tener lugar
      if (el.querySelector(".avatar-asiento")) push(el.querySelector(".avatar-asiento"), "avatar");
    });
    document.querySelectorAll(".pieza-cartas").forEach(function (el) {
      if (el.querySelector(".carta, .carta-dorso")) push(el.querySelector(".cartas-asiento") || el, "cartas");
    });
    document.querySelectorAll(".pieza-apuesta").forEach(function (el) {
      push(el.querySelector(".apuesta-frente") || el, "apuesta");
    });
    const panel = $("panel-acciones");
    if (panel && !panel.hidden) {
      panel.querySelectorAll("button").forEach(function (el) {
        if (!el.hidden) push(el, "boton");
      });
    }
    const iw = window.innerWidth, ih = window.innerHeight;
    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const sh = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const pares = [];
    const holgura = 0.5;
    function hit(a, b) {
      return (Math.min(a.right, b.right) - Math.max(a.left, b.left) > holgura) &&
        (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > holgura);
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j];
        const mismoAsiento = A.id.split("-")[1] != null && A.id.split("-")[1] === B.id.split("-")[1];
        if (mismoAsiento && ((A.name === "avatar" && B.name === "info") || (A.name === "info" && B.name === "avatar"))) continue;
        if (hit(A, B)) pares.push(A.id + " ∩ " + B.id);
      }
    }
    const fuera = items.filter(function (b) {
      return b.bottom > ih + 1 || b.top < -1 || b.right > iw + 1 || b.left < -1;
    }).map(function (b) { return b.id; });
    return {
      iw: iw, ih: ih, sw: sw, sh: sh,
      overflowX: sw > iw + 1,
      overflowY: sh > ih + 1,
      overlaps: pares,
      fuera: fuera,
      nItems: items.length
    };
  }

  function renderMesa(estado, opciones) {
    opciones = opciones || {};
    ui.estado = estado;
    if (!estado) return;

    pintarSinFichas(estado);
    pintarRacha(null);
    pintarTuMano(estado);
    actualizarOrientacionMesa();
    const total = estado.asientosTotales;
    const oval = $("mesa-oval");
    if (oval) {
      oval.classList.toggle("asientos-10", total === 10);
      oval.classList.toggle("asientos-15", total >= 15);
    }
    document.documentElement.classList.add("en-mesa");
    const ganadores = (estado.resultadoShowdown && estado.resultadoShowdown.ganadores)
      ? estado.resultadoShowdown.ganadores.map(function (g) { return g.id; })
      : [];

    if (estado.ciegaPequena && estado.ciegaGrande && $("info-ciegas")) {
      if (ui.ultimaCiegaGrande && estado.ciegaGrande > ui.ultimaCiegaGrande) {
        toast("¡Las ciegas suben a " + estado.ciegaPequena + " / " + estado.ciegaGrande + "!");
      }
      ui.ultimaCiegaGrande = estado.ciegaGrande;
      $("info-ciegas").textContent = textoCiegas(estado);
    }

    pintarPortaVasos(total);

    const cajaAs = $("asientos");
    let html = "";
    for (let i = 0; i < total; i++) {
      const j = (estado.jugadores || []).find(function (p) { return p.asiento === i; });
      const esPropio = !!(j && j.id === ui.tuId);
      const esGanador = !!(j && ganadores.indexOf(j.id) !== -1);
      const clasesExtra = (j && j.esTurno ? " es-turno" : "") + (j && j.retirado ? " retirado" : "") + (esPropio ? " propio" : "") + (esGanador ? " ganador" : "") + (j && j.conectado === false ? " desconectado" : "");

      let htmlCartas = '<div class="cartas-asiento">';
      if (j && j.cartas && j.cartas.length && !opciones.ocultarPrivadas) {
        for (let c = 0; c < j.cartas.length; c++) {
          htmlCartas += htmlCarta(j.cartas[c], esGanador ? "ganadora" : "");
        }
      } else if (j && j.enMano && opciones.ocultarPrivadas) {
        htmlCartas += htmlDorso() + htmlDorso();
      }
      htmlCartas += "</div>";

      const descon = j && j.conectado === false ? " desconectado" : "";
      let htmlInfo = '<div class="info-jugador">';
      htmlInfo += '<span class="anillo-turno" aria-hidden="true"><svg viewBox="0 0 36 36" preserveAspectRatio="none"><circle cx="18" cy="18" r="16.2" pathLength="120"></circle></svg></span>';
      if (j) {
        if (Avatar && j.avatar) htmlInfo += '<div class="avatar-asiento">' + Avatar.svg(j.avatar, 48) + "</div>";
        const per = j.personalidad && Bots && Bots.PERSONALIDADES ? Bots.PERSONALIDADES[j.personalidad] : null;
        if (per) {
          htmlInfo += '<span class="tag-personalidad" data-personalidad="' + per.id + '" title="' + escapar(per.etiqueta + " · " + per.tipo + ": " + per.descripcion) + '">' + escapar(per.etiqueta.split(" ")[0]) + "</span>";
        }
        htmlInfo += '<div class="insignias">';
        if (j.esBoton) htmlInfo += '<span class="insignia" title="Botón del dealer">D</span>';
        if (j.esSB) htmlInfo += '<span class="insignia sb" title="Ciega pequeña">SB</span>';
        if (j.esBB) htmlInfo += '<span class="insignia bb" title="Ciega grande">BB</span>';
        htmlInfo += "</div>";
        htmlInfo += '<div class="nombre-jugador" data-propio="' + (esPropio ? "1" : "0") + '">' + escapar(primerNombre(j.nombre)) + "</div>";
        htmlInfo += '<div class="fichas-jugador">' + formatearFichas(j.fichas) + "</div>";
        htmlInfo += '<div class="estado-jugador">' + (j.allIn && j.ultimaAccion !== "all-in" ? "All-in" : textoAccion(j.ultimaAccion)) + "</div>";
      } else {
        htmlInfo += '<div class="nombre-jugador">Vacío</div>';
      }
      htmlInfo += "</div>";

      html += '<div class="pieza pieza-cartas ' + clasesExtra + '" data-asiento="' + i + '">';
      html += htmlCartas + "</div>";
      html += '<div class="pieza pieza-info ' + clasesExtra + '" data-asiento="' + i + '">';
      html += htmlInfo + "</div>";

      if (j && j.apuestaRonda > 0) {
        html += '<div class="pieza pieza-apuesta" data-asiento="' + i + '">';
        html += '<div class="apuesta-frente">' + htmlPilaFichas(j.apuestaRonda, true) + "</div></div>";
      }

      const globo = ui.globos[i];
      if (globo && Date.now() < globo.hasta) {
        html += '<div class="pieza pieza-globo" data-asiento="' + i + '"><div class="globo-chat">' + escapar(globo.frase) + "</div></div>";
      }
    }
    cajaAs.innerHTML = html;

    const com = $("comunitarias");
    let hcom = "";
    const cartasCom = opciones.vaciarComunitarias ? [] : (estado.comunitarias || []);
    for (let i = 0; i < 5; i++) {
      if (cartasCom[i]) hcom += htmlCarta(cartasCom[i], opciones.voltear && i >= (opciones.voltearDesde || 0) ? "volteando" : "");
      else hcom += '<div class="hueco-carta"></div>';
    }
    com.innerHTML = hcom;

    $("bote").innerHTML = htmlPilaFichas(estado.boteTotal || 0, false) + " Bote <strong>" + formatearFichas(estado.boteTotal || 0) + "</strong>";
    const calle = { preflop: "Preflop", flop: "Flop", turn: "Turn", river: "River", "entre-manos": "", showdown: "Showdown", esperando: "" };
    $("etiqueta-calle").textContent = calle[estado.fase] || "";

    if (estado.mensaje && estado.fase === "entre-manos") {
      $("mensaje-mesa").textContent = estado.mensaje;
    }

    actualizarPanelAcciones(estado);
    instalarObservadorMesa();
    // Acomodar ya mismo: si se espera al próximo cuadro, por un instante todas las piezas
    // (también tus cartas) quedaban arriba a la izquierda, encimadas.
    aplicarLayout(estado);
    requestAnimationFrame(function () {
      aplicarLayout(estado);
      requestAnimationFrame(function () { aplicarLayout(estado); });
    });
  }

  function actualizarPanelAcciones(estado) {
    const panel = $("panel-acciones");
    const acciones = estado.acciones;
    const esMiTurno = estado.turnoId && estado.turnoId === ui.tuId && acciones && acciones.tipos && acciones.tipos.length && !ui.animando;
    panel.hidden = !esMiTurno;
    if (!esMiTurno) return;

    $("btn-retirarse").disabled = !acciones.puedeRetirarse;
    $("btn-pasar").hidden = !acciones.puedePasar;
    $("btn-igualar").hidden = !acciones.puedeIgualar;
    $("btn-igualar").textContent = acciones.puedeIgualar
      ? (acciones.porIgualar >= (infoFichasPropias(estado) || acciones.porIgualar) ? "All-in " + formatearFichas(infoFichasPropias(estado)) : "Igualar " + formatearFichas(acciones.porIgualar))
      : "Igualar";

    const puedeAgredir = acciones.puedeApostar || acciones.puedeSubir;
    $("btn-subir").hidden = !puedeAgredir;
    $("btn-subir").textContent = acciones.puedeApostar ? "Apostar" : "Subir";
    $("rango-subida").hidden = !puedeAgredir;
    $("texto-subida").hidden = !puedeAgredir;
    $("btn-allin").hidden = !acciones.puedeAllIn;
    if (puedeAgredir) {
      const min = acciones.minSubida;
      const max = acciones.maxSubida;
      const rango = $("rango-subida");
      rango.min = String(min);
      rango.max = String(max);
      rango.step = "5";
      if (Number(rango.value) < min || Number(rango.value) > max) {
        rango.value = String(Math.min(max, Math.max(min, min)));
      }
      $("texto-subida").textContent = formatearFichas(rango.value);
    }
    requestAnimationFrame(function () { aplicarLayout(estado); });
  }

  function infoFichasPropias(estado) {
    const j = (estado.jugadores || []).find(function (p) { return p.id === ui.tuId; });
    return j ? j.fichas : 0;
  }

  /* ---------- Animación: cartas que vuelan ---------- */

  function rectRelativo(el, contenedor) {
    const r = el.getBoundingClientRect();
    const c = contenedor.getBoundingClientRect();
    return { x: r.left - c.left + r.width / 2, y: r.top - c.top + r.height / 2, w: r.width, h: r.height };
  }

  function esperar(ms) {
    if (movimientoReducido()) ms = 0;
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function animarFichasAlBote() {
    if (movimientoReducido()) return;
    const mesa = $("mesa-oval");
    const capa = $("fichas-volando");
    const destEl = $("bote");
    if (!mesa || !capa || !destEl) return;
    const dest = rectRelativo(destEl, mesa);
    const origenes = document.querySelectorAll(".pieza-apuesta");
    if (!origenes.length) return;
    capa.innerHTML = "";
    for (let i = 0; i < origenes.length; i++) {
      const el = origenes[i];
      const o = rectRelativo(el, mesa);
      const clone = el.cloneNode(true);
      clone.classList.add("ficha-voladora");
      clone.style.left = (o.x - el.offsetWidth / 2) + "px";
      clone.style.top = (o.y - el.offsetHeight / 2) + "px";
      capa.appendChild(clone);
    }
    void capa.offsetWidth;
    const clones = capa.querySelectorAll(".ficha-voladora");
    for (let i = 0; i < clones.length; i++) {
      clones[i].style.left = (dest.x - 16) + "px";
      clones[i].style.top = (dest.y - 8) + "px";
      clones[i].style.opacity = "0";
    }
    sonar("bote");
    await esperar(520);
    capa.innerHTML = "";
  }

  /** Línea de estado al salir el flop/turn/river (antes se quedaba en "Preflop · a hablar"). */
  function pintarLineaCalle(etiqueta, estado) {
    const el = $("mensaje-mesa");
    if (!el || !estado) return;
    if (estado.fase === "entre-manos" || estado.fase === "showdown" || estado.fase === "esperando") return;
    el.className = "";
    el.textContent = estado.turnoId ? etiqueta + " · a hablar." : etiqueta + ".";
  }

  const MANO_FUERTE = /^(Escalera real|Escalera de color|Póker)/;

  /** Si alguien ganó con Escalera real, Escalera de color o Póker, devuelve { mano, nombre }. */
  function jugadaFuerte(estado) {
    const r = estado && estado.resultadoShowdown;
    if (!r || r.sinShowdown) return null;
    const gs = r.ganadores || [];
    for (let i = 0; i < gs.length; i++) {
      if (MANO_FUERTE.test(gs[i].descripcion || "")) {
        const j = (estado.jugadores || []).find(function (x) { return x.id === gs[i].id; });
        return { mano: gs[i].descripcion, nombre: gs[i].id === ui.tuId ? "¡Vos!" : (j ? j.nombre : gs[i].nombre || "") };
      }
    }
    return null;
  }

  /** Fichas que vuelan del bote a cada ganador. */
  function animarPremio(capa, mesa) {
    const winners = document.querySelectorAll(".pieza-info.ganador");
    if (!winners.length) return;
    const boteEl = $("bote");
    let o = boteEl ? rectRelativo(boteEl, mesa) : null;
    if (!o || !o.w) { const m = mesa.getBoundingClientRect(); o = { x: m.width / 2, y: m.height / 2 }; }
    const fichas = [];
    if (!movimientoReducido()) sonar("premio");
    for (let w = 0; w < winners.length; w++) {
      const d = rectRelativo(winners[w], mesa);
      for (let i = 0; i < 7; i++) {
        const f = document.createElement("span");
        f.className = "ficha-premio" + (i % 3 === 1 ? " roja" : i % 3 === 2 ? " azul" : "");
        f.style.left = (o.x - 9 + (i - 3) * 3) + "px";
        f.style.top = (o.y - 9) + "px";
        f.style.transitionDelay = (i * 55) + "ms";
        capa.appendChild(f);
        fichas.push({ el: f, x: d.x - 9 + (i - 3) * 2, y: d.y - 9 });
      }
    }
    void capa.offsetWidth;
    fichas.forEach(function (f) {
      f.el.style.left = f.x + "px";
      f.el.style.top = f.y + "px";
      f.el.classList.add("llego");
    });
  }

  /** Cartel grande + confeti para las jugadas raras. Con movimiento reducido: solo el cartel, quieto. */
  function mostrarJugadon(info) {
    const mesa = $("mesa-oval");
    if (!mesa) return;
    const viejo = $("jugadon");
    if (viejo) viejo.remove();
    const cartel = document.createElement("div");
    cartel.id = "jugadon";
    cartel.setAttribute("role", "status");
    cartel.innerHTML = '<span class="jugadon-mano">' + escapar(info.mano) + '</span><span class="jugadon-quien">' + escapar(info.nombre) + "</span>";
    mesa.appendChild(cartel);
    if (!movimientoReducido()) {
      const capa = $("celebracion");
      const colores = ["#e9c46a", "#f4f1de", "#e76f51", "#2a9d8f", "#8ecae6"];
      for (let i = 0; i < 46; i++) {
        const c = document.createElement("span");
        c.className = "confeti";
        c.style.left = (4 + Math.random() * 92) + "%";
        c.style.background = colores[i % colores.length];
        c.style.animationDelay = (Math.random() * 0.5) + "s";
        c.style.setProperty("--giro", (Math.random() * 720 - 360) + "deg");
        c.style.setProperty("--deriva", (Math.random() * 60 - 30) + "px");
        capa.appendChild(c);
      }
    }
    setTimeout(function () { cartel.remove(); }, 2900);
  }

  function celebrar(estado) {
    const fuerte = jugadaFuerte(estado);
    if (fuerte) sonar("jugadon");
    else sonarResultado(estado);
    chatBotsOcasional("win");
    premiarMano(estado);
    const capa = $("celebracion");
    if (!capa) return;
    clearTimeout(ui.timerCelebracion);
    capa.innerHTML = "";
    if (fuerte) mostrarJugadon(fuerte);
    if (movimientoReducido()) return;
    const mesa = $("mesa-oval");
    if (!mesa) return;
    animarPremio(capa, mesa);
    const winners = document.querySelectorAll(".pieza-info.ganador");
    for (let w = 0; w < winners.length; w++) {
      const r = rectRelativo(winners[w], mesa);
      for (let i = 0; i < 14; i++) {
        const s = document.createElement("span");
        s.className = "chispa";
        const ang = (i / 14) * Math.PI * 2;
        const dist = 28 + (i % 3) * 12;
        s.style.left = r.x + "px";
        s.style.top = r.y + "px";
        s.style.setProperty("--dx", (Math.cos(ang) * dist) + "px");
        s.style.setProperty("--dy", (Math.sin(ang) * dist) + "px");
        capa.appendChild(s);
      }
    }
    ui.timerCelebracion = setTimeout(function () { if (capa) capa.innerHTML = ""; }, fuerte ? 3000 : 1400);
  }

  async function animarReparto(secuencia) {
    const mesa = $("mesa-oval");
    const capa = $("cartas-volando");
    const origenEl = document.querySelector(".crupier-figura") || $("crupier");
    if (!secuencia || !secuencia.length || !mesa) return;

    const origen = rectRelativo(origenEl, mesa);
    capa.innerHTML = "";
    await animarBarajado(capa, origen);

    for (let i = 0; i < secuencia.length; i++) {
      const paso = secuencia[i];
      const destinoEl = document.querySelector('.pieza[data-asiento="' + paso.asiento + '"] .cartas-asiento');
      if (!destinoEl) continue;
      const dest = rectRelativo(destinoEl, mesa);
      const cartaEl = document.createElement("div");
      cartaEl.className = "carta-dorso carta-voladora";
      cartaEl.style.left = (origen.x - 26) + "px";
      cartaEl.style.top = (origen.y - 10) + "px";
      capa.appendChild(cartaEl);
      // Forzar reflow para que la transición arranque
      void cartaEl.offsetWidth;
      cartaEl.style.left = (dest.x - 26 + (paso.indice === 1 ? 10 : -10)) + "px";
      cartaEl.style.top = (dest.y - 37) + "px";
      cartaEl.style.transform = "rotate(" + (paso.indice === 1 ? 8 : -8) + "deg)";
      await esperar(130);
    }
    await esperar(350);
    capa.innerHTML = "";
  }

  const DURACION_BARAJADO_MS = 1500;
  const LS_BARAJADO = "rf_barajado";
  function barajadoActivo() {
    try { return localStorage.getItem(LS_BARAJADO) !== "0"; } catch (e) { return true; }
  }

  /**
   * Riffle: el crupier parte el mazo en dos, las mitades se arquean y se entrelazan
   * dos veces y se cuadra el mazo (≈1,5 s), con el dorso equipado y el sonido de
   * barajar del tema. Sin animación si el aparato pide menos movimiento o si se
   * apagó en Opciones.
   */
  async function animarBarajado(capa, origen) {
    if (!capa || movimientoReducido() || !barajadoActivo()) return;
    const caja = document.createElement("div");
    caja.className = "riffle";
    caja.setAttribute("aria-hidden", "true");
    caja.style.left = Math.round(origen.x) + "px";
    caja.style.top = Math.round(origen.y + 40) + "px";
    let html = "";
    for (let i = 0; i < 12; i++) {
      const lado = i % 2 ? "der" : "izq";
      html += '<div class="carta-dorso riffle-carta ' + lado + '" style="--i:' + Math.floor(i / 2) + '"></div>';
    }
    caja.innerHTML = html;
    capa.appendChild(caja);
    sonar("barajar");
    await esperar(DURACION_BARAJADO_MS);
    if (caja.parentNode) caja.parentNode.removeChild(caja);
  }

  async function animarComunitarias(nuevas) {
    const mesa = $("mesa-oval");
    const capa = $("cartas-volando");
    const origenEl = document.querySelector(".crupier-figura") || $("crupier");
    if (!nuevas || !nuevas.length) return;
    const origen = rectRelativo(origenEl, mesa);
    const huecos = $("comunitarias").querySelectorAll(".hueco-carta");
    // El primer hueco vacío es el destino de la primera carta nueva
    const ocupadas = $("comunitarias").querySelectorAll(".carta").length;

    for (let i = 0; i < nuevas.length; i++) {
      const destinoEl = huecos[i] || huecos[huecos.length - 1];
      if (!destinoEl) continue;
      const dest = rectRelativo(destinoEl, mesa);
      const cartaEl = document.createElement("div");
      cartaEl.className = "carta-dorso carta-voladora al-centro";
      cartaEl.style.left = (origen.x - 35) + "px";
      cartaEl.style.top = (origen.y - 10) + "px";
      capa.appendChild(cartaEl);
      void cartaEl.offsetWidth;
      cartaEl.style.left = (dest.x - 35) + "px";
      cartaEl.style.top = (dest.y - 50) + "px";
      cartaEl.style.transform = "rotate(0deg)";
      await esperar(220);
    }
    await esperar(400);
    capa.innerHTML = "";
  }

  /* ---------- Acciones del jugador ---------- */

  function enviarAccion(tipo, cantidad) {
    if (tipo === "all-in") chatBotsOcasional("all-in");
    if (ui.modo === "solo" && ui.mesa) {
      const r = ui.mesa.accion(ui.tuId, tipo, cantidad);
      if (r && r.error) $("mensaje-mesa").textContent = r.error;
      return;
    }
    if (ui.modo === "online") {
      enviarWS({ tipo: "accion", accion: tipo, cantidad: cantidad });
    }
  }

  /* ---------- Online (WebSocket) ---------- */

  // La URL del WebSocket se construye desde la página actual:
  // mismo host y puerto, y wss:// si la página va por https (como en Render).
  function urlWS() {
    if (location.protocol === "file:") return null;
    const p = location.protocol === "https:" ? "wss:" : "ws:";
    return p + "//" + location.host + "/ws";
  }

  function cerrarWS(intencional) {
    detenerKeepAlive();
    if (ui.timerReconnect) { clearTimeout(ui.timerReconnect); ui.timerReconnect = null; }
    if (ui.ws) {
      try {
        if (intencional) ui.ws.salidaIntencional = true;
        ui.ws.onclose = null;
        ui.ws.close();
      } catch (e) { /* nada */ }
      ui.ws = null;
    }
  }

  function arrancarKeepAlive() {
    detenerKeepAlive();
    ui.timerPing = setInterval(function () {
      if (ui.ws && ui.ws.readyState === 1) {
        try { ui.ws.send(JSON.stringify({ tipo: "ping" })); } catch (e) { /* */ }
      }
    }, 20000);
    ui.timerSalud = setInterval(function () {
      if (location.protocol === "file:") return;
      try { fetch("/salud", { cache: "no-store" }).catch(function () { /* */ }); } catch (e) { /* */ }
    }, 4 * 60 * 1000);
  }

  function detenerKeepAlive() {
    if (ui.timerPing) { clearInterval(ui.timerPing); ui.timerPing = null; }
    if (ui.timerSalud) { clearInterval(ui.timerSalud); ui.timerSalud = null; }
  }

  function conectarWS(intento) {
    intento = intento || 1;
    return new Promise(function (resolve, reject) {
      const url = urlWS();
      if (!url) {
        reject(new Error("Para jugar online hay que abrir el juego en la web (no como archivo)."));
        return;
      }
      if (ui.ws && ui.ws.readyState === 1) {
        resolve(ui.ws);
        return;
      }
      if (ui.ws) {
        try { ui.ws.onclose = null; ui.ws.close(); } catch (e) { /* */ }
        ui.ws = null;
      }
      if (intento > 1) toast("El servidor se está despertando, un segundo…", "ok");
      const ws = new WebSocket(url);
      ui.ws = ws;
      const limite = intento === 1 ? 25000 : 45000;
      const timer = setTimeout(function () {
        try { ws.close(); } catch (e) { /* */ }
        if (intento < 4) {
          toast("El servidor se está despertando, un segundo…", "ok");
          conectarWS(intento + 1).then(resolve, reject);
        } else {
          reject(new Error("No se pudo conectar con el servidor. Probá de nuevo en un momento."));
        }
      }, limite);
      ws.addEventListener("open", function () {
        clearTimeout(timer);
        arrancarKeepAlive();
        resolve(ws);
      });
      ws.addEventListener("error", function () {
        /* el close/timeout se encargan */
      });
      ws.addEventListener("message", function (ev) {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        alMensajeServidor(msg);
      });
      ws.addEventListener("close", function () {
        if (ws !== ui.ws) return;
        ui.ws = null;
        detenerKeepAlive();
        if (ui.modo === "online" && ui.espectador) {
          toast("Se cortó la conexión.", "err");
          irMenu();
        } else if (ui.modo === "online" && ui.token && ui.codigo && !ui.reconectando) {
          programarReconexion();
        }
      });
    });
  }

  function programarReconexion() {
    if (ui.timerReconnect) return;
    ui.reconectando = true;
    toast("Se cortó la conexión. Reconectando…", "err");
    let n = 0;
    function tentar() {
      n++;
      conectarWS(Math.min(n, 3)).then(function () {
        enviarWS({ tipo: "reconectar", token: ui.token, codigo: ui.codigo });
        ui.reconectando = false;
        ui.timerReconnect = null;
      }).catch(function () {
        if (n < 8) {
          ui.timerReconnect = setTimeout(tentar, Math.min(12000, 1500 * n));
        } else {
          ui.reconectando = false;
          ui.timerReconnect = null;
          mostrarError("La sala ya no existe, crea una nueva");
          borrarSesionSala();
          irMenu();
        }
      });
    }
    ui.timerReconnect = setTimeout(tentar, 600);
  }

  function enviarWS(obj) {
    if (ui.ws && ui.ws.readyState === 1) {
      ui.ws.send(JSON.stringify(obj));
    } else if (ui.modo === "online" && ui.token) {
      programarReconexion();
    }
  }

  function alMensajeServidor(msg) {
    if (msg.tuId) {
      ui.tuId = msg.tuId;
      ui.espectador = !!msg.esEspectador;
    }
    if (msg.codigo) ui.codigo = msg.codigo;
    if (msg.token) guardarSesionSala(msg.token, msg.codigo || ui.codigo);
    if (msg.esAnfitrion != null) ui.esAnfitrion = !!msg.esAnfitrion;
    if (msg.publica != null) ui.publica = !!msg.publica;
    if (msg.cuentas) recibirCuentas(msg);
    if (msg.espectadores != null) {
      ui.espectadores = msg.espectadores;
      pintarEspectadores();
    }
    if (msg.tipo === "espectadores") return;

    if (msg.turnoRestanteMs !== undefined) {
      ui.turnoLimite = msg.turnoRestanteMs == null ? null : Date.now() + msg.turnoRestanteMs;
      ui.turnoDe = msg.turnoDe || null;
    }
    if (msg.tipo === "turno-limite") { pintarReloj(); return; }
    if (msg.tipo === "aviso-turno") { toast(msg.mensaje || "Se acabó tu tiempo.", "err"); return; }

    if (msg.tipo === "pong") return;

    // La mesa volvió después de que el servidor se durmiera o reiniciara
    if (msg.tipo === "recuperada") {
      toast(msg.mensaje || "La mesa se recuperó.", "ok");
      return;
    }
    if (msg.tipo === "grupo") {
      recibirGrupo(msg);
      return;
    }
    if (msg.tipo === "grupo-actualizado") {
      if (!ui.grupoSala || !ui.grupo || ui.grupo.codigo !== ui.grupoSala.codigo) ui.grupo = null;
      if ($("aviso-grupo")) $("aviso-grupo").textContent = "";
      pintarGrupo();
      return;
    }
    if (msg.tipo === "nueva-partida") {
      ui.verNoche = false;
      if ($("panel-cuentas")) $("panel-cuentas").hidden = true;
      toast(msg.mensaje || "¡Otra partida!", "ok");
      if (msg.estado) {
        if ($("pantalla-mesa").hidden) entrarEnMesaOnline(msg);
        else renderMesa(msg.estado);
      }
      return;
    }

    if (msg.tipo === "error") {
      if (msg.codigoError === "grupo-no-existe" && recuperarGrupo(msg.codigo, function () {
        enviarWS({ tipo: "grupo", accion: "usar", codigo: msg.codigo });
      })) return;
      if ($("btn-otra-partida")) $("btn-otra-partida").disabled = false;
      if ((msg.codigoError === "grupo" || msg.codigoError === "grupo-no-existe") && $("aviso-grupo")) $("aviso-grupo").textContent = msg.mensaje || "";
      if (ui.espectador && msg.codigoError === "sala-inexistente") {
        borrarSesionSala();
        irMenu();
        mostrarError(msg.mensaje || "La mesa se cerró.");
        return;
      }
      mostrarError(msg.mensaje || "Ha ocurrido un error.");
      if (msg.codigoError === "sala-inexistente") {
        borrarSesionSala();
      }
      if (/^chat-/.test(msg.codigoError || "") && $("aviso-chat")) $("aviso-chat").textContent = msg.mensaje;
      if ((msg.codigoError === "recarga-minima" || /recargar|mínimo/i.test(msg.mensaje || "")) && $("aviso-recarga")) {
        $("aviso-recarga").textContent = msg.mensaje;
      }
      return;
    }

    if (msg.tipo === "chat") {
      mostrarFrase(msg);
      return;
    }

    // Modo espectador: se ve la mesa, sin cartas privadas y sin poder jugar
    if (msg.tipo === "mirando") {
      ui.modo = "online";
      ui.espectador = true;
      entrarEnMesaOnline(msg);
      if ($("info-sala")) $("info-sala").textContent = "👁 " + (msg.codigo || ui.codigo || "");
      if ($("mensaje-mesa")) $("mensaje-mesa").textContent = "Estás mirando la partida.";
      return;
    }
    if (ui.espectador && msg.tipo === "partida-terminada") {
      toast("La partida terminó.");
      return;
    }

    if (msg.tipo === "recarga") {
      if (msg.mensaje) toast(msg.mensaje, "ok");
      if (msg.cuentas) recibirCuentas(msg);
      pintarNotaRecarga();
      if (msg.estado && $("pantalla-mesa") && !$("pantalla-mesa").hidden) renderMesa(msg.estado);
      if ($("aviso-recarga")) $("aviso-recarga").textContent = "";
      return;
    }

    if (msg.tipo === "partida-terminada") {
      if (msg.estado) ui.estado = msg.estado;
      premiarFinPartidaOnline();
      if (msg.estado) {
        if ($("pantalla-mesa").hidden) mostrar("pantalla-sala");
        else renderMesa(msg.estado);
      }
      recibirCuentas(msg);
      abrirCuentas("resumen");
      toast("Partida terminada. Acá están las cuentas.", "ok");
      return;
    }

    if (msg.tipo === "en-sala" || msg.tipo === "sala-actualizada") {
      pintarSalaEspera(msg);
      if (msg.estado && (msg.estado.fase !== "esperando" && msg.partidaIniciada)) {
        entrarEnMesaOnline(msg);
      } else {
        mostrar("pantalla-sala");
      }
      return;
    }

    if (msg.tipo === "accion" || msg.tipo === "turno" || msg.tipo === "calle" || msg.tipo === "mano-iniciada") sonarEvento(msg);

    // El último estado que mandó el servidor: al terminar una animación se dibuja
    // este (y no el del principio), por si mientras tanto llegó "te toca".
    if (msg.estado) ui.estadoServidor = msg.estado;

    if (msg.tipo === "partida-iniciada") ui.puestoPremiado = false;
    if (msg.tipo === "partida-iniciada" || msg.tipo === "mano-iniciada") {
      entrarEnMesaOnline(msg);
      if (msg.secuenciaReparto) {
        ui.animando = true;
        $("mensaje-mesa").textContent = "Don Luis reparte las cartas…";
        renderMesa(msg.estado, { ocultarPrivadas: true, vaciarComunitarias: true });
        animarReparto(msg.secuenciaReparto).then(function () {
          ui.animando = false;
          if (ui.estado) renderMesa(ui.estadoServidor || msg.estado);
          $("mensaje-mesa").textContent = "Preflop · a hablar.";
        });
      } else if (msg.estado) {
        renderMesa(msg.estado);
      }
      return;
    }

    if (msg.tipo === "calle" && msg.nuevas) {
      ui.animando = true;
      const etiquetaCalle = msg.calle === "flop" ? "Flop" : msg.calle === "turn" ? "Turn" : "River";
      $("mensaje-mesa").className = "";
      $("mensaje-mesa").textContent = etiquetaCalle + "…";
      animarFichasAlBote().then(function () { return animarComunitarias(msg.nuevas); }).then(function () {
        ui.animando = false;
        const ultimo = ui.estadoServidor || msg.estado;
        if (msg.estado) renderMesa(ultimo, { voltear: true });
        pintarLineaCalle(etiquetaCalle, ultimo);
      });
      if (msg.estado) {
        // Mientras vuelan, ya podemos ir actualizando el bote
        $("bote").innerHTML = "Bote <strong>" + (msg.estado.boteTotal || 0) + "</strong>";
      }
      return;
    }

    if (msg.estado) {
      if ($("pantalla-mesa").hidden && msg.estado.fase !== "esperando") {
        entrarEnMesaOnline(msg);
      }
      if (msg.tipo === "showdown" || msg.tipo === "ganador-sin-showdown") registrarHistorial(msg.estado);
      renderMesa(msg.estado);
      if (msg.estado.mensaje && (msg.tipo === "showdown" || msg.tipo === "ganador-sin-showdown" || msg.estado.fase === "entre-manos")) {
        $("mensaje-mesa").textContent = msg.estado.mensaje;
        $("mensaje-mesa").className = "premio";
        if (msg.tipo === "showdown" || msg.tipo === "ganador-sin-showdown") celebrar(msg.estado);
      }
    }
  }

  function entrarEnMesaOnline(msg) {
    if ($("pantalla-mesa").hidden) ui.ultimaCiegaGrande = null;
    const salaActual = msg.codigo || ui.codigo || "";
    if (ui.historialSala !== salaActual) {
      ui.historialSala = salaActual;
      if (ui.historial) ui.historial.limpiar();
    }
    ui.modo = "online";
    $("info-sala").textContent = (ui.espectador ? "👁 " : "") + (ui.codigo ? ui.codigo : (ui.publica ? "Pública" : "Privada"));
    if ($("btn-compartir-mesa")) $("btn-compartir-mesa").hidden = !ui.codigo;
    if ($("btn-abrir-cuentas")) $("btn-abrir-cuentas").hidden = !!ui.espectador;
    if (ui.codigo) actualizarUrlSala(ui.codigo);
    $("info-ciegas").textContent = "Ciegas 5 / 10";
    mostrar("pantalla-mesa");
    if (msg.estado) renderMesa(msg.estado);
  }

  function pintarSalaEspera(msg) {
    const codigo = msg.codigo || ui.codigo || "";
    if ($("codigo-sala")) $("codigo-sala").textContent = codigo;
    actualizarUrlSala(codigo);
    const link = enlaceInvitacion(codigo);
    if ($("input-enlace-sala")) $("input-enlace-sala").value = link;
    if ($("btn-compartir-sala")) $("btn-compartir-sala").hidden = true;
    if ($("tipo-sala")) {
      $("tipo-sala").textContent = msg.publica
        ? "Mesa pública. Puede entrar cualquiera con un asiento libre."
        : "Mesa privada. Invitá a tus amigos con el botón de abajo.";
    }
    const lista = $("lista-jugadores-sala");
    const jugadores = (msg.estado && msg.estado.jugadores) || msg.jugadores || [];
    if (lista) {
      lista.innerHTML = "";
      for (let i = 0; i < jugadores.length; i++) {
        const j = jugadores[i];
        const li = document.createElement("li");
        if (j.conectado === false) li.className = "desconectado";
        const cara = (Avatar && j.avatar) ? Avatar.svg(j.avatar, 28) : "";
        li.innerHTML = cara + "<span>" + escapar(j.nombre) +
          (j.id === ui.tuId ? " (tú)" : "") +
          (j.tipo === "bot" ? ' <span class="papel">' + ((j.personalidad && Bots.PERSONALIDADES[j.personalidad]) ? escapar(Bots.PERSONALIDADES[j.personalidad].etiqueta) : "bot") + "</span>" : "") +
          (msg.anfitrionId === j.id ? ' <span class="papel">anfitrión</span>' : "") +
          (j.conectado === false ? ' <span class="papel">reconectando…</span>' : "") +
          "</span>";
        lista.appendChild(li);
      }
    }
    const total = (msg.estado && msg.estado.asientosTotales) || msg.asientos || 9;
    const libres = total - jugadores.length;
    if ($("asientos-libres")) {
      $("asientos-libres").textContent = libres === 0
        ? "Mesa completa."
        : (jugadores.length === 1 ? "Esperando a tu amigo…" : (jugadores.length + " jugadores · " + libres + " asientos libres."));
    }
    const fi = msg.fichasIniciales || (msg.estado && msg.estado.fichasIniciales);
    const sb = msg.ciegaPequena != null ? msg.ciegaPequena : (msg.estado && msg.estado.ciegaPequena);
    const bb = msg.ciegaGrande != null ? msg.ciegaGrande : (msg.estado && msg.estado.ciegaGrande);
    const infoF = $("info-fichas-sala");
    if (infoF) {
      infoF.textContent = fi
        ? ("Fichas iniciales: " + formatearFichas(fi) + (sb != null && bb != null ? " · Ciegas " + sb + " / " + bb : ""))
        : "";
    }

    const anfitrion = !!(msg.esAnfitrion || ui.esAnfitrion || (msg.anfitrionId && msg.anfitrionId === ui.tuId));
    if (anfitrion) ui.esAnfitrion = true;
    const humanos = jugadores.filter(function (j) { return j.tipo !== "bot"; }).length;
    const puedeEmpezar = jugadores.filter(function (j) { return j.fichas > 0; }).length >= 2;
    if ($("btn-llenar-bots")) $("btn-llenar-bots").hidden = !anfitrion || libres === 0;
    // Si la partida ya terminó (por ejemplo al volver a abrir la página), el botón ofrece la revancha
    const terminada = !!(ui.cuentas && ui.cuentas.partidaTerminada);
    if ($("btn-iniciar-online")) {
      $("btn-iniciar-online").hidden = !anfitrion;
      $("btn-iniciar-online").textContent = terminada ? "🔁 Otra partida" : "Empezar";
      $("btn-iniciar-online").disabled = terminada ? jugadores.length < 2 : !puedeEmpezar;
    }
    if ($("aviso-sala")) {
      $("aviso-sala").textContent = terminada
        ? (anfitrion ? "La partida terminó. Mirá las cuentas o empezá otra partida con los mismos jugadores." : "La partida terminó. El anfitrión puede empezar otra.")
        : anfitrion
        ? (puedeEmpezar ? "Cuando quieras, tocá Empezar." : "Invitá a un amigo o rellená con bots para empezar.")
        : "Esperando a que el anfitrión inicie la partida…";
    }
  }

  async function crearPrivada() {
    limpiarAvisos();
    ui.modo = "online";
    try {
      await conectarWS();
      enviarWS({
        tipo: "crear-privada",
        nombre: nombreJugador(false),
        asientos: asientosElegidos("asientos-online"),
        fichasIniciales: fichasElegidas("online"),
        torneo: torneoElegido("online"),
        avatar: ui.avatar,
        token: ui.token
      });
    } catch (e) {
      mostrarError(e.message);
    }
  }

  async function unirseCodigo() {
    limpiarAvisos();
    const crudo = ($("input-codigo") && $("input-codigo").value) || codigoDesdeUbicacion() || "";
    const codigo = extraerCodigo(crudo);
    if (codigo.length !== 5) {
      mostrarError("El código tiene que tener 5 letras, o pegá el enlace de la mesa.");
      return;
    }
    ui.modo = "online";
    try {
      await conectarWS();
      enviarWS({ tipo: "unirse", nombre: nombreJugador(false), codigo: codigo, avatar: ui.avatar, token: ui.token });
    } catch (e) {
      mostrarError(e.message);
    }
  }

  async function mirarCodigo() {
    limpiarAvisos();
    const crudo = ($("input-codigo") && $("input-codigo").value) || codigoDesdeUbicacion() || "";
    const codigo = extraerCodigo(crudo);
    if (codigo.length !== 5) {
      mostrarError("El código tiene que tener 5 letras, o pega el enlace de la mesa.");
      return;
    }
    ui.modo = "online";
    try {
      await conectarWS();
      enviarWS({ tipo: "mirar", codigo: codigo });
    } catch (e) {
      mostrarError(e.message);
    }
  }

  async function unirsePublica() {
    limpiarAvisos();
    ui.modo = "online";
    try {
      await conectarWS();
      enviarWS({
        tipo: "unirse-publica",
        nombre: nombreJugador(false),
        asientos: asientosElegidos("asientos-online"),
        fichasIniciales: fichasElegidas("online"),
        torneo: torneoElegido("online"),
        avatar: ui.avatar,
        token: ui.token
      });
    } catch (e) {
      mostrarError(e.message);
    }
  }

  function mostrarFrase(msg) {
    const asiento = (msg.deAsiento != null) ? msg.deAsiento : (msg.asiento);
    const frase = msg.frase || "";
    if (asiento == null || !frase) return;
    ui.globos[asiento] = { frase: frase, hasta: Date.now() + 3000 };
    ui.logChat = (ui.logChat || []).concat([{ nombre: msg.deNombre || "", frase: frase }]).slice(-20);
    const log = $("log-chat");
    if (log) {
      const li = document.createElement("li");
      li.textContent = (msg.deNombre ? msg.deNombre + ": " : "") + frase;
      log.appendChild(li);
      log.scrollTop = log.scrollHeight;
    }
    if (ui.estado) renderMesa(ui.estado);
    setTimeout(function () {
      const g = ui.globos[asiento];
      if (g && g.hasta <= Date.now() + 50) {
        delete ui.globos[asiento];
        if (ui.estado) renderMesa(ui.estado);
      }
    }, 3100);
  }

  function abrirChat() {
    const panel = $("panel-chat");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) montarFrasesChat();
  }

  function montarFrasesChat() {
    const caja = $("frases-chat");
    if (!caja || caja.childNodes.length) return;
    FRASES_CHAT.forEach(function (f) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = f;
      b.addEventListener("click", function () { enviarFrase(f); });
      caja.appendChild(b);
    });
  }

  function pintarCuentaChat() {
    const inp = $("input-chat");
    if (!inp || !$("cuenta-chat")) return;
    $("cuenta-chat").textContent = Array.from(inp.value).length + "/" + (Util.MAX_CHAT || 80);
  }

  function enviarTextoChat() {
    const inp = $("input-chat");
    const aviso = $("aviso-chat");
    if (!inp) return;
    const texto = Util.limpiarChat(inp.value);
    if (aviso) aviso.textContent = "";
    if (!texto) { if (aviso) aviso.textContent = "Escribí algo antes de mandar."; return; }
    if (ui.espectador) { if (aviso) aviso.textContent = "Mirando no se puede chatear."; return; }
    const ahora = Date.now();
    if (ui.ultimoChatPropio && ahora - ui.ultimoChatPropio < 2000) {
      if (aviso) aviso.textContent = "Esperá un segundo antes de mandar otro mensaje.";
      return;
    }
    ui.ultimoChatPropio = ahora;
    if (ui.modo === "online") {
      enviarWS({ tipo: "chat", texto: texto });
    } else {
      const yo = ui.estado && (ui.estado.jugadores || []).find(function (j) { return j.id === ui.tuId; });
      mostrarFrase({ frase: texto, libre: true, deId: ui.tuId, deNombre: yo ? yo.nombre : nombreJugador(false), deAsiento: yo ? yo.asiento : 0 });
    }
    inp.value = "";
    pintarCuentaChat();
  }

  function enviarFrase(frase) {
    if (ui.modo === "online") {
      enviarWS({ tipo: "chat", frase: frase });
    } else {
      const yo = ui.estado && (ui.estado.jugadores || []).find(function (j) { return j.id === ui.tuId; });
      mostrarFrase({ frase: frase, deId: ui.tuId, deNombre: yo ? yo.nombre : nombreJugador(false), deAsiento: yo ? yo.asiento : 0 });
    }
  }

  /** Frase de un bot con personalidad (solo; online las manda el servidor). */
  function chatPersonalidad(j, momento) {
    if (!j || !momento || ui.modo !== "solo") return;
    const ahora = Date.now();
    if (ui.ultimoChatBot && ahora - ui.ultimoChatBot < 2500) return;
    const frase = Bots.chatDeBot(j, momento);
    if (!frase) return;
    ui.ultimoChatBot = ahora;
    setTimeout(function () {
      mostrarFrase({ frase: frase, deNombre: j.nombre, deAsiento: j.asiento, deId: j.id });
    }, 250);
  }

  function chatBotsOcasional(motivo) {
    if (ui.modo !== "solo" || !ui.estado) return;
    if (motivo === "win" && ui.mesa && ui.mesa.resultadoShowdown) {
      const g = (ui.mesa.resultadoShowdown.ganadores || [])[0];
      const jg = g && ui.mesa.jugadorPorId(g.id);
      if (jg && jg.tipo === "bot" && jg.personalidad) { chatPersonalidad(jg, "ganar"); return; }
    }
    if (Math.random() > 0.35) return;
    const bots = (ui.estado.jugadores || []).filter(function (j) { return j.tipo === "bot"; });
    if (!bots.length) return;
    const bot = bots[Math.floor(Math.random() * bots.length)];
    const pool = motivo === "all-in"
      ? ["¡All in!", "Sos un farol", "😎", "🔥"]
      : (motivo === "win" ? ["¡Buena mano!", "Qué suerte", "Gg", "👏"] : ["Apúrate", "😂"]);
    const frase = pool[Math.floor(Math.random() * pool.length)];
    setTimeout(function () {
      mostrarFrase({ frase: frase, deNombre: bot.nombre, deAsiento: bot.asiento, deId: bot.id });
    }, 600 + Math.random() * 900);
  }

  function fichasPorBs() {
    return (ui.cuentas && ui.cuentas.fichasPorBs) || 10;
  }

  function minRecargaBs() {
    return (ui.cuentas && ui.cuentas.minBs) || 10;
  }

  function recibirCuentas(msg) {
    if (!msg || !msg.cuentas) return;
    const eraTerminada = ui.cuentas && ui.cuentas.partidaTerminada;
    ui.cuentas = msg.cuentas;
    const grupoAntes = ui.grupoSala ? ui.grupoSala.codigo : null;
    ui.grupoSala = msg.cuentas.grupo || null;
    if ((ui.grupoSala ? ui.grupoSala.codigo : null) !== grupoAntes) ui.grupo = null;
    if (!msg.cuentas.partidasCerradas) ui.verNoche = false;
    pintarGrupo();
    pintarCambio();
    pintarResumen();
    pintarNotaRecarga();
    if (ui.cuentas.partidaTerminada && !eraTerminada) {
      abrirCuentas("resumen");
    }
    if (msg.mensajeCuentas) toast(msg.mensajeCuentas, "ok");
  }

  function pintarCambio() {
    const n = fichasPorBs();
    const min = minRecargaBs();
    const el = $("texto-cambio");
    if (el) {
      el.innerHTML = "Cambio: <strong>1 Bs = " + n + " fichas</strong>. El mínimo es " + min + " Bs (" + (min * n) + " fichas).";
    }
    actualizarPreviewRecarga();
  }

  function actualizarPreviewRecarga() {
    const inp = $("input-recarga");
    const prev = $("preview-recarga");
    if (!inp || !prev) return;
    const bs = Number(inp.value);
    const n = fichasPorBs();
    if (!isFinite(bs) || bs < minRecargaBs()) {
      prev.textContent = "El mínimo es " + minRecargaBs() + " Bs (" + (minRecargaBs() * n) + " fichas).";
    } else {
      prev.textContent = Math.floor(bs) + " Bs = " + (Math.floor(bs) * n) + " fichas.";
    }
  }

  function pintarNotaRecarga() {
    const nota = $("nota-recarga-pendiente");
    if (!nota) return;
    const yo = ui.cuentas && (ui.cuentas.jugadores || []).find(function (j) { return j.id === ui.tuId; });
    if (yo && yo.pendienteFichas > 0) {
      nota.hidden = false;
      const bs = yo.pendienteFichas / fichasPorBs();
      nota.textContent = "Tenés " + formatearBs(bs) + " (" + yo.pendienteFichas + " fichas) que se suman al empezar la próxima mano.";
    } else {
      nota.hidden = true;
      nota.textContent = "";
    }
  }

  function pintarResumen() {
    const caja = $("lista-cuentas");
    const pagosCaja = $("lista-pagos");
    if (!caja) return;
    const cuentas = ui.cuentas || { jugadores: [] };
    const hayNoche = (cuentas.partidasCerradas || 0) > 0 && (cuentas.noche || []).length > 0;
    if ($("selector-noche")) $("selector-noche").hidden = !hayNoche;
    const verNoche = hayNoche && ui.verNoche;
    if ($("ver-partida")) $("ver-partida").classList.toggle("activo", !verNoche);
    if ($("ver-noche")) $("ver-noche").classList.toggle("activo", verNoche);
    const num = cuentas.partidaNum || 1;
    if ($("titulo-resumen")) {
      const nPartidas = (cuentas.partidasCerradas || 0) + (cuentas.partidaTerminada ? 0 : 1);
      $("titulo-resumen").textContent = verNoche
        ? "Cuentas de la noche · " + nPartidas + (nPartidas === 1 ? " partida" : " partidas")
        : (num > 1 || hayNoche ? "Partida " + num + (cuentas.partidaTerminada ? " (terminada)" : " (en juego)") : "");
      $("titulo-resumen").hidden = !$("titulo-resumen").textContent;
    }
    const js = verNoche ? cuentas.noche.map(function (n) {
      return { nombre: n.nombre, resultadoBs: n.resultadoBs, partidas: n.partidas, enCurso: n.enCurso, noche: true };
    }) : (cuentas.jugadores || []);
    caja.innerHTML = "";
    if (!js.length) {
      caja.innerHTML = '<p class="hint">Todavía no hay recargas en esta mesa.</p>';
    }
    for (let i = 0; i < js.length; i++) {
      const j = js[i];
      const div = document.createElement("div");
      div.className = "fila-cuenta" + (j.seFue ? " se-fue" : "");
      let res = '<span class="tablas">En tablas</span>';
      if (j.resultadoBs > 0.009) res = '<span class="gano">Ganó ' + formatearBs(j.resultadoBs) + "</span>";
      else if (j.resultadoBs < -0.009) res = '<span class="debe">Debe ' + formatearBs(-j.resultadoBs) + "</span>";
      const yo = j.id && j.id === ui.tuId ? " (tú)" : "";
      const fue = j.seFue ? " · salió" : "";
      const detalle = j.noche
        ? j.partidas + (j.partidas === 1 ? " partida" : " partidas") + (j.enCurso ? " · incluye la que se está jugando" : "")
        : "Recargó " + formatearBs(j.recargadoBs) + " · Tiene ahora " + formatearBs(j.tieneBs);
      div.innerHTML = "<header><span>" + escapar(j.nombre || "Jugador") + yo + fue + "</span>" + res + "</header>" +
        '<div class="nums">' + detalle + "</div>";
      caja.appendChild(div);
    }
    if (pagosCaja) {
      const pagos = liquidarLocal(js);
      const avisoBote = cuentas.avisoBote && !verNoche
        ? "<p class=\"hint\">La cuenta usa las fichas que cada uno tiene ahora; lo que quedó en el bote de esta mano no está incluido.</p>"
        : "";
      if (!pagos.length) {
        pagosCaja.innerHTML = avisoBote + (js.length ? "<p>No hace falta pasarse plata entre sí.</p>" : "");
      } else {
        pagosCaja.innerHTML = avisoBote + "<p><strong>Quién le paga a quién</strong></p>" + pagos.map(function (p) {
          return "<p>" + escapar(p.de) + " le paga " + formatearBs(p.monto) + " a " + escapar(p.a) + ".</p>";
        }).join("");
      }
    }
    const btnFin = $("btn-terminar-partida");
    if (btnFin) {
      btnFin.hidden = !ui.esAnfitrion || !!(cuentas.partidaTerminada);
      btnFin.disabled = false;
      if (cuentas.terminarAlFinal) {
        btnFin.hidden = true;
      }
    }
    const btnOtra = $("btn-otra-partida");
    if (btnOtra) {
      btnOtra.hidden = !(ui.modo === "online" && ui.esAnfitrion && !ui.espectador && cuentas.partidaTerminada);
      btnOtra.disabled = false;
    }
  }

  /* ---------- Grupo: cuentas que se suman entre noches ---------- */

  const LS_GRUPO = "rf_grupo";
  const LS_GRUPO_COPIA = "rf_grupo_copia_";

  function leerLS(clave) {
    try { const t = localStorage.getItem(clave); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }
  function guardarLS(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* modo privado */ }
  }

  function recibirGrupo(msg) {
    ui.grupo = msg.grupo || null;
    if (msg.grupo && msg.copia) {
      // Copia firmada en este teléfono: si el servidor perdiera los datos, se recuperan desde acá
      guardarLS(LS_GRUPO_COPIA + msg.grupo.codigo, msg.copia);
      guardarLS(LS_GRUPO, { codigo: msg.grupo.codigo, nombre: msg.grupo.nombre });
    }
    if (!msg.grupo && msg.perdido && ui.esAnfitrion) {
      recuperarGrupo(msg.perdido.codigo, function () { enviarWS({ tipo: "grupo", accion: "ver" }); });
    }
    pintarGrupo();
  }

  /** Sube la copia guardada en este teléfono. Devuelve false si no hay copia (o ya se intentó). */
  function recuperarGrupo(codigo, luego) {
    ui.grupoRecuperando = ui.grupoRecuperando || {};
    const copia = leerLS(LS_GRUPO_COPIA + codigo);
    if (!copia || ui.grupoRecuperando[codigo] || typeof fetch !== "function") return false;
    ui.grupoRecuperando[codigo] = true;
    if ($("aviso-grupo")) $("aviso-grupo").textContent = "Recuperando el grupo desde este teléfono…";
    fetch("/api/grupo/copia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copia: copia })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (x) {
      if (x.ok) {
        toast("Grupo recuperado desde este teléfono.", "ok");
        if ($("aviso-grupo")) $("aviso-grupo").textContent = "";
        if (luego) luego();
      } else if ($("aviso-grupo")) {
        $("aviso-grupo").textContent = x.j.error || "No se pudo recuperar el grupo.";
      }
    }).catch(function () {
      if ($("aviso-grupo")) $("aviso-grupo").textContent = "Sin conexión: no se pudo recuperar el grupo.";
    });
    return true;
  }

  function pintarGrupo() {
    const actual = $("grupo-actual");
    const form = $("grupo-form");
    if (!actual || !form) return;
    const anfitrion = ui.modo === "online" && ui.esAnfitrion && !ui.espectador;
    if (ui.grupoSala) {
      form.hidden = true;
      const g = ui.grupo && ui.grupo.codigo === ui.grupoSala.codigo ? ui.grupo : null;
      let html = '<p class="titulo-grupo">👥 <strong>' + escapar(ui.grupoSala.nombre) + "</strong> · código <strong>" + escapar(ui.grupoSala.codigo) + "</strong></p>";
      if (!g) {
        html += '<p class="hint">Cargando las cuentas del grupo…</p>';
        if (!ui.grupoPedido) { ui.grupoPedido = true; setTimeout(function () { ui.grupoPedido = false; }, 4000); enviarWS({ tipo: "grupo", accion: "ver" }); }
      } else {
        html += '<p class="hint">' + g.partidas + (g.partidas === 1 ? " partida" : " partidas") + " en " + g.noches + (g.noches === 1 ? " noche" : " noches") +
          ". Cada partida que terminen se suma acá.</p>";
        if (!g.totales.length) html += '<p class="hint">Todavía no hay partidas terminadas en este grupo.</p>';
        html += '<div class="lista-cuentas">' + g.totales.map(function (t) {
          let res = '<span class="tablas">En tablas</span>';
          if (t.resultadoBs > 0.009) res = '<span class="gano">Ganó ' + formatearBs(t.resultadoBs) + "</span>";
          else if (t.resultadoBs < -0.009) res = '<span class="debe">Debe ' + formatearBs(-t.resultadoBs) + "</span>";
          return '<div class="fila-cuenta"><header><span>' + escapar(t.nombre) + "</span>" + res + '</header><div class="nums">' +
            t.partidas + (t.partidas === 1 ? " partida" : " partidas") + " · " + t.noches + (t.noches === 1 ? " noche" : " noches") + "</div></div>";
        }).join("") + "</div>";
        if (g.ultimas && g.ultimas.length) {
          html += '<details class="ultimas-grupo"><summary>Últimas partidas</summary>' + g.ultimas.map(function (s) {
            const f = new Date(s.fecha);
            const fecha = isNaN(f) ? "" : f.toLocaleDateString("es", { day: "2-digit", month: "2-digit" });
            return "<p><strong>" + fecha + " · mesa " + escapar(s.sala) + " · partida " + s.partida + "</strong><br>" + s.jugadores.map(function (j) {
              const r = Number(j.resultadoBs) || 0;
              return escapar(j.nombre) + " " + (r > 0 ? "+" : "") + formatearBs(r);
            }).join(" · ") + "</p>";
          }).join("") + "</details>";
        }
      }
      if (anfitrion) html += '<button type="button" id="btn-grupo-quitar" class="btn block btn-chico">Dejar de guardar en este grupo</button>';
      actual.innerHTML = html;
      const quitar = $("btn-grupo-quitar");
      if (quitar) quitar.addEventListener("click", function () { enviarWS({ tipo: "grupo", accion: "quitar" }); });
      return;
    }
    actual.innerHTML = anfitrion ? "" : '<p class="hint">El anfitrión de la mesa puede guardar las cuentas en un grupo para sumar todas las noches.</p>';
    form.hidden = !anfitrion;
    const guardado = leerLS(LS_GRUPO);
    const b = $("btn-grupo-guardado");
    if (b) {
      b.hidden = !(anfitrion && guardado && guardado.codigo);
      if (guardado && guardado.codigo) b.textContent = "Usar «" + guardado.nombre + "» (" + guardado.codigo + ")";
    }
  }

  function crearGrupo() {
    const nombre = ($("input-grupo-nombre") && $("input-grupo-nombre").value || "").trim();
    if (nombre.length < 2) { $("aviso-grupo").textContent = "Ponele un nombre al grupo (al menos 2 letras)."; return; }
    $("aviso-grupo").textContent = "";
    enviarWS({ tipo: "grupo", accion: "crear", nombre: nombre });
  }

  function usarGrupo(codigo) {
    codigo = String(codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (codigo.length !== 6) { $("aviso-grupo").textContent = "El código del grupo tiene 6 letras o números."; return; }
    $("aviso-grupo").textContent = "";
    if (ui.grupoRecuperando) delete ui.grupoRecuperando[codigo];
    enviarWS({ tipo: "grupo", accion: "usar", codigo: codigo });
  }

  function liquidarLocal(jugadores) {
    const deudores = [];
    const acreedores = [];
    for (let i = 0; i < jugadores.length; i++) {
      const r = Math.round((Number(jugadores[i].resultadoBs) || 0) * 100) / 100;
      if (r < -0.009) deudores.push({ nombre: jugadores[i].nombre, falta: Math.round(-r * 100) / 100 });
      else if (r > 0.009) acreedores.push({ nombre: jugadores[i].nombre, haber: r });
    }
    deudores.sort(function (a, b) { return b.falta - a.falta; });
    acreedores.sort(function (a, b) { return b.haber - a.haber; });
    const pagos = [];
    let i = 0, k = 0;
    while (i < deudores.length && k < acreedores.length) {
      const monto = Math.round(Math.min(deudores[i].falta, acreedores[k].haber) * 100) / 100;
      if (monto > 0.009) pagos.push({ de: deudores[i].nombre, a: acreedores[k].nombre, monto: monto });
      deudores[i].falta = Math.round((deudores[i].falta - monto) * 100) / 100;
      acreedores[k].haber = Math.round((acreedores[k].haber - monto) * 100) / 100;
      if (deudores[i].falta <= 0.009) i++;
      if (acreedores[k].haber <= 0.009) k++;
    }
    return pagos;
  }

  function mostrarTabCuentas(tab) {
    if (tab !== "resumen" && tab !== "grupo") tab = "recargar";
    const vistas = { recargar: "vista-recargar", resumen: "vista-resumen", grupo: "vista-grupo" };
    const titulos = { recargar: "Recargar", resumen: "Resumen", grupo: "Grupo" };
    Object.keys(vistas).forEach(function (k) {
      if ($(vistas[k])) $(vistas[k]).hidden = k !== tab;
      if ($("tab-" + k)) $("tab-" + k).classList.toggle("activo", k === tab);
    });
    if ($("titulo-cuentas")) $("titulo-cuentas").textContent = titulos[tab];
    if (tab === "grupo") pintarGrupo();
  }

  /** En solo no hay cuentas en Bs con otros: la recarga suma fichas al toque (o en la próxima mano). */
  function recargarSolo(bs) {
    const j = ui.mesa && ui.mesa.jugadorPorId(ui.tuId);
    if (!j) return;
    const fichas = bs * fichasPorBs();
    const enJuego = j.enMano && !j.retirado && ui.mesa.fase && ui.mesa.fase !== "entre-manos" && ui.mesa.fase !== "esperando";
    if (enJuego) {
      ui.recargaSoloPendiente = (ui.recargaSoloPendiente || 0) + fichas;
      toast("Se suman " + fichas + " fichas al empezar la próxima mano.", "ok");
    } else {
      j.fichas += fichas;
      toast("Recargaste " + bs + " Bs (" + fichas + " fichas).", "ok");
    }
    sonar("premio");
    if ($("panel-cuentas")) $("panel-cuentas").hidden = true;
    renderMesa(ui.mesa.estadoPublico(ui.tuId));
  }

  function pintarSinFichas(estado) {
    const barra = $("barra-sin-fichas");
    if (!barra) return;
    const yo = estado && !ui.espectador && (estado.jugadores || []).find(function (j) { return j.id === ui.tuId; });
    const yoC = ui.cuentas && (ui.cuentas.jugadores || []).find(function (j) { return j.id === ui.tuId; });
    const pendiente = (ui.modo === "solo" ? ui.recargaSoloPendiente : (yoC && yoC.pendienteFichas)) || 0;
    const terminada = ui.modo === "online" && ui.cuentas && ui.cuentas.partidaTerminada;
    const enJuego = yo && yo.enMano && !yo.retirado && estado.fase && estado.fase !== "entre-manos" && estado.fase !== "esperando";
    barra.hidden = !(yo && yo.fichas <= 0 && !enJuego && !pendiente && !terminada && (ui.modo === "solo" || ui.modo === "online"));
    document.body.classList.toggle("con-barra-sin-fichas", !barra.hidden);
  }

  function abrirCuentas(tab) {
    const panel = $("panel-cuentas");
    if (!panel) return;
    const solo = ui.modo === "solo";
    if ($("tab-resumen")) $("tab-resumen").hidden = solo;
    if ($("tab-grupo")) $("tab-grupo").hidden = solo;
    if (solo) tab = "recargar";
    if ($("panel-chat")) $("panel-chat").hidden = true;
    panel.hidden = false;
    mostrarTabCuentas(tab || "recargar");
    pintarCambio();
    pintarResumen();
    pintarNotaRecarga();
    const inp = $("input-recarga");
    if (inp && (!tab || tab === "recargar")) inp.focus();
  }

  function enviarRecarga() {
    const aviso = $("aviso-recarga");
    if (aviso) aviso.textContent = "";
    const inp = $("input-recarga");
    const bs = Math.floor(Number(inp && inp.value));
    const min = minRecargaBs();
    if (!isFinite(bs) || bs < min) {
      const msg = "El mínimo para recargar es " + min + " Bs.";
      if (aviso) aviso.textContent = msg;
      toast(msg, "err");
      return;
    }
    if (ui.modo === "solo") {
      recargarSolo(bs);
      return;
    }
    if (ui.modo !== "online") return;
    enviarWS({ tipo: "recargar", cantidadBs: bs });
  }

  /* ---------- Enlazar botones ---------- */

  /** App instalable: el service worker solo guarda archivos; nunca la conexión en vivo. */
  function registrarServiceWorker() {
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () { /* sin SW igual funciona */ });
    });
  }

  function iniciarUI() {
    registrarServiceWorker();
    cargarPreferencias();
    cargarMonedero();
    if (ui.avatar && Tienda && ui.monedero) ui.avatar = Tienda.avatarPermitido(ui.monedero, ui.avatar);
    if ($("btn-editar-avatar")) $("btn-editar-avatar").addEventListener("click", function () { abrirPersonalizar(irMenu); });
    if ($("btn-tienda")) $("btn-tienda").addEventListener("click", function () { abrirTienda(); });
    if ($("btn-tienda-avatar")) $("btn-tienda-avatar").addEventListener("click", function () { abrirPersonalizar(function () { abrirTienda(); }); });
    if ($("btn-volver-tienda")) $("btn-volver-tienda").addEventListener("click", irMenu);
    document.querySelectorAll(".tabs-tienda button").forEach(function (b) {
      b.addEventListener("click", function () { ui.tabTienda = b.dataset.tab; pintarTienda(); });
    });
    if ($("grilla-tienda")) $("grilla-tienda").addEventListener("click", function (ev) {
      const b = ev.target.closest("button[data-accion]");
      if (b) accionTienda(b.dataset.accion, b.dataset.id);
    });
    if ($("btn-canjear")) $("btn-canjear").addEventListener("click", function () { canjearCodigo(); });
    if ($("input-codigo-monedas")) $("input-codigo-monedas").addEventListener("keydown", function (ev) { if (ev.key === "Enter") canjearCodigo(); });
    if ($("btn-codigo-menu")) $("btn-codigo-menu").addEventListener("click", alternarCodigoMenu);
    if ($("opcion-barajado")) {
      $("opcion-barajado").checked = barajadoActivo();
      $("opcion-barajado").addEventListener("change", function () {
        try { localStorage.setItem(LS_BARAJADO, this.checked ? "1" : "0"); } catch (e) { /* */ }
      });
    }
    if ($("btn-canjear-menu")) $("btn-canjear-menu").addEventListener("click", function () { canjearCodigo("input-codigo-menu", "aviso-codigo-menu"); });
    if ($("input-codigo-menu")) $("input-codigo-menu").addEventListener("keydown", function (ev) { if (ev.key === "Enter") canjearCodigo("input-codigo-menu", "aviso-codigo-menu"); });
    if ($("form-chat")) $("form-chat").addEventListener("submit", function (ev) { ev.preventDefault(); enviarTextoChat(); });
    if ($("input-chat")) {
      $("input-chat").addEventListener("input", pintarCuentaChat);
      // Las teclas del chat no deben disparar los atajos de la mesa (R, C…)
      $("input-chat").addEventListener("keydown", function (ev) { ev.stopPropagation(); });
    }
    if ($("btn-recargar-sin-fichas")) $("btn-recargar-sin-fichas").addEventListener("click", function () { abrirCuentas("recargar"); });
    if ($("btn-recuperar-monedero")) $("btn-recuperar-monedero").addEventListener("click", recuperarMonedero);
    if ($("btn-comprar-bloqueadas")) $("btn-comprar-bloqueadas").addEventListener("click", comprarBloqueadas);
    if ($("btn-mesas-vivo")) $("btn-mesas-vivo").addEventListener("click", abrirMesasVivo);
    if ($("btn-actualizar-vivo")) $("btn-actualizar-vivo").addEventListener("click", cargarMesasVivo);
    if ($("btn-volver-vivo")) $("btn-volver-vivo").addEventListener("click", irMenu);
    if ($("lista-mesas-vivo")) $("lista-mesas-vivo").addEventListener("click", function (ev) {
      const b = ev.target.closest("button[data-mirar]");
      if (!b) return;
      if ($("input-codigo")) $("input-codigo").value = b.dataset.mirar;
      mirarCodigo();
    });
    iniciarSelectoresFichas();
    if ($("btn-solo")) $("btn-solo").addEventListener("click", function () {
      conNombreYAvatar(function () { irSolo(); });
    });
    if ($("btn-amigos")) $("btn-amigos").addEventListener("click", jugarConAmigos);
    if ($("btn-publica")) $("btn-publica").addEventListener("click", jugarPublica);
    if ($("btn-online")) $("btn-online").addEventListener("click", jugarConAmigos);
    if ($("btn-entrar-invitacion")) $("btn-entrar-invitacion").addEventListener("click", entrarInvitacion);
    if ($("btn-invitar-amigo")) $("btn-invitar-amigo").addEventListener("click", invitarAmigo);
    if ($("btn-copiar-enlace")) $("btn-copiar-enlace").addEventListener("click", function () { copiarEnlaceSala(ui.codigo); });
    if ($("btn-compartir-sala")) $("btn-compartir-sala").addEventListener("click", invitarAmigo);
    if ($("btn-compartir-mesa")) $("btn-compartir-mesa").addEventListener("click", invitarAmigo);
    if ($("input-enlace-sala")) $("input-enlace-sala").addEventListener("focus", function () { this.select(); });
    $("btn-volver-solo").addEventListener("click", irMenu);
    if ($("btn-volver-online")) $("btn-volver-online").addEventListener("click", irMenu);
    $("btn-empezar-solo").addEventListener("click", empezarSolo);

    if ($("btn-crear-privada")) $("btn-crear-privada").addEventListener("click", crearPrivada);
    if ($("btn-unirse-codigo")) $("btn-unirse-codigo").addEventListener("click", function () {
      conNombreYAvatar(function () { unirseCodigo(); }, { saltarAvatar: true });
    });
    if ($("btn-mirar-codigo")) $("btn-mirar-codigo").addEventListener("click", mirarCodigo);
    if ($("btn-sala-publica")) $("btn-sala-publica").addEventListener("click", jugarPublica);
    if ($("btn-llenar-bots")) $("btn-llenar-bots").addEventListener("click", function () { enviarWS({ tipo: "llenar-bots" }); });
    if ($("btn-iniciar-online")) $("btn-iniciar-online").addEventListener("click", function () {
      enviarWS({ tipo: ui.cuentas && ui.cuentas.partidaTerminada ? "otra-partida" : "iniciar" });
    });
    if ($("btn-salir-sala")) $("btn-salir-sala").addEventListener("click", function () {
      enviarWS({ tipo: "salir" });
      cerrarWS(true);
      borrarSesionSala();
      irMenu();
    });
    $("btn-salir-mesa").addEventListener("click", function () {
      if (ui.modo === "online") {
        enviarWS({ tipo: "salir" });
        cerrarWS(true);
        borrarSesionSala();
      }
      irMenu();
    });
    if ($("btn-avatar-listo")) $("btn-avatar-listo").addEventListener("click", function () { terminarAvatar(false); });
    if ($("btn-avatar-aleatorio")) $("btn-avatar-aleatorio").addEventListener("click", function () {
      ui.avatarEdicion = Avatar.aleatorio();
      if (!piezasBloqueadasEdicion().length) guardarAvatar(ui.avatarEdicion);
      montarControlesAvatar();
      pintarPreviewAvatar();
    });
    if ($("btn-avatar-saltar")) $("btn-avatar-saltar").addEventListener("click", function () { terminarAvatar(true); });
    iniciarAtajos();
    setInterval(pintarReloj, 250);
    if ($("btn-abrir-historial")) $("btn-abrir-historial").addEventListener("click", abrirHistorial);
    if ($("btn-cerrar-historial")) $("btn-cerrar-historial").addEventListener("click", function () { $("panel-historial").hidden = true; });
    if ($("btn-sonido")) {
      $("btn-sonido").addEventListener("click", alternarSonido);
      pintarBotonSonido();
    }
    if ($("btn-abrir-chat")) $("btn-abrir-chat").addEventListener("click", abrirChat);
    if ($("btn-cerrar-chat")) $("btn-cerrar-chat").addEventListener("click", function () { $("panel-chat").hidden = true; });
    if ($("btn-abrir-cuentas")) $("btn-abrir-cuentas").addEventListener("click", function () { abrirCuentas("recargar"); });
    if ($("btn-cuentas-sala")) $("btn-cuentas-sala").addEventListener("click", function () { abrirCuentas("recargar"); });
    if ($("btn-cerrar-cuentas")) $("btn-cerrar-cuentas").addEventListener("click", function () { $("panel-cuentas").hidden = true; });
    if ($("tab-recargar")) $("tab-recargar").addEventListener("click", function () { mostrarTabCuentas("recargar"); });
    if ($("tab-resumen")) $("tab-resumen").addEventListener("click", function () { mostrarTabCuentas("resumen"); });
    if ($("tab-grupo")) $("tab-grupo").addEventListener("click", function () { mostrarTabCuentas("grupo"); });
    if ($("ver-partida")) $("ver-partida").addEventListener("click", function () { ui.verNoche = false; pintarResumen(); });
    if ($("ver-noche")) $("ver-noche").addEventListener("click", function () { ui.verNoche = true; pintarResumen(); });
    if ($("btn-otra-partida")) $("btn-otra-partida").addEventListener("click", function () {
      this.disabled = true;
      enviarWS({ tipo: "otra-partida" });
    });
    if ($("btn-grupo-crear")) $("btn-grupo-crear").addEventListener("click", crearGrupo);
    if ($("btn-grupo-usar")) $("btn-grupo-usar").addEventListener("click", function () { usarGrupo($("input-grupo-codigo").value); });
    if ($("btn-grupo-guardado")) $("btn-grupo-guardado").addEventListener("click", function () {
      const g = leerLS(LS_GRUPO);
      if (g) usarGrupo(g.codigo);
    });
    if ($("btn-recargar")) $("btn-recargar").addEventListener("click", enviarRecarga);
    if ($("input-recarga")) {
      $("input-recarga").addEventListener("input", actualizarPreviewRecarga);
      $("input-recarga").addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") enviarRecarga();
      });
    }
    if ($("btn-terminar-partida")) $("btn-terminar-partida").addEventListener("click", function () {
      enviarWS({ tipo: "terminar-partida" });
    });
    if ($("nombre-jugador")) {
      $("nombre-jugador").addEventListener("change", guardarNombre);
      $("nombre-jugador").addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          if (codigoDesdeUbicacion()) entrarInvitacion();
        }
      });
    }

    $("btn-retirarse").addEventListener("click", function () { enviarAccion("retirarse"); });
    $("btn-pasar").addEventListener("click", function () { enviarAccion("pasar"); });
    $("btn-igualar").addEventListener("click", function () { enviarAccion("igualar"); });
    $("btn-subir").addEventListener("click", function () {
      enviarAccion($("btn-subir").textContent === "Apostar" ? "apostar" : "subir", Number($("rango-subida").value));
    });
    $("btn-allin").addEventListener("click", function () { enviarAccion("all-in"); });
    $("rango-subida").addEventListener("input", function () {
      $("texto-subida").textContent = formatearFichas($("rango-subida").value);
    });

    if ($("input-codigo")) $("input-codigo").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") unirseCodigo();
    });
    mostrarInvitacionPendiente();
    const inv = codigoDesdeUbicacion();
    if (ui.token && ui.codigo && (!inv || inv === ui.codigo)) {
      ui.modo = "online";
      conectarWS().then(function () {
        enviarWS({ tipo: "reconectar", token: ui.token, codigo: ui.codigo });
      }).catch(function () { ui.modo = "menu"; });
    }

    let timerResize = null;
    window.addEventListener("resize", function () {
      if (!ui.estado || !$("pantalla-mesa") || $("pantalla-mesa").hidden) return;
      clearTimeout(timerResize);
      timerResize = setTimeout(function () {
        if (ui.estado && $("pantalla-mesa") && !$("pantalla-mesa").hidden) {
          renderMesa(ui.estado);
        }
      }, 150);
    });
  }

  function montarDemo(opt) {
    opt = opt || {};
    detenerPartidaLocal();
    const fichas = opt.fichas || 1000;
    const ciegas = Motor.ciegasPara(fichas);
    const n = opt.asientos || 9;
    const mesa = new Motor.Mesa({
      asientos: n,
      fichasIniciales: ciegas.fichasIniciales,
      ciegaPequena: ciegas.ciegaPequena,
      ciegaGrande: ciegas.ciegaGrande
    });
    const nombre = opt.nombre || "Fernando";
    // asientoHumano: para probar mesas online donde no estás en el asiento 0
    const asH = Math.max(0, Math.min(n - 1, opt.asientoHumano | 0));
    mesa.sentar({ id: "humano", nombre: nombre, tipo: "humano", asiento: asH, fichas: ciegas.fichasIniciales, avatar: (ui.avatar || (Avatar && Avatar.aleatorio(nombre))) });
    const usados = [nombre];
    const largos = ["Maximiliano", "Juan Esteban", "Valentina M.", "Ana-Sofía", "Roberto Carlos", "Isabel María", "Diego Armando", "Chris"];
    const pers = Bots.repartirPersonalidades(n - 1);
    for (let i = 1; i < n; i++) {
      const bot = Bots.crearBot(usados, pers[i - 1]);
      const nom = opt.nombresLargos ? (largos[i - 1] || bot.nombre) : bot.nombre;
      usados.push(nom);
      mesa.sentar({ id: "bot-" + i, nombre: nom, tipo: "bot", personalidad: bot.personalidad, asiento: (i <= asH ? i - 1 : i), fichas: ciegas.fichasIniciales, avatar: Avatar ? Avatar.aleatorio(nom) : null });
    }
    ui.mesa = mesa;
    ui.tuId = "humano";
    ui.modo = "solo";
    ui.animando = false;
    mesa.iniciarMano();
    mesa.empezarApuestas();
    const objetivo = opt.fase || "flop";
    let guard = 0;
    if (opt.todasApuestas) {
      let hechoRaise = false;
      while (guard++ < 80) {
        if (mesa.fase !== "preflop") break;
        const id = mesa.turnoId;
        if (!id) break;
        const legales = mesa.accionesLegales(id);
        if (!hechoRaise && (legales.puedeSubir || legales.puedeApostar)) {
          const tipo = legales.puedeSubir ? "subir" : "apostar";
          const cant = Math.min(legales.maxSubida, Math.max(legales.minSubida, (mesa.ciegaGrande || 10) * 4));
          mesa.accion(id, tipo, cant);
          hechoRaise = true;
          continue;
        }
        const enMano = mesa.jugadores().filter(function (p) { return p.enMano; });
        const maxAp = Math.max.apply(null, enMano.map(function (p) { return p.apuestaRonda || 0; }).concat([0]));
        const falta = enMano.filter(function (p) {
          return !p.allIn && p.apuestaRonda < maxAp && p.id !== id;
        });
        if (hechoRaise && falta.length === 0) break;
        if (legales.puedeIgualar) mesa.accion(id, "igualar");
        else if (legales.puedePasar) mesa.accion(id, "pasar");
        else break;
      }
    } else {
      while (guard++ < 220) {
        if (objetivo === "preflop" && mesa.fase === "preflop") break;
        if (objetivo === "flop" && mesa.fase === "flop") break;
        if (objetivo === "turn" && mesa.fase === "turn") break;
        if (objetivo === "river" && mesa.fase === "river") break;
        if (objetivo === "showdown" && (mesa.fase === "entre-manos" || mesa.fase === "showdown" || mesa.resultadoShowdown)) break;
        if (mesa.fase === "entre-manos" && objetivo !== "showdown") break;
        const id = mesa.turnoId;
        if (!id) break;
        const legales = mesa.accionesLegales(id);
        if (legales.puedePasar) mesa.accion(id, "pasar");
        else if (legales.puedeIgualar) mesa.accion(id, "igualar");
        else if (legales.puedeAllIn) mesa.accion(id, "all-in");
        else mesa.accion(id, "retirarse");
      }
    }
    $("info-sala").textContent = "Modo solo · " + n + " asientos";
    $("info-ciegas").textContent = "Ciegas " + mesa.ciegaPequena + " / " + mesa.ciegaGrande;
    $("mensaje-mesa").className = (objetivo === "showdown") ? "premio" : "";
    $("mensaje-mesa").textContent = mesa.mensaje || (objetivo === "flop" ? "Flop" : "");
    mostrar("pantalla-mesa");
    renderMesa(mesa.estadoPublico(ui.tuId));
    if (opt.forzarAcciones && $("panel-acciones")) {
      $("panel-acciones").hidden = false;
      requestAnimationFrame(function () { aplicarLayout(mesa.estadoPublico(ui.tuId)); });
    }
    if (objetivo === "showdown") celebrar(mesa.estadoPublico(ui.tuId));
    return mesa;
  }

  /**
   * Revisa que tus dos cartas se vean bien: visibles, de tamaño legible, dentro de la pantalla,
   * sin nada encima y pegadas a tu asiento. Lo usan las pruebas de navegador y el chequeo de solapes.
   */
  function medirCartasPropias() {
    const problemas = [];
    const pieza = document.querySelector("#asientos .pieza-cartas.propio");
    const infoEl = document.querySelector("#asientos .pieza-info.propio .info-jugador") ||
      document.querySelector("#asientos .pieza-info.propio");
    if (!pieza) return { ok: false, problemas: ["no hay asiento propio"], cartas: [] };
    const cartas = Array.prototype.slice.call(pieza.querySelectorAll(".carta, .carta-dorso"));
    if (cartas.length !== 2) problemas.push("se esperaban 2 cartas y hay " + cartas.length);
    const vw = window.innerWidth, vh = window.innerHeight;
    const grande = vw >= 1000 && vh >= 700;
    const minW = grande ? 40 : 28;
    const minH = Math.round(minW * 1.3);
    const prevPE = pieza.style.pointerEvents;
    pieza.style.pointerEvents = "auto";
    const salida = [];
    for (let k = 0; k < cartas.length; k++) {
      const c = cartas[k];
      const r = c.getBoundingClientRect();
      salida.push([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]);
      let el = c;
      while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.9) {
          problemas.push("carta " + (k + 1) + " oculta por " + (el.className || el.tagName));
          break;
        }
        el = el.parentElement;
      }
      if (r.width < minW || r.height < minH) problemas.push("carta " + (k + 1) + " muy chica " + Math.round(r.width) + "x" + Math.round(r.height) + " (mín " + minW + "x" + minH + ")");
      if (r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh) problemas.push("carta " + (k + 1) + " fuera de la pantalla");
      // la primera queda tapada a la derecha por la segunda: se mira su esquina (número y palo)
      const puntos = k === cartas.length - 1
        ? [[0.2, 0.15], [0.5, 0.5], [0.8, 0.85], [0.2, 0.85], [0.8, 0.15]]
        : [[0.15, 0.12], [0.15, 0.3], [0.15, 0.85]];
      for (let q = 0; q < puntos.length; q++) {
        const x = r.left + r.width * puntos[q][0], y = r.top + r.height * puntos[q][1];
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(c === hit || c.contains(hit))) {
          problemas.push("carta " + (k + 1) + " tapada en (" + Math.round(x) + "," + Math.round(y) + ") por " +
            (hit ? (hit.className && hit.className.baseVal !== undefined ? hit.tagName : (hit.id || hit.className || hit.tagName)) : "nada"));
          break;
        }
      }
    }
    pieza.style.pointerEvents = prevPE;
    if (infoEl && cartas.length) {
      const ri = infoEl.getBoundingClientRect();
      let l = Infinity, t = Infinity, rr = -Infinity, b = -Infinity;
      cartas.forEach(function (c) { const q = c.getBoundingClientRect(); l = Math.min(l, q.left); t = Math.min(t, q.top); rr = Math.max(rr, q.right); b = Math.max(b, q.bottom); });
      const dx = Math.max(0, ri.left - rr, l - ri.right);
      const dy = Math.max(0, ri.top - b, t - ri.bottom);
      const dist = Math.round(Math.hypot(dx, dy));
      if (dist > 30) problemas.push("cartas lejos de tu asiento (" + dist + " px)");
      // y tienen que estar más cerca de tu nombre que del de cualquier otro (que se note que son tuyas)
      const otros = document.querySelectorAll("#asientos .pieza-info:not(.propio) .info-jugador");
      for (let k = 0; k < otros.length; k++) {
        const ro = otros[k].getBoundingClientRect();
        if (!ro.width) continue;
        const ox = Math.max(0, ro.left - rr, l - ro.right), oy = Math.max(0, ro.top - b, t - ro.bottom);
        const d2 = Math.hypot(ox, oy);
        if (d2 < 4 || d2 + 2 < dist) {
          problemas.push("cartas pegadas a otro jugador (" + Math.round(d2) + " px de " + ((otros[k].querySelector(".nombre-jugador") || {}).textContent || "?") + ", " + dist + " px de ti)");
          break;
        }
      }
    }
    return { ok: problemas.length === 0, problemas: problemas, cartas: salida };
  }

  window.__RF = {
    medirCartasPropias: medirCartasPropias,
    montarDemo: montarDemo,
    renderMesa: renderMesa,
    aplicarLayout: aplicarLayout,
    medirSolapes: medirSolapes,
    separarSolapes: function () { if (ui.estado) aplicarLayout(ui.estado); },
    formatearFichas: formatearFichas,
    ui: ui
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarUI);
  } else {
    iniciarUI();
  }
})();
