/* =========================================================
   MOTOR DEL JUEGO — Texas Hold'em No Limit
   ---------------------------------------------------------
   Aquí vive la "verdad" de la partida: quién tiene qué
   cartas, de quién es el turno, cuánto hay en el bote y
   quién gana. El servidor usa este mismo motor para el
   modo en línea (así nadie puede hacer trampas desde el
   navegador). El modo solo también lo usa, pero en tu
   propia computadora.

   Fases de una mano:
     ciegas → 2 cartas a cada uno → apuestas (preflop)
     → flop (3 cartas) → apuestas
     → turn (1 carta) → apuestas
     → river (1 carta) → apuestas
     → showdown (se muestran las cartas y se reparte el bote)
   ========================================================= */

(function (raiz) {
  "use strict";

  const Ev = (typeof module !== "undefined" && typeof document === "undefined")
    ? require("./evaluador.js")
    : raiz.PokerEvaluador;

  const FICHAS_INICIALES = 1000;
  const CIEGA_PEQUENA = 5;
  const CIEGA_GRANDE = 10;

  function crearJugador(datos) {
    return {
      id: datos.id,
      nombre: datos.nombre,
      tipo: datos.tipo || "humano",
      asiento: datos.asiento,
      fichas: datos.fichas != null ? datos.fichas : FICHAS_INICIALES,
      cartas: [],
      retirado: false,
      allIn: false,
      apuestaRonda: 0,
      aportado: 0,
      enMano: false,
      reveladas: false,
      sentado: true,
      conectado: true,
      ultimaAccion: null
    };
  }

  /**
   * Recorre los asientos en el sentido de las agujas del reloj
   * (en la mesa, hacia la izquierda del crupier) y devuelve el
   * primero que cumple la condición.
   */
  function Mesa(opciones) {
    opciones = opciones || {};
    this.asientosTotales = opciones.asientos || 9;
    this.fichasIniciales = opciones.fichasIniciales || FICHAS_INICIALES;
    this.ciegaPequena = opciones.ciegaPequena || CIEGA_PEQUENA;
    this.ciegaGrande = opciones.ciegaGrande || CIEGA_GRANDE;
    this.porAsiento = new Array(this.asientosTotales).fill(null);
    this.fase = "esperando";
    this.mazo = [];
    this.comunitarias = [];
    this.botonDealer = null;
    this.asientoSB = null;
    this.asientoBB = null;
    this.apuestaMaxima = 0;
    this.subidaMinima = this.ciegaGrande;
    this.turnoId = null;
    this.faltanPorHablar = [];
    this.boteTotal = 0;
    this.botes = [];
    this.resultadoShowdown = null;
    this.manosJugadas = 0;
    this.oyentes = [];
    this.mensaje = "Esperando jugadores…";
  }

  Mesa.prototype.on = function (fn) {
    this.oyentes.push(fn);
  };

  Mesa.prototype.emitir = function (evento) {
    evento = evento || {};
    if (!evento.estado) evento.estado = this.estadoPublico();
    for (let i = 0; i < this.oyentes.length; i++) {
      try { this.oyentes[i](evento); } catch (e) { /* un oyente no debe romper el juego */ }
    }
  };

  Mesa.prototype.jugadores = function () {
    const lista = [];
    for (let i = 0; i < this.porAsiento.length; i++) {
      if (this.porAsiento[i]) lista.push(this.porAsiento[i]);
    }
    return lista;
  };

  Mesa.prototype.jugadorPorId = function (id) {
    const lista = this.jugadores();
    for (let i = 0; i < lista.length; i++) {
      if (lista[i].id === id) return lista[i];
    }
    return null;
  };

  Mesa.prototype.asientoLibre = function () {
    for (let i = 0; i < this.porAsiento.length; i++) {
      if (!this.porAsiento[i]) return i;
    }
    return -1;
  };

  Mesa.prototype.sentar = function (datos) {
    let asiento = datos.asiento;
    if (asiento == null || asiento < 0 || asiento >= this.asientosTotales || this.porAsiento[asiento]) {
      asiento = this.asientoLibre();
    }
    if (asiento < 0) return { error: "La mesa está llena." };
    const jugador = crearJugador({
      id: datos.id,
      nombre: datos.nombre || "Jugador",
      tipo: datos.tipo || "humano",
      asiento: asiento,
      fichas: datos.fichas != null ? datos.fichas : this.fichasIniciales
    });
    this.porAsiento[asiento] = jugador;
    this.emitir({ tipo: "jugador-sentado", jugadorId: jugador.id });
    return { jugador: jugador };
  };

  Mesa.prototype.levantar = function (id) {
    const j = this.jugadorPorId(id);
    if (!j) return;
    if (j.enMano && this.fase !== "esperando" && this.fase !== "entre-manos" && this.fase !== "showdown") {
      if (!j.retirado) {
        j.retirado = true;
        j.ultimaAccion = "retirarse";
        this.quitarDeFaltan(j.id);
        if (this.turnoId === j.id) this.continuarTrasAccion(j);
      }
    }
    this.porAsiento[j.asiento] = null;
    this.emitir({ tipo: "jugador-levantado", jugadorId: id });
  };

  Mesa.prototype.siguienteAsiento = function (desde, pred, inclusive) {
    const n = this.asientosTotales;
    for (let i = 0; i < n; i++) {
      const a = (desde + (inclusive && i === 0 ? 0 : 1) + (inclusive ? i : i)) % n;
      // Cuando inclusive es true: i=0 → desde; i=1 → desde+1...
      // Cuando inclusive es false: i=0 → desde+1; i=1 → desde+2...
      const asiento = inclusive
        ? (desde + i) % n
        : (desde + 1 + i) % n;
      const j = this.porAsiento[asiento];
      if (j && pred(j)) return asiento;
    }
    return null;
  };

  Mesa.prototype.siguienteEnMano = function (desde, inclusive) {
    return this.siguienteAsiento(desde, function (j) {
      return j.enMano && !j.retirado;
    }, inclusive);
  };

  Mesa.prototype.ponerFichas = function (jugador, cantidad) {
    const pago = Math.min(cantidad, jugador.fichas);
    jugador.fichas -= pago;
    jugador.apuestaRonda += pago;
    jugador.aportado += pago;
    if (jugador.fichas === 0) jugador.allIn = true;
    this.actualizarBote();
    return pago;
  };

  Mesa.prototype.actualizarBote = function () {
    let total = 0;
    const lista = this.jugadores();
    for (let i = 0; i < lista.length; i++) total += lista[i].aportado;
    this.boteTotal = total;
  };

  /** Empieza una mano nueva si hay al menos 2 jugadores con fichas. */
  Mesa.prototype.iniciarMano = function () {
    if (this.fase !== "esperando" && this.fase !== "entre-manos") {
      return { error: "Todavía hay una mano en curso." };
    }

    const conFichas = this.jugadores().filter(function (j) {
      return j.sentado && j.fichas > 0;
    });
    if (conFichas.length < 2) {
      this.fase = "esperando";
      this.mensaje = "Se necesitan al menos 2 jugadores con fichas.";
      this.emitir({ tipo: "esperando" });
      return { error: this.mensaje };
    }

    const lista = this.jugadores();
    for (let i = 0; i < lista.length; i++) {
      const j = lista[i];
      j.cartas = [];
      j.retirado = false;
      j.allIn = false;
      j.apuestaRonda = 0;
      j.aportado = 0;
      j.enMano = j.sentado && j.fichas > 0;
      j.reveladas = false;
      j.ultimaAccion = null;
    }

    this.comunitarias = [];
    this.botes = [];
    this.resultadoShowdown = null;
    this.mazo = Ev.barajar(Ev.crearMazo());
    this.mensaje = "";

    if (this.botonDealer == null || !this.porAsiento[this.botonDealer] || !this.porAsiento[this.botonDealer].enMano) {
      this.botonDealer = conFichas[0].asiento;
    }

    const n = conFichas.length;
    if (n === 2) {
      this.asientoSB = this.botonDealer;
      this.asientoBB = this.siguienteEnMano(this.botonDealer);
    } else {
      this.asientoSB = this.siguienteEnMano(this.botonDealer);
      this.asientoBB = this.siguienteEnMano(this.asientoSB);
    }

    this.ponerFichas(this.porAsiento[this.asientoSB], this.ciegaPequena);
    this.porAsiento[this.asientoSB].ultimaAccion = "ciega-pequena";
    this.ponerFichas(this.porAsiento[this.asientoBB], this.ciegaGrande);
    this.porAsiento[this.asientoBB].ultimaAccion = "ciega-grande";

    this.apuestaMaxima = this.porAsiento[this.asientoBB].apuestaRonda;
    this.subidaMinima = this.ciegaGrande;

    // Se reparte empezando por la ciega pequeña, una carta cada vez, dos vueltas
    const orden = [];
    let a = this.asientoSB;
    for (let i = 0; i < n; i++) {
      orden.push(a);
      a = this.siguienteEnMano(a);
    }
    const secuenciaReparto = [];
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      for (let i = 0; i < orden.length; i++) {
        const jug = this.porAsiento[orden[i]];
        const carta = this.mazo.pop();
        jug.cartas.push(carta);
        secuenciaReparto.push({ asiento: orden[i], jugadorId: jug.id, indice: vuelta });
      }
    }

    this.fase = "preflop";
    this.manosJugadas += 1;
    this.turnoId = null;
    this._primerAsientoPreflop = n === 2 ? this.asientoSB : this.siguienteEnMano(this.asientoBB);

    this.emitir({
      tipo: "mano-iniciada",
      secuenciaReparto: secuenciaReparto,
      asientoSB: this.asientoSB,
      asientoBB: this.asientoBB,
      botonDealer: this.botonDealer
    });
    return { ok: true };
  };

  /**
   * Arranca la primera ronda de apuestas (preflop).
   * Se llama DESPUÉS de la animación del reparto, para que las
   * cartas "vuelen" antes de que alguien tenga que hablar.
   */
  Mesa.prototype.empezarApuestas = function () {
    if (this.fase !== "preflop" || this.turnoId) return { error: "La ronda ya ha empezado." };
    if (this._primerAsientoPreflop == null) return { error: "No hay mano en curso." };
    this.iniciarRondaApuestas(this._primerAsientoPreflop, true);
    return { ok: true };
  };

  Mesa.prototype.iniciarRondaApuestas = function (primerAsiento, esPreflop) {
    if (!esPreflop) {
      const lista = this.jugadores();
      for (let i = 0; i < lista.length; i++) lista[i].apuestaRonda = 0;
      this.apuestaMaxima = 0;
      this.subidaMinima = this.ciegaGrande;
    }

    this.faltanPorHablar = this.jugadores()
      .filter(function (j) { return j.enMano && !j.retirado && !j.allIn; })
      .map(function (j) { return j.id; });

    const vivos = this.jugadores().filter(function (j) {
      return j.enMano && !j.retirado;
    });

    if (vivos.length <= 1) {
      this.turnoId = null;
      this.cerrarRonda();
      return;
    }

    const puedenActuar = this.faltanPorHablar.length;
    // Si queda una sola persona con fichas y el resto está all-in, no hay más apuestas
    if (puedenActuar <= 1) {
      const unicoId = puedenActuar === 1 ? this.faltanPorHablar[0] : null;
      const unico = unicoId ? this.jugadorPorId(unicoId) : null;
      if (!unico || unico.apuestaRonda >= this.apuestaMaxima) {
        this.turnoId = null;
        this.cerrarRonda();
        return;
      }
    }

    this.turnoId = this.siguienteQueFalta(primerAsiento, true);
    if (!this.turnoId) {
      this.cerrarRonda();
      return;
    }
    this.emitir({ tipo: "turno", jugadorId: this.turnoId });
  };

  Mesa.prototype.siguienteQueFalta = function (desdeAsiento, inclusive) {
    const self = this;
    const asiento = this.siguienteAsiento(desdeAsiento, function (j) {
      return self.faltanPorHablar.indexOf(j.id) !== -1;
    }, inclusive);
    if (asiento == null) return null;
    return this.porAsiento[asiento].id;
  };

  Mesa.prototype.quitarDeFaltan = function (id) {
    this.faltanPorHablar = this.faltanPorHablar.filter(function (x) { return x !== id; });
  };

  Mesa.prototype.accionesLegales = function (jugadorId) {
    const vacio = {
      tipos: [],
      puedeRetirarse: false,
      puedePasar: false,
      puedeIgualar: false,
      puedeApostar: false,
      puedeSubir: false,
      puedeAllIn: false,
      porIgualar: 0,
      minSubida: 0,
      maxSubida: 0
    };
    const j = this.jugadorPorId(jugadorId || this.turnoId);
    if (!j || j.id !== this.turnoId) return vacio;
    if (this.fase === "esperando" || this.fase === "entre-manos" || this.fase === "showdown") return vacio;

    const porIgualar = Math.max(0, this.apuestaMaxima - j.apuestaRonda);
    const tipos = [];
    const res = {
      puedeRetirarse: true,
      puedePasar: false,
      puedeIgualar: false,
      puedeApostar: false,
      puedeSubir: false,
      puedeAllIn: j.fichas > 0,
      porIgualar: porIgualar,
      minSubida: 0,
      maxSubida: j.apuestaRonda + j.fichas
    };
    tipos.push("retirarse");

    if (porIgualar === 0) {
      res.puedePasar = true;
      tipos.push("pasar");
    } else if (j.fichas > 0) {
      res.puedeIgualar = true;
      tipos.push("igualar");
    }

    const fichasTrasIgualar = j.fichas - Math.min(porIgualar, j.fichas);
    const hayRivalConFichas = this.jugadores().some(function (o) {
      return o.id !== j.id && o.enMano && !o.retirado && o.fichas > 0;
    });

    if (fichasTrasIgualar > 0 && hayRivalConFichas) {
      const minObjetivo = (this.apuestaMaxima === 0)
        ? this.ciegaGrande
        : this.apuestaMaxima + this.subidaMinima;
      res.minSubida = minObjetivo;
      if (this.apuestaMaxima === 0) {
        res.puedeApostar = true;
        tipos.push("apostar");
      } else {
        res.puedeSubir = true;
        tipos.push("subir");
      }
    }

    if (res.puedeAllIn && tipos.indexOf("all-in") === -1) tipos.push("all-in");
    res.tipos = tipos;
    return res;
  };

  /**
   * El jugador hace una acción.
   * "cantidad" en apostar/subir es el TOTAL que quiere dejar puesto en ESTA ronda
   * (por ejemplo: si la ciega grande es 10 y sube a 40, cantidad = 40).
   */
  Mesa.prototype.accion = function (jugadorId, tipo, cantidad) {
    const j = this.jugadorPorId(jugadorId);
    if (!j) return { error: "Jugador no encontrado." };
    if (this.turnoId !== j.id) return { error: "No es tu turno." };

    const legales = this.accionesLegales(j.id);
    tipo = tipo || "";

    if (tipo === "retirarse") {
      j.retirado = true;
      j.ultimaAccion = "retirarse";
      this.quitarDeFaltan(j.id);
    } else if (tipo === "pasar") {
      if (!legales.puedePasar) return { error: "Ahora no puedes pasar." };
      j.ultimaAccion = "pasar";
      this.quitarDeFaltan(j.id);
    } else if (tipo === "igualar") {
      if (!legales.puedeIgualar) return { error: "Ahora no puedes igualar." };
      this.ponerFichas(j, legales.porIgualar);
      j.ultimaAccion = j.allIn ? "all-in" : "igualar";
      this.quitarDeFaltan(j.id);
    } else if (tipo === "apostar" || tipo === "subir" || tipo === "all-in") {
      let objetivo;
      if (tipo === "all-in") {
        objetivo = j.apuestaRonda + j.fichas;
      } else {
        objetivo = Number(cantidad);
        if (!isFinite(objetivo)) return { error: "Cantidad no válida." };
      }

      if (objetivo < j.apuestaRonda) return { error: "La apuesta es demasiado baja." };
      const porPoner = objetivo - j.apuestaRonda;
      if (porPoner <= 0 && tipo !== "all-in") return { error: "Tienes que poner más fichas para subir." };
      if (porPoner > j.fichas) objetivo = j.apuestaRonda + j.fichas;

      const minObjetivo = (this.apuestaMaxima === 0)
        ? this.ciegaGrande
        : this.apuestaMaxima + this.subidaMinima;

      const nuevaApuesta = j.apuestaRonda + Math.min(objetivo - j.apuestaRonda, j.fichas);
      const quedaAllIn = (j.fichas <= (objetivo - j.apuestaRonda));

      // Una subida incompleta (all-in por menos del mínimo) no reabre la ronda
      const esSubida = nuevaApuesta > this.apuestaMaxima;
      const subidaCompleta = esSubida && (nuevaApuesta >= minObjetivo || quedaAllIn && nuevaApuesta >= minObjetivo);
      const completa = esSubida && nuevaApuesta >= minObjetivo;

      if (esSubida && !completa && !quedaAllIn) {
        return { error: "La subida mínima es " + minObjetivo + " fichas." };
      }

      this.ponerFichas(j, objetivo - j.apuestaRonda);
      j.ultimaAccion = j.allIn ? "all-in" : (this.apuestaMaxima === 0 ? "apostar" : "subir");

      if (esSubida) {
        if (completa) {
          this.subidaMinima = nuevaApuesta - this.apuestaMaxima;
          this.apuestaMaxima = nuevaApuesta;
          const self = this;
          this.faltanPorHablar = this.jugadores()
            .filter(function (o) {
              return o.id !== j.id && o.enMano && !o.retirado && !o.allIn;
            })
            .map(function (o) { return o.id; });
        } else {
          // All-in corto: sube lo que hay que igualar, pero no reabre
          this.apuestaMaxima = nuevaApuesta;
          this.quitarDeFaltan(j.id);
        }
      } else {
        this.quitarDeFaltan(j.id);
      }
    } else {
      return { error: "Acción desconocida: " + tipo };
    }

    this.emitir({
      tipo: "accion",
      jugadorId: j.id,
      accion: j.ultimaAccion,
      cantidad: j.apuestaRonda,
      nombre: j.nombre
    });

    return this.continuarTrasAccion(j);
  };

  Mesa.prototype.continuarTrasAccion = function (jugadorQueActuo) {
    const vivos = this.jugadores().filter(function (j) {
      return j.enMano && !j.retirado;
    });
    if (vivos.length <= 1) {
      this.turnoId = null;
      this.cerrarRonda();
      return { ok: true };
    }
    if (this.faltanPorHablar.length === 0) {
      this.turnoId = null;
      this.cerrarRonda();
      return { ok: true };
    }
    this.turnoId = this.siguienteQueFalta(jugadorQueActuo.asiento, false);
    if (!this.turnoId) {
      this.cerrarRonda();
      return { ok: true };
    }
    this.emitir({ tipo: "turno", jugadorId: this.turnoId });
    return { ok: true };
  };

  Mesa.prototype.repartirCalle = function (cuantas, nombreCalle) {
    this.mazo.pop(); // carta quemada (como en el casino de verdad)
    const nuevas = [];
    for (let i = 0; i < cuantas; i++) {
      const c = this.mazo.pop();
      this.comunitarias.push(c);
      nuevas.push(c);
    }
    this.fase = nombreCalle;
    this.mensaje = nombreCalle === "flop"
      ? "Flop"
      : (nombreCalle === "turn" ? "Turn" : "River");
    this.emitir({ tipo: "calle", calle: nombreCalle, nuevas: nuevas });
  };

  Mesa.prototype.quedanApuestas = function () {
    const vivos = this.jugadores().filter(function (j) {
      return j.enMano && !j.retirado;
    });
    const conFichas = vivos.filter(function (j) { return !j.allIn && j.fichas > 0; });
    return conFichas.length >= 2;
  };

  Mesa.prototype.cerrarRonda = function () {
    this.actualizarBote();
    const vivos = this.jugadores().filter(function (j) {
      return j.enMano && !j.retirado;
    });

    if (vivos.length <= 1) {
      this.ganarSinShowdown(vivos[0] || null);
      return;
    }

    const callesPendientes = [];
    if (this.fase === "preflop") callesPendientes.push({ n: 3, nombre: "flop" });
    if (this.fase === "preflop" || this.fase === "flop") callesPendientes.push({ n: 1, nombre: "turn" });
    if (this.fase === "preflop" || this.fase === "flop" || this.fase === "turn") {
      callesPendientes.push({ n: 1, nombre: "river" });
    }

    if (this.fase === "river") {
      this.showdown();
      return;
    }

    // Si ya no puede haber más apuestas, se sacan todas las calles de golpe
    if (!this.quedanApuestas()) {
      for (let i = 0; i < callesPendientes.length; i++) {
        this.repartirCalle(callesPendientes[i].n, callesPendientes[i].nombre);
      }
      this.showdown();
      return;
    }

    const siguiente = callesPendientes[0];
    this.repartirCalle(siguiente.n, siguiente.nombre);

    if (this.fase === "river" && !this.quedanApuestas()) {
      this.showdown();
      return;
    }

    const primero = this.siguienteEnMano(this.botonDealer);
    this.iniciarRondaApuestas(primero, false);
  };

  Mesa.prototype.ganarSinShowdown = function (ganador) {
    this.actualizarBote();
    const premio = this.boteTotal;
    if (ganador) {
      ganador.fichas += premio;
      this.mensaje = ganador.nombre + " se lleva el bote de " + premio + " (el resto se retiró).";
    }
    this.fase = "entre-manos";
    this.turnoId = null;
    this.resultadoShowdown = {
      sinShowdown: true,
      ganadores: ganador ? [{ id: ganador.id, premio: premio, descripcion: "Todos se retiraron" }] : [],
      revelados: [],
      botes: [{ cantidad: premio, elegibles: ganador ? [ganador.id] : [] }]
    };
    this.moverBoton();
    this.emitir({ tipo: "ganador-sin-showdown", jugadorId: ganador ? ganador.id : null, premio: premio });
  };

  /**
   * Calcula el bote principal y los botes laterales (side pots)
   * cuando alguien se queda all-in por menos fichas que el resto.
   */
  Mesa.prototype.calcularBotes = function () {
    const lista = this.jugadores().filter(function (j) { return j.aportado > 0; });
    const niveles = [];
    for (let i = 0; i < lista.length; i++) {
      if (niveles.indexOf(lista[i].aportado) === -1) niveles.push(lista[i].aportado);
    }
    niveles.sort(function (a, b) { return a - b; });

    const botes = [];
    let previo = 0;
    for (let n = 0; n < niveles.length; n++) {
      const nivel = niveles[n];
      const participantes = lista.filter(function (j) { return j.aportado >= nivel; });
      const cantidad = (nivel - previo) * participantes.length;
      const elegibles = participantes
        .filter(function (j) { return !j.retirado; })
        .map(function (j) { return j.id; });
      if (cantidad > 0) {
        botes.push({ cantidad: cantidad, elegibles: elegibles });
      }
      previo = nivel;
    }

    // Unimos botes que tienen exactamente los mismos elegibles
    const unidos = [];
    for (let i = 0; i < botes.length; i++) {
      const b = botes[i];
      const clave = b.elegibles.slice().sort().join(",");
      const existente = unidos.find(function (u) {
        return u.elegibles.slice().sort().join(",") === clave;
      });
      if (existente) existente.cantidad += b.cantidad;
      else unidos.push({ cantidad: b.cantidad, elegibles: b.elegibles.slice() });
    }
    return unidos;
  };

  Mesa.prototype.showdown = function () {
    this.fase = "showdown";
    this.turnoId = null;
    this.actualizarBote();
    const botes = this.calcularBotes();
    this.botes = botes;

    const revelados = [];
    const lista = this.jugadores();
    for (let i = 0; i < lista.length; i++) {
      const j = lista[i];
      if (j.enMano && !j.retirado && j.cartas.length === 2 && this.comunitarias.length === 5) {
        j.reveladas = true;
        const ev = Ev.mejorMano(j.cartas.concat(this.comunitarias));
        revelados.push({
          id: j.id,
          nombre: j.nombre,
          asiento: j.asiento,
          cartas: j.cartas,
          mano: ev,
          descripcion: Ev.describirMano(ev)
        });
      }
    }

    const pagosPorJugador = {};
    const resumenBotes = [];
    const self = this;

    function ordenDesdeBoton(asiento) {
      return (asiento - self.botonDealer + self.asientosTotales) % self.asientosTotales;
    }

    for (let b = 0; b < botes.length; b++) {
      const bote = botes[b];
      const candidatos = revelados.filter(function (r) {
        return bote.elegibles.indexOf(r.id) !== -1;
      });
      if (candidatos.length === 0) continue;

      let mejores = [candidatos[0]];
      for (let i = 1; i < candidatos.length; i++) {
        const cmp = Ev.compararPuntuaciones(candidatos[i].mano, mejores[0].mano);
        if (cmp > 0) mejores = [candidatos[i]];
        else if (cmp === 0) mejores.push(candidatos[i]);
      }

      // La ficha impar (si el bote no se divide exacto) va al primero
      // a la izquierda del botón, como en las reglas clásicas.
      mejores.sort(function (a, c) {
        return ordenDesdeBoton(a.asiento) - ordenDesdeBoton(c.asiento);
      });

      const base = Math.floor(bote.cantidad / mejores.length);
      let resto = bote.cantidad % mejores.length;
      const ganadoresBote = [];
      for (let i = 0; i < mejores.length; i++) {
        const premio = base + (resto > 0 ? 1 : 0);
        if (resto > 0) resto -= 1;
        const id = mejores[i].id;
        this.jugadorPorId(id).fichas += premio;
        pagosPorJugador[id] = (pagosPorJugador[id] || 0) + premio;
        ganadoresBote.push({
          id: id,
          nombre: mejores[i].nombre,
          premio: premio,
          descripcion: mejores[i].descripcion
        });
      }
      resumenBotes.push({ cantidad: bote.cantidad, ganadores: ganadoresBote });
    }

    const ganadores = [];
    for (const id in pagosPorJugador) {
      const r = revelados.find(function (x) { return x.id === id; });
      ganadores.push({
        id: id,
        nombre: r ? r.nombre : id,
        premio: pagosPorJugador[id],
        descripcion: r ? r.descripcion : ""
      });
    }

    if (ganadores.length === 1) {
      this.mensaje = ganadores[0].nombre + " gana " + ganadores[0].premio + " fichas con " + ganadores[0].descripcion + ".";
    } else if (ganadores.length > 1) {
      this.mensaje = "Bote dividido: " + ganadores.map(function (g) {
        return g.nombre + " (" + g.premio + ")";
      }).join(", ") + ".";
    }

    this.resultadoShowdown = {
      sinShowdown: false,
      revelados: revelados,
      botes: resumenBotes,
      ganadores: ganadores
    };

    this.fase = "entre-manos";
    this.moverBoton();
    this.emitir({ tipo: "showdown", resultado: this.resultadoShowdown });
  };

  Mesa.prototype.moverBoton = function () {
    if (this.botonDealer == null) return;
    const sig = this.siguienteAsiento(this.botonDealer, function (j) {
      return j.sentado && j.fichas > 0;
    }, false);
    if (sig != null) this.botonDealer = sig;
  };

  /**
   * Foto pública de la mesa. Las cartas privadas de los demás
   * NO viajan: solo ves las tuyas (o las que ya se revelaron
   * en el showdown). Así el servidor puede ser "autoritativo".
   */
  Mesa.prototype.estadoPublico = function (paraId) {
    const self = this;
    const jugadores = this.jugadores().map(function (j) {
      const mostrar = j.reveladas || (paraId && j.id === paraId);
      return {
        id: j.id,
        nombre: j.nombre,
        tipo: j.tipo,
        asiento: j.asiento,
        fichas: j.fichas,
        apuestaRonda: j.apuestaRonda,
        aportado: j.aportado,
        retirado: j.retirado,
        allIn: j.allIn,
        enMano: j.enMano,
        ultimaAccion: j.ultimaAccion,
        cartas: mostrar ? j.cartas : (j.cartas.length ? j.cartas.map(function () { return { oculta: true }; }) : []),
        esTurno: self.turnoId === j.id,
        esBoton: self.botonDealer === j.asiento,
        esSB: self.asientoSB === j.asiento,
        esBB: self.asientoBB === j.asiento
      };
    });

    return {
      asientosTotales: this.asientosTotales,
      fase: this.fase,
      comunitarias: this.comunitarias,
      boteTotal: this.boteTotal,
      botonDealer: this.botonDealer,
      asientoSB: this.asientoSB,
      asientoBB: this.asientoBB,
      apuestaMaxima: this.apuestaMaxima,
      subidaMinima: this.subidaMinima,
      ciegaPequena: this.ciegaPequena,
      ciegaGrande: this.ciegaGrande,
      turnoId: this.turnoId,
      manosJugadas: this.manosJugadas,
      mensaje: this.mensaje,
      resultadoShowdown: this.resultadoShowdown,
      acciones: (paraId && paraId === this.turnoId) ? this.accionesLegales(paraId) : this.accionesLegales(),
      jugadores: jugadores
    };
  };

  Mesa.prototype.cartasDe = function (jugadorId) {
    const j = this.jugadorPorId(jugadorId);
    return j ? j.cartas : [];
  };

  const api = {
    Mesa: Mesa,
    crearJugador: crearJugador,
    FICHAS_INICIALES: FICHAS_INICIALES,
    CIEGA_PEQUENA: CIEGA_PEQUENA,
    CIEGA_GRANDE: CIEGA_GRANDE
  };

  raiz.PokerMotor = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
