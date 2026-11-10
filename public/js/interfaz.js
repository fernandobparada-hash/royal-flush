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
    const mesa = new Motor.Mesa({ asientos: n });
    ui.mesa = mesa;
    ui.tuId = "humano";
    ui.modo = "solo";
    ui.codigo = null;

    mesa.sentar({ id: "humano", nombre: nombreJugador(), tipo: "humano", asiento: 0 });
    const usados = [nombreJugador()];
    for (let i = 1; i < n; i++) {
      const nom = Bots.nombreBot(usados);
      usados.push(nom);
      mesa.sentar({ id: "bot-" + i, nombre: nom, tipo: "bot", asiento: i });
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
      await animarComunitarias(ev.nuevas);
      ui.animando = false;
      renderMesa(ui.mesa.estadoPublico(ui.tuId));
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
      renderMesa(estado);
      const msg = $("mensaje-mesa");
      msg.textContent = estado.mensaje || "";
      msg.className = "premio";
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

  function posicionAsiento(indice, total) {
    const ang = (indice / total) * Math.PI * 2;
    // i=0 queda abajo, en el centro (nuestro asiento)
    const x = 50 + Math.sin(ang) * 40;
    const y = 54 + Math.cos(ang) * 36;
    let zona = "lado";
    if (indice === 0) zona = "abajo";
    else if (y < 40) zona = "arriba";
    return { x: x, y: y, zona: zona };
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

  function renderMesa(estado, opciones) {
    opciones = opciones || {};
    ui.estado = estado;
    if (!estado) return;

    const total = estado.asientosTotales;
    const ganadores = (estado.resultadoShowdown && estado.resultadoShowdown.ganadores)
      ? estado.resultadoShowdown.ganadores.map(function (g) { return g.id; })
      : [];

    const caja = $("asientos");
    let html = "";
    for (let i = 0; i < total; i++) {
      const pos = posicionAsiento(i, total);
      const j = (estado.jugadores || []).find(function (p) { return p.asiento === i; });
      html += '<div class="asiento ' + pos.zona;
      if (j && j.esTurno) html += " es-turno";
      if (j && j.retirado) html += " retirado";
      html += '" data-asiento="' + i + '" style="left:' + pos.x + "%;top:" + pos.y + '%;">';

      html += '<div class="cartas-asiento">';
      if (j && j.cartas && j.cartas.length && !opciones.ocultarPrivadas) {
        for (let c = 0; c < j.cartas.length; c++) {
          const extra = ganadores.indexOf(j.id) !== -1 ? "ganadora" : "";
          html += htmlCarta(j.cartas[c], extra);
        }
      } else if (j && j.enMano && opciones.ocultarPrivadas) {
        html += htmlDorso() + htmlDorso();
      }
      html += "</div>";

      html += '<div class="info-jugador">';
      if (j) {
        html += '<div class="insignias">';
        if (j.esBoton) html += '<span class="insignia" title="Botón del dealer">D</span>';
        if (j.esSB) html += '<span class="insignia sb" title="Ciega pequeña">SB</span>';
        if (j.esBB) html += '<span class="insignia bb" title="Ciega grande">BB</span>';
        html += "</div>";
        html += '<div class="nombre-jugador">' + escapar(j.nombre) + (j.id === ui.tuId ? " (tú)" : "") + "</div>";
        html += '<div class="fichas-jugador">' + j.fichas + " fichas</div>";
        html += '<div class="estado-jugador">' + (j.allIn && j.ultimaAccion !== "all-in" ? "All-in" : textoAccion(j.ultimaAccion)) + "</div>";
        if (j.apuestaRonda > 0) {
          html += '<div class="apuesta-frente">' + j.apuestaRonda + "</div>";
        }
      } else {
        html += '<div class="nombre-jugador">Asiento vacío</div>';
      }
      html += "</div></div>";
    }
    caja.innerHTML = html;

    const com = $("comunitarias");
    let hcom = "";
    const cartasCom = opciones.vaciarComunitarias ? [] : (estado.comunitarias || []);
    for (let i = 0; i < 5; i++) {
      if (cartasCom[i]) hcom += htmlCarta(cartasCom[i]);
      else hcom += '<div class="hueco-carta"></div>';
    }
    com.innerHTML = hcom;

    $("bote").innerHTML = "Bote <strong>" + (estado.boteTotal || 0) + "</strong>";
    const calle = { preflop: "Preflop", flop: "Flop", turn: "Turn", river: "River", "entre-manos": "", showdown: "Showdown", esperando: "" };
    $("etiqueta-calle").textContent = calle[estado.fase] || "";

    if (estado.mensaje && estado.fase === "entre-manos") {
      $("mensaje-mesa").textContent = estado.mensaje;
    }

    actualizarPanelAcciones(estado);
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
      ? (acciones.porIgualar >= (infoFichasPropias(estado) || acciones.porIgualar) ? "All-in " + infoFichasPropias(estado) : "Igualar " + acciones.porIgualar)
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
      $("texto-subida").textContent = rango.value;
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
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
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
      const destinoEl = document.querySelector('.asiento[data-asiento="' + paso.asiento + '"] .cartas-asiento');
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
      animarComunitarias(msg.nuevas).then(function () {
        ui.animando = false;
        if (msg.estado) renderMesa(msg.estado);
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
        asientos: asientosElegidos("asientos-online")
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
        asientos: asientosElegidos("asientos-online")
      });
    } catch (e) {
      $("aviso-online").textContent = e.message;
    }
  }

  /* ---------- Enlazar botones ---------- */

  function iniciarUI() {
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
      $("texto-subida").textContent = $("rango-subida").value;
    });

    $("input-codigo").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") unirseCodigo();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarUI);
  } else {
    iniciarUI();
  }
})();
