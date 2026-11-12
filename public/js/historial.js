/* =========================================================
   HISTORIAL DE MANOS
   ---------------------------------------------------------
   Guarda un resumen de cada mano que termina (quién ganó,
   cuánto, con qué mano, qué cartas había en la mesa y qué
   cartas se enseñaron). No dibuja nada: solo guarda y da
   los datos; interfaz.js los pinta en el panel "Historial".
   Funciona en el navegador y en Node.js (pruebas).
   ========================================================= */

(function (raiz) {
  "use strict";

  /** "A♠", "10♥"... Las cartas ocultas se muestran como "??". */
  function textoCarta(c) {
    if (!c || c.oculta) return "??";
    return String(c.texto) + String(c.palo || "");
  }

  function nombreDe(estado, id) {
    const lista = (estado && estado.jugadores) || [];
    for (let i = 0; i < lista.length; i++) {
      if (lista[i].id === id) return lista[i].nombre;
    }
    return "Jugador";
  }

  /**
   * Convierte el estado de una mesa que acaba de terminar una mano
   * en una entrada de historial. Devuelve null si no hay resultado.
   */
  function resumirMano(estado, tuId) {
    const r = estado && estado.resultadoShowdown;
    if (!r) return null;

    const ganadores = (r.ganadores || []).map(function (g) {
      return {
        id: g.id,
        nombre: g.nombre || nombreDe(estado, g.id),
        premio: g.premio || 0,
        descripcion: g.descripcion || ""
      };
    });
    const bote = ganadores.reduce(function (s, g) { return s + g.premio; }, 0);

    return {
      mano: estado.manosJugadas || 0,
      ciegas: (estado.ciegaPequena || 0) + " / " + (estado.ciegaGrande || 0),
      comunitarias: (estado.comunitarias || []).map(textoCarta),
      bote: bote,
      sinShowdown: !!r.sinShowdown,
      ganadores: ganadores,
      reveladas: (r.revelados || []).map(function (x) {
        return {
          id: x.id,
          nombre: x.nombre,
          cartas: (x.cartas || []).map(textoCarta),
          descripcion: x.descripcion || ""
        };
      }),
      gane: !!tuId && ganadores.some(function (g) { return g.id === tuId; })
    };
  }

  /** Una línea de texto para una entrada: "Mano 3 · Bote 120 · Ana gana 120 con Pareja". */
  function lineaResumen(e) {
    const quien = e.ganadores.map(function (g) {
      return g.nombre + " " + (e.ganadores.length > 1 ? "(" + g.premio + ")" : "gana " + g.premio);
    }).join(", ");
    const con = (e.ganadores.length === 1 && e.ganadores[0].descripcion && !e.sinShowdown)
      ? " con " + e.ganadores[0].descripcion
      : (e.sinShowdown ? " (todos se retiraron)" : "");
    return "Mano " + e.mano + " · Bote " + e.bote + " · " + quien + con;
  }

  function crearHistorial(maximo) {
    const limite = Math.max(1, maximo || 50);
    let entradas = [];
    return {
      /** Guarda la mano si hay resultado y no estaba ya guardada. Devuelve la entrada o null. */
      registrar: function (estado, tuId) {
        const e = resumirMano(estado, tuId);
        if (!e) return null;
        if (entradas.some(function (x) { return x.mano === e.mano; })) return null;
        entradas.push(e);
        if (entradas.length > limite) entradas = entradas.slice(entradas.length - limite);
        return e;
      },
      /** Más recientes primero. */
      lista: function () { return entradas.slice().reverse(); },
      limpiar: function () { entradas = []; },
      cantidad: function () { return entradas.length; }
    };
  }

  const api = {
    crearHistorial: crearHistorial,
    resumirMano: resumirMano,
    lineaResumen: lineaResumen,
    textoCarta: textoCarta
  };

  raiz.PokerHistorial = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
