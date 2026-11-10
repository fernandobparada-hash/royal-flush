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
    document.documentElement.classList.toggle("en-mesa", idPantalla === "pantalla-mesa");
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

  function actualizarOrientacionMesa() {
    const mesa = $("mesa-oval");
    if (!mesa) return;
    mesa.classList.toggle("vertical", esVerticalEstrecho());
  }

  function anguloAsiento(indice, total, gap) {
    const available = Math.PI * 2 - gap;
    const u = (indice / total) * available;
    const mid = Math.PI - gap / 2;
    return u <= mid ? u : u + gap;
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

  function estiloPx(x, y) {
    return "left:" + Math.round(x) + "px;top:" + Math.round(y) + "px;";
  }

  function rectsSeSolapan(a, b, holgura) {
    holgura = holgura == null ? 2 : holgura;
    return !(a.right + holgura <= b.left || b.right + holgura <= a.left || a.bottom + holgura <= b.top || b.bottom + holgura <= a.top);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function caja(x, y, w, h) {
    return { x: x, y: y, w: w, h: h, left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 };
  }

  function sePisan(a, b, g) {
    g = g == null ? 3 : g;
    return !(a.right + g <= b.left || b.right + g <= a.left || a.bottom + g <= b.top || b.bottom + g <= a.top);
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
    const nFactor = (total >= 10 ? 0.88 : 1) * (compacto ? 0.82 : 1) * (H < 340 || W < 640 ? 0.86 : 1);
    const cardW = clamp(Math.round(s * 56 * nFactor), 12, 52);
    const cardH = Math.round(cardW * 1.38);
    const ownW = clamp(Math.round(cardW * 1.18), 14, 62);
    const ownH = Math.round(ownW * 1.38);
    const commW = clamp(Math.round(s * 62 * (compacto ? 0.9 : 1)), 14, 68);
    const commH = Math.round(commW * 1.4);
    const infoW = clamp(Math.round(s * (total >= 10 ? 112 : 126) * nFactor), 46, 138);
    const infoH = clamp(Math.round(s * (compacto ? 44 : 52)), 22, 54);
    const betW = clamp(Math.round(s * 52), 28, 72);
    const betH = clamp(Math.round(s * 20), 12, 24);
    const dealerW = clamp(Math.round(s * 108 * (compacto ? 0.85 : 1)), 32, 112);
    const dealerH = Math.round(dealerW * 1.0);
    const vaso = clamp(Math.round(s * 22), 6, 22);
    return {
      W: W, H: H, s: s, vertical: vertical,
      cardW: cardW, cardH: cardH, ownW: ownW, ownH: ownH,
      commW: commW, commH: commH, infoW: infoW, infoH: infoH,
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
    mesa.style.setProperty("--ancho-info", m.infoW + "px");
    mesa.style.setProperty("--ancho-propio", m.infoW + "px");
  }

  function calcularLayout(estado, mesa) {
    const total = estado.asientosTotales;
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

    const gap = vertical ? 1.05 : (total >= 10 ? 0.92 : 0.82);

    const seats = [];
    for (let i = 0; i < total; i++) {
      const ang = anguloAsiento(i, total, gap);
      const ux = Math.sin(ang);
      const uy = Math.cos(ang);
      const zona = zonaDeAngulo(ang, i);
      let ix = cx + ux * infoRx;
      let iy = cy + uy * infoRy;
      ix = clamp(ix, m.infoW / 2 + pad, W - m.infoW / 2 - pad);
      iy = clamp(iy, m.infoH / 2 + pad, H - m.infoH / 2 - pad);
      const info = caja(ix, iy, m.infoW, m.infoH);
      const rSeat = Math.hypot(ix - cx, iy - cy);

      const cW = (i === 0 ? m.ownW * 1.7 : m.cardW * 1.7);
      const cH = (i === 0 ? m.ownH : m.cardH);
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
      const huecoAbajo = (H - iy - m.infoH / 2);
      const anchoLibre = W - m.infoW - pad * 2;
      if (i === 0 && (vertical || anchoLibre < cW + m.infoW + 16 || huecoAbajo < 8)) {
        const cyC = clamp(iy - (m.infoH / 2 + 5 + cH / 2), cH / 2 + pad, H - cH / 2 - pad);
        const cxC = clamp(ix, cW / 2 + pad, W - cW / 2 - pad);
        cards = caja(cxC, cyC, cW, cH);
        angCards = ang;
        if (sePisan(cards, info, 2) || sePisan(cards, centro, 2)) {
          cards = caja(clamp(ix - (m.infoW / 2 + 6 + cW / 2), cW / 2 + pad, W - cW / 2 - pad), iy, cW, cH);
        }
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
        i: i, ang: ang, ux: ux, uy: uy, zona: zona, rSeat: rSeat, angCards: angCards,
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

  function separarTodo(L) {
    const pad = L.pad;
    function apply(obj, sx, sy) {
      if (!obj || !obj.b || obj.fixed) return 0;
      const w = obj.b.w, h = obj.b.h;
      const nx = clamp(obj.b.x + sx, w / 2 + pad, L.W - w / 2 - pad);
      const ny = clamp(obj.b.y + sy, h / 2 + pad, L.H - h / 2 - pad);
      const moved = Math.abs(nx - obj.b.x) + Math.abs(ny - obj.b.y);
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
        arr.push({ k: "info", s: s, b: s.info, fixed: false });
        arr.push({ k: "cards", s: s, b: s.cards, fixed: false });
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
            const ma = apply(A, px, py);
            const mb = apply(B, -px, -py);
            if (ma + mb < 0.5) {
              apply(A, px * 2, py * 2);
              apply(B, -px * 2, -py * 2);
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
      if (info) S.info = cajaDesdeEl(info, mr);
      if (cartasInner && cartasInner.querySelector(".carta, .carta-dorso")) S.cards = cajaDesdeEl(cartasInner, mr);
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
        if (info) S.info = cajaDesdeEl(info, mr);
        if (cartasInner && cartasInner.querySelector(".carta, .carta-dorso")) S.cards = cajaDesdeEl(cartasInner, mr);
        if (apInner) { S.bet = cajaDesdeEl(apInner, mr); S.mBetW = S.bet.w; S.mBetH = S.bet.h; }
      }
      separarTodo(L);
      escribirL();
    })();
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
        if (hit(items[i], items[j])) pares.push(items[i].id + " ∩ " + items[j].id);
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

    actualizarOrientacionMesa();
    const total = estado.asientosTotales;
    const oval = $("mesa-oval");
    if (oval) oval.classList.toggle("asientos-10", total === 10);
    document.documentElement.classList.add("en-mesa");
    const ganadores = (estado.resultadoShowdown && estado.resultadoShowdown.ganadores)
      ? estado.resultadoShowdown.ganadores.map(function (g) { return g.id; })
      : [];

    if (estado.ciegaPequena && estado.ciegaGrande && $("info-ciegas")) {
      $("info-ciegas").textContent = "Ciegas " + estado.ciegaPequena + " / " + estado.ciegaGrande;
    }

    pintarPortaVasos(total);

    const cajaAs = $("asientos");
    let html = "";
    for (let i = 0; i < total; i++) {
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

      html += '<div class="pieza pieza-cartas ' + clasesExtra + '" data-asiento="' + i + '">';
      html += htmlCartas + "</div>";
      html += '<div class="pieza pieza-info ' + clasesExtra + '" data-asiento="' + i + '">';
      html += htmlInfo + "</div>";

      if (j && j.apuestaRonda > 0) {
        html += '<div class="pieza pieza-apuesta" data-asiento="' + i + '">';
        html += '<div class="apuesta-frente">' + htmlPilaFichas(j.apuestaRonda, true) + "</div></div>";
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

  window.__RF = {
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
