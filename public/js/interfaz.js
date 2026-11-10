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
    ultimaSecuencia: null
  };

  const $ = function (id) { return document.getElementById(id); };

  function nombreJugador() {
    const v = ($("nombre-jugador").value || "").trim();
    return v || "Fernando";
  }

  function asientosElegidos(nombre) {
    const marcado = document.querySelector('input[name="' + nombre + '"]:checked');
    return marcado ? Number(marcado.value) : 9;
  }

  function formatearFichas(n) {
    n = Math.round(Number(n) || 0);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

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
    const ids = ["pantalla-menu", "pantalla-solo", "pantalla-online", "pantalla-sala", "pantalla-mesa"];
    for (let i = 0; i < ids.length; i++) {
      const el = $(ids[i]);
      if (!el) continue;
      if (ids[i] === idPantalla) el.hidden = false;
      else el.hidden = true;
    }
  }

  /* ---------- Navegación del menú ---------- */

  function irMenu() {
    detenerPartidaLocal();
    cerrarWS();
    ui.modo = "menu";
    mostrar("pantalla-menu");
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
    mostrar("pantalla-online");
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
      ciegaGrande: ciegas.ciegaGrande
    });
    ui.mesa = mesa;
    ui.tuId = "humano";
    ui.modo = "solo";
    ui.codigo = null;

    mesa.sentar({ id: "humano", nombre: nombreJugador(), tipo: "humano", asiento: 0, fichas: ciegas.fichasIniciales });
    const usados = [nombreJugador()];
    for (let i = 1; i < n; i++) {
      const nom = Bots.nombreBot(usados);
      usados.push(nom);
      mesa.sentar({ id: "bot-" + i, nombre: nom, tipo: "bot", asiento: i, fichas: ciegas.fichasIniciales });
    }

    mesa.on(alEventoLocal);
    $("info-sala").textContent = "Modo solo · " + n + " asientos";
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
      celebrar(estado);
      programarNuevaMano();
      return;
    }

    renderMesa(estado);
  }

  function programarNuevaMano() {
    if (ui.timerNuevaMano) clearTimeout(ui.timerNuevaMano);
    ui.timerNuevaMano = setTimeout(function () {
      if (ui.modo === "solo" && ui.mesa) ui.mesa.iniciarMano();
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
    }, delay);
  }

  /* ---------- Dibujo de la mesa ---------- */

  function htmlCarta(carta, extraClase) {
    if (!carta || carta.oculta) return htmlDorso(extraClase);
    const clases = ["carta"];
    if (carta.color === "roja") clases.push("roja");
    if (extraClase) clases.push(extraClase);
    return (
      '<div class="' + clases.join(" ") + '">' +
        '<span class="esquina arriba"><span class="rango">' + carta.texto + '</span><span class="mini-palo">' + carta.palo + "</span></span>" +
        '<span class="palo-centro">' + carta.palo + "</span>" +
        '<span class="esquina abajo"><span class="rango">' + carta.texto + '</span><span class="mini-palo">' + carta.palo + "</span></span>" +
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

  function geometriaMesa() {
    if (esVerticalEstrecho()) {
      return { gap: 1.05, info: [37, 38.2], cartas: [28, 30.6], apuesta: [22.2, 24], vaso: [42.6, 43.2], cy: 50.5 };
    }
    if (esHorizontalBajo()) {
      return { gap: 0.88, info: [41.5, 34.5], cartas: [36, 28.5], apuesta: [30.5, 22.5], vaso: [45, 38], cy: 50 };
    }
    return { gap: 0.8, info: [41.5, 36], cartas: [34.2, 29], apuesta: [28.5, 23], vaso: [45.2, 40.5], cy: 50 };
  }

  function actualizarOrientacionMesa() {
    const mesa = $("mesa-oval");
    if (!mesa) return;
    mesa.classList.toggle("vertical", esVerticalEstrecho());
  }

  function indiceCercanoAlJugador(i, total) {
    return i === 1 || i === total - 1;
  }

  function anguloAsiento(indice, total, gap) {
    const available = Math.PI * 2 - gap;
    const u = (indice / total) * available;
    const mid = Math.PI - gap / 2;
    return u <= mid ? u : u + gap;
  }

  function puntoEn(ang, rx, ry, cy) {
    return { x: 50 + Math.sin(ang) * rx, y: cy + Math.cos(ang) * ry };
  }

  function zonaDeAngulo(ang, indice) {
    if (indice === 0) return "abajo";
    const c = Math.cos(ang);
    if (c > 0.45) return "abajo";
    if (c < -0.35) return "arriba";
    return "lado";
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

  function estiloPunto(p) {
    return "left:" + p.x.toFixed(2) + "%;top:" + p.y.toFixed(2) + "%;";
  }

  function rectsSeSolapan(a, b, holgura) {
    holgura = holgura == null ? 2 : holgura;
    return !(a.right + holgura <= b.left || b.right + holgura <= a.left || a.bottom + holgura <= b.top || b.bottom + holgura <= a.top);
  }

  function separarSolapes() {
    const mesa = $("mesa-oval");
    if (!mesa) return;
    const mr = mesa.getBoundingClientRect();
    if (mr.width < 10 || mr.height < 10) return;
    const grupos = [];
    function add(sel, prio, fijo) {
      const els = document.querySelectorAll(sel);
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        grupos.push({ el: els[i], prio: prio, fijo: !!fijo });
      }
    }
    add("#centro-mesa", 0, true);
    add("#crupier", 1, true);
    add(".pieza-info", 3, false);
    add(".pieza-cartas", 4, false);
    add(".pieza-propio-grupo", 3, false);
    add(".pieza-apuesta", 5, false);

    for (let iter = 0; iter < 10; iter++) {
      let movio = false;
      for (let i = 0; i < grupos.length; i++) {
        for (let j = i + 1; j < grupos.length; j++) {
          const A = grupos[i], B = grupos[j];
          const ra = A.el.getBoundingClientRect();
          const rb = B.el.getBoundingClientRect();
          if (!rectsSeSolapan(ra, rb, 3)) continue;
          const movible = A.fijo ? B : (B.fijo ? A : (A.prio >= B.prio ? A : B));
          const otro = movible === A ? B : A;
          if (movible.fijo) continue;
          const rm = movible.el.getBoundingClientRect();
          const ro = otro.el.getBoundingClientRect();
          const cxm = (rm.left + rm.right) / 2;
          const cym = (rm.top + rm.bottom) / 2;
          const cxo = (ro.left + ro.right) / 2;
          const cyo = (ro.top + ro.bottom) / 2;
          let dx = cxm - cxo;
          let dy = cym - cyo;
          if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) { dx = 0.6; dy = 0.3; }
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const step = 5;
          const nx = cxm + (dx / len) * step;
          const ny = cym + (dy / len) * step;
          let px = ((nx - mr.left) / mr.width) * 100;
          let py = ((ny - mr.top) / mr.height) * 100;
          px = Math.max(7, Math.min(93, px));
          py = Math.max(8, Math.min(93, py));
          movible.el.style.left = px.toFixed(2) + "%";
          movible.el.style.top = py.toFixed(2) + "%";
          movio = true;
        }
      }
      if (!movio) break;
    }
  }

  function pintarPortaVasos(total, geo) {
    const caja = $("porta-vasos");
    if (!caja) return;
    let html = "";
    for (let i = 0; i < total; i++) {
      const ang = anguloAsiento(i, total, geo.gap);
      const p = puntoEn(ang, geo.vaso[0], geo.vaso[1], geo.cy);
      html += '<div class="porta-vaso" style="' + estiloPunto(p) + '"></div>';
    }
    caja.innerHTML = html;
  }

  function renderMesa(estado, opciones) {
    opciones = opciones || {};
    ui.estado = estado;
    if (!estado) return;

    actualizarOrientacionMesa();
    const total = estado.asientosTotales;
    const oval = $("mesa-oval");
    if (oval) oval.classList.toggle("asientos-10", total === 10);
    const ganadores = (estado.resultadoShowdown && estado.resultadoShowdown.ganadores)
      ? estado.resultadoShowdown.ganadores.map(function (g) { return g.id; })
      : [];

    if (estado.ciegaPequena && estado.ciegaGrande && $("info-ciegas")) {
      $("info-ciegas").textContent = "Ciegas " + estado.ciegaPequena + " / " + estado.ciegaGrande;
    }

    const geo = geometriaMesa();
    pintarPortaVasos(total, geo);

    const caja = $("asientos");
    let html = "";
    for (let i = 0; i < total; i++) {
      const ang = anguloAsiento(i, total, geo.gap);
      let ri = geo.info.slice();
      let rc = geo.cartas.slice();
      let ra = geo.apuesta.slice();
      if (indiceCercanoAlJugador(i, total)) {
        ri = [Math.min(46, ri[0] + 3.2), ri[1] - 2.2];
        rc = [rc[0] + 2.4, rc[1] - 1.6];
        ra = [ra[0] + 1.6, ra[1] - 1.2];
      }
      if (i === 0) {
        ri = [ri[0], Math.min(45.5, ri[1] + 2.6)];
        rc = [rc[0], rc[1] + 0.4];
      }
      const pInfo = puntoEn(ang, ri[0], ri[1], geo.cy);
      const pCartas = puntoEn(ang, rc[0], rc[1], geo.cy);
      const pAp = puntoEn(ang, ra[0], ra[1], geo.cy);
      const zona = zonaDeAngulo(ang, i);
      const j = (estado.jugadores || []).find(function (p) { return p.asiento === i; });
      const esPropio = !!(j && j.id === ui.tuId);
      const esGanador = !!(j && ganadores.indexOf(j.id) !== -1);
      const clasesExtra = (j && j.esTurno ? " es-turno" : "") + (j && j.retirado ? " retirado" : "") + (esPropio ? " propio" : "") + (esGanador ? " ganador" : "");

      let htmlCartas = '<div class="cartas-asiento">';
      if (j && j.cartas && j.cartas.length && !opciones.ocultarPrivadas) {
        for (let c = 0; c < j.cartas.length; c++) {
          htmlCartas += htmlCarta(j.cartas[c], esGanador ? "ganadora" : "");
        }
      } else if (j && j.enMano && opciones.ocultarPrivadas) {
        htmlCartas += htmlDorso() + htmlDorso();
      }
      htmlCartas += "</div>";

      let htmlInfo = '<div class="info-jugador">';
      htmlInfo += '<span class="anillo-turno" aria-hidden="true"><svg viewBox="0 0 36 36" preserveAspectRatio="none"><circle cx="18" cy="18" r="16.2" pathLength="120"></circle></svg></span>';
      if (j) {
        htmlInfo += '<div class="insignias">';
        if (j.esBoton) htmlInfo += '<span class="insignia" title="Botón del dealer">D</span>';
        if (j.esSB) htmlInfo += '<span class="insignia sb" title="Ciega pequeña">SB</span>';
        if (j.esBB) htmlInfo += '<span class="insignia bb" title="Ciega grande">BB</span>';
        htmlInfo += "</div>";
        htmlInfo += '<div class="nombre-jugador">' + escapar(j.nombre) + (esPropio ? " (tú)" : "") + "</div>";
        htmlInfo += '<div class="fichas-jugador">' + formatearFichas(j.fichas) + "</div>";
        htmlInfo += '<div class="estado-jugador">' + (j.allIn && j.ultimaAccion !== "all-in" ? "All-in" : textoAccion(j.ultimaAccion)) + "</div>";
      } else {
        htmlInfo += '<div class="nombre-jugador">Vacío</div>';
      }
      htmlInfo += "</div>";

      if (i === 0) {
        html += '<div class="pieza pieza-propio-grupo ' + zona + clasesExtra + '" data-asiento="' + i + '" style="' + estiloPunto(pInfo) + '">';
        html += htmlCartas + htmlInfo + "</div>";
      } else {
        html += '<div class="pieza pieza-cartas ' + zona + clasesExtra + '" data-asiento="' + i + '" style="' + estiloPunto(pCartas) + '">';
        html += htmlCartas + "</div>";
        html += '<div class="pieza pieza-info ' + zona + clasesExtra + '" data-asiento="' + i + '" style="' + estiloPunto(pInfo) + '">';
        html += htmlInfo + "</div>";
      }

      if (j && j.apuestaRonda > 0) {
        html += '<div class="pieza pieza-apuesta ' + zona + '" data-asiento="' + i + '" style="' + estiloPunto(pAp) + '">';
        html += '<div class="apuesta-frente">' + htmlPilaFichas(j.apuestaRonda, true) + "</div></div>";
      }
    }
    caja.innerHTML = html;

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
    requestAnimationFrame(function () {
      separarSolapes();
      requestAnimationFrame(separarSolapes);
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
  }

  function infoFichasPropias(estado) {
    const j = (estado.jugadores || []).find(function (p) { return p.id === ui.tuId; });
    return j ? j.fichas : 0;
  }

  function escapar(texto) {
    return String(texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
    await esperar(520);
    capa.innerHTML = "";
  }

  function celebrar(estado) {
    const capa = $("celebracion");
    if (!capa || movimientoReducido()) return;
    capa.innerHTML = "";
    const mesa = $("mesa-oval");
    if (!mesa) return;
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
    setTimeout(function () { if (capa) capa.innerHTML = ""; }, 1100);
  }

  async function animarReparto(secuencia) {
    const mesa = $("mesa-oval");
    const capa = $("cartas-volando");
    const origenEl = document.querySelector(".crupier-figura") || $("crupier");
    if (!secuencia || !secuencia.length || !mesa) return;

    const origen = rectRelativo(origenEl, mesa);
    capa.innerHTML = "";

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

  function cerrarWS() {
    if (ui.ws) {
      try { ui.ws.close(); } catch (e) { /* nada */ }
      ui.ws = null;
    }
  }

  function conectarWS() {
    return new Promise(function (resolve, reject) {
      const url = urlWS();
      if (!url) {
        reject(new Error("Hay que abrir el juego a través del servidor (http://localhost:3000)."));
        return;
      }
      if (ui.ws && ui.ws.readyState === 1) {
        resolve(ui.ws);
        return;
      }
      cerrarWS();
      const ws = new WebSocket(url);
      ui.ws = ws;
      const timer = setTimeout(function () {
        reject(new Error("No se pudo conectar con el servidor."));
        try { ws.close(); } catch (e) { /* nada */ }
      }, 6000);
      ws.addEventListener("open", function () {
        clearTimeout(timer);
        resolve(ws);
      });
      ws.addEventListener("error", function () {
        clearTimeout(timer);
        reject(new Error("Error de conexión. ¿Está arrancado el servidor?"));
      });
      ws.addEventListener("message", function (ev) {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        alMensajeServidor(msg);
      });
      ws.addEventListener("close", function () {
        if (ui.modo === "online") {
          const aviso = $("aviso-online");
          if (aviso && !$("pantalla-online").hidden) {
            aviso.textContent = "Se ha cerrado la conexión con el servidor.";
          }
        }
      });
    });
  }

  function enviarWS(obj) {
    if (ui.ws && ui.ws.readyState === 1) {
      ui.ws.send(JSON.stringify(obj));
    }
  }

  function alMensajeServidor(msg) {
    if (msg.tuId) ui.tuId = msg.tuId;
    if (msg.codigo) ui.codigo = msg.codigo;
    if (msg.esAnfitrion != null) ui.esAnfitrion = !!msg.esAnfitrion;
    if (msg.publica != null) ui.publica = !!msg.publica;

    if (msg.tipo === "error") {
      const aviso = !$("pantalla-sala").hidden ? $("aviso-sala") : $("aviso-online");
      if (aviso) aviso.textContent = msg.mensaje || "Ha ocurrido un error.";
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

    if (msg.tipo === "partida-iniciada" || msg.tipo === "mano-iniciada") {
      entrarEnMesaOnline(msg);
      if (msg.secuenciaReparto) {
        ui.animando = true;
        $("mensaje-mesa").textContent = "Don Luis reparte las cartas…";
        renderMesa(msg.estado, { ocultarPrivadas: true, vaciarComunitarias: true });
        animarReparto(msg.secuenciaReparto).then(function () {
          ui.animando = false;
          if (ui.estado) renderMesa(msg.estado);
          $("mensaje-mesa").textContent = "Preflop · a hablar.";
        });
      } else if (msg.estado) {
        renderMesa(msg.estado);
      }
      return;
    }

    if (msg.tipo === "calle" && msg.nuevas) {
      ui.animando = true;
      animarFichasAlBote().then(function () { return animarComunitarias(msg.nuevas); }).then(function () {
        ui.animando = false;
        if (msg.estado) renderMesa(msg.estado, { voltear: true });
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
      renderMesa(msg.estado);
      if (msg.estado.mensaje && (msg.tipo === "showdown" || msg.tipo === "ganador-sin-showdown" || msg.estado.fase === "entre-manos")) {
        $("mensaje-mesa").textContent = msg.estado.mensaje;
        $("mensaje-mesa").className = "premio";
        if (msg.tipo === "showdown" || msg.tipo === "ganador-sin-showdown") celebrar(msg.estado);
      }
    }
  }

  function entrarEnMesaOnline(msg) {
    ui.modo = "online";
    $("info-sala").textContent = (ui.publica ? "Sala pública" : "Sala privada") +
      (ui.codigo ? " · " + ui.codigo : "");
    $("info-ciegas").textContent = "Ciegas 5 / 10";
    mostrar("pantalla-mesa");
    if (msg.estado) renderMesa(msg.estado);
  }

  function pintarSalaEspera(msg) {
    $("codigo-sala").textContent = msg.codigo || ui.codigo || "";
    $("tipo-sala").textContent = msg.publica
      ? "Sala pública. Cualquiera puede unirse si queda un asiento libre."
      : "Sala privada. Comparte este código de 5 letras con tus amigos.";
    const lista = $("lista-jugadores-sala");
    const jugadores = (msg.estado && msg.estado.jugadores) || msg.jugadores || [];
    lista.innerHTML = "";
    for (let i = 0; i < jugadores.length; i++) {
      const j = jugadores[i];
      const li = document.createElement("li");
      li.innerHTML = escapar(j.nombre) +
        (j.id === ui.tuId ? " (tú)" : "") +
        (j.tipo === "bot" ? ' <span class="papel">bot</span>' : "") +
        (msg.anfitrionId === j.id ? ' <span class="papel">anfitrión</span>' : "");
      lista.appendChild(li);
    }
    const total = (msg.estado && msg.estado.asientosTotales) || msg.asientos || 9;
    const libres = total - jugadores.length;
    $("asientos-libres").textContent = libres === 0
      ? "Mesa completa."
      : "Asientos libres: " + libres + " de " + total + ".";
    const fi = msg.fichasIniciales || (msg.estado && msg.estado.fichasIniciales);
    const sb = msg.ciegaPequena != null ? msg.ciegaPequena : (msg.estado && msg.estado.ciegaPequena);
    const bb = msg.ciegaGrande != null ? msg.ciegaGrande : (msg.estado && msg.estado.ciegaGrande);
    const infoF = $("info-fichas-sala");
    if (infoF) {
      infoF.textContent = fi
        ? ("Fichas iniciales: " + formatearFichas(fi) + (sb != null && bb != null ? " · Ciegas " + sb + " / " + bb : ""))
        : "";
    }

    const anfitrion = !!msg.esAnfitrion || ui.esAnfitrion;
    $("btn-llenar-bots").hidden = !anfitrion || libres === 0;
    $("btn-iniciar-online").hidden = !anfitrion;
    $("aviso-sala").textContent = anfitrion
      ? "Eres el anfitrión. Puedes llenar con bots e iniciar la partida cuando haya al menos 2 jugadores."
      : "Esperando a que el anfitrión inicie la partida…";
  }

  async function crearPrivada() {
    $("aviso-online").textContent = "";
    try {
      await conectarWS();
      enviarWS({
        tipo: "crear-privada",
        nombre: nombreJugador(),
        asientos: asientosElegidos("asientos-online"),
        fichasIniciales: fichasElegidas("online")
      });
    } catch (e) {
      $("aviso-online").textContent = e.message;
    }
  }

  async function unirseCodigo() {
    $("aviso-online").textContent = "";
    const codigo = ($("input-codigo").value || "").trim().toUpperCase();
    if (codigo.length !== 5) {
      $("aviso-online").textContent = "El código tiene que tener 5 letras.";
      return;
    }
    try {
      await conectarWS();
      enviarWS({ tipo: "unirse", nombre: nombreJugador(), codigo: codigo });
    } catch (e) {
      $("aviso-online").textContent = e.message;
    }
  }

  async function unirsePublica() {
    $("aviso-online").textContent = "";
    try {
      await conectarWS();
      enviarWS({
        tipo: "unirse-publica",
        nombre: nombreJugador(),
        asientos: asientosElegidos("asientos-online"),
        fichasIniciales: fichasElegidas("online")
      });
    } catch (e) {
      $("aviso-online").textContent = e.message;
    }
  }

  /* ---------- Enlazar botones ---------- */

  function iniciarUI() {
    iniciarSelectoresFichas();
    $("btn-solo").addEventListener("click", irSolo);
    $("btn-online").addEventListener("click", irOnline);
    $("btn-volver-solo").addEventListener("click", irMenu);
    $("btn-volver-online").addEventListener("click", irMenu);
    $("btn-empezar-solo").addEventListener("click", empezarSolo);

    $("btn-crear-privada").addEventListener("click", crearPrivada);
    $("btn-unirse-codigo").addEventListener("click", unirseCodigo);
    $("btn-sala-publica").addEventListener("click", unirsePublica);
    $("btn-llenar-bots").addEventListener("click", function () { enviarWS({ tipo: "llenar-bots" }); });
    $("btn-iniciar-online").addEventListener("click", function () { enviarWS({ tipo: "iniciar" }); });
    $("btn-salir-sala").addEventListener("click", function () {
      enviarWS({ tipo: "salir" });
      cerrarWS();
      irMenu();
    });
    $("btn-salir-mesa").addEventListener("click", irMenu);

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

    $("input-codigo").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") unirseCodigo();
    });

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
    mesa.sentar({ id: "humano", nombre: nombre, tipo: "humano", asiento: 0, fichas: ciegas.fichasIniciales });
    const usados = [nombre];
    const largos = ["Maximiliano", "Juan Esteban", "Valentina M.", "Ana-Sofía", "Roberto Carlos", "Isabel María", "Diego Armando", "Chris"];
    for (let i = 1; i < n; i++) {
      const nom = opt.nombresLargos ? (largos[i - 1] || Bots.nombreBot(usados)) : Bots.nombreBot(usados);
      usados.push(nom);
      mesa.sentar({ id: "bot-" + i, nombre: nom, tipo: "bot", asiento: i, fichas: ciegas.fichasIniciales });
    }
    ui.mesa = mesa;
    ui.tuId = "humano";
    ui.modo = "solo";
    ui.animando = false;
    mesa.iniciarMano();
    mesa.empezarApuestas();
    const objetivo = opt.fase || "flop";
    let guard = 0;
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
    $("info-sala").textContent = "Modo solo · " + n + " asientos";
    $("info-ciegas").textContent = "Ciegas " + mesa.ciegaPequena + " / " + mesa.ciegaGrande;
    $("mensaje-mesa").className = (objetivo === "showdown") ? "premio" : "";
    $("mensaje-mesa").textContent = mesa.mensaje || (objetivo === "flop" ? "Flop" : "");
    mostrar("pantalla-mesa");
    renderMesa(mesa.estadoPublico(ui.tuId));
    if (objetivo === "showdown") celebrar(mesa.estadoPublico(ui.tuId));
    return mesa;
  }

  window.__RF = {
    montarDemo: montarDemo,
    renderMesa: renderMesa,
    separarSolapes: separarSolapes,
    formatearFichas: formatearFichas,
    ui: ui
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarUI);
  } else {
    iniciarUI();
  }
})();
