/* =========================================================
   PERSISTENCIA: convertir una mesa en datos guardables y al revés,
   las cuentas de "la noche" (varias partidas) y los grupos.
   Todo son funciones puras (sin red ni archivos) para poder probarlas.
   ========================================================= */
"use strict";

const crypto = require("crypto");

const VERSION = 1;
const MAX_SESIONES_GRUPO = 300;

function redondear(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/** Nombre "comparable": sin mayúsculas, tildes ni espacios de más. */
function claveNombre(nombre) {
  return String(nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/* ---------------- Firma (copias de seguridad en el teléfono) ---------------- */

function firmar(secreto, datos) {
  return crypto.createHmac("sha256", secreto).update(JSON.stringify(datos)).digest("hex");
}

function verificarFirma(secreto, copia) {
  if (!copia || typeof copia !== "object" || !copia.datos || typeof copia.firma !== "string") return false;
  const esperada = Buffer.from(firmar(secreto, copia.datos), "hex");
  const recibida = Buffer.from(copia.firma, "hex");
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

/* ---------------- Mesa -> datos ---------------- */

/**
 * Foto de la sala para guardar. Si hay una mano a medias, las fichas
 * de los que están en esa mano se guardan como estaban AL EMPEZARLA:
 * si el servidor se reinicia, esa mano se anula y nadie pierde nada.
 */
function serializarSala(sala, manoEnCurso) {
  const mesa = sala.mesa;
  const jugadores = mesa.jugadores().map(function (j) {
    const fichas = (manoEnCurso && j.enMano && j.fichasInicioMano != null) ? j.fichasInicioMano : j.fichas;
    return {
      id: j.tipo === "bot" ? j.id : null,
      tipo: j.tipo,
      nombre: j.nombre,
      avatar: j.avatar || null,
      personalidad: j.personalidad || null,
      asiento: j.asiento,
      fichas: fichas,
      token: j.token || null
    };
  });
  const anfitrion = mesa.jugadores().find(function (j) { return j.id === sala.anfitrionId; });
  const cuentas = (sala.cuentas || []).map(function (c) {
    const sentado = jugadores.find(function (j) { return j.token && j.token === c.token; });
    return {
      token: c.token,
      nombre: c.nombre,
      recargadoBs: c.recargadoBs,
      fichas: sentado ? sentado.fichas : (c.fichas || 0),
      pendienteFichas: c.pendienteFichas || 0,
      seFue: !!c.seFue,
      avatar: c.avatar || null
    };
  });
  return {
    version: VERSION,
    guardadoEn: Date.now(),
    codigo: sala.codigo,
    publica: !!sala.publica,
    anfitrionToken: anfitrion ? anfitrion.token : null,
    mesa: {
      asientos: mesa.asientosTotales,
      fichasIniciales: mesa.fichasIniciales,
      ciegaPequena: mesa.ciegaPequena,
      ciegaGrande: mesa.ciegaGrande,
      ciegasIniciales: sala.ciegasIniciales || { pequena: mesa.ciegaPequena, grande: mesa.ciegaGrande },
      subirCiegasCada: mesa.subirCiegasCada || 0,
      nivelCiegas: mesa.nivelCiegas || 1,
      manosJugadas: mesa.manosJugadas || 0,
      botonDealer: mesa.botonDealer
    },
    jugadores: jugadores,
    cuentas: cuentas,
    partidaIniciada: !!sala.partidaIniciada,
    partidaTerminada: !!sala.partidaTerminada,
    avisoBote: !!sala.avisoBote,
    manoAnulada: !!manoEnCurso,
    partidaNum: sala.partidaNum || 1,
    partidasCerradas: sala.partidasCerradas || [],
    grupo: sala.grupo || null,
    grupoRegistradas: sala.grupoRegistradas || []
  };
}

/* ---------------- Cuentas de la noche ---------------- */

/** Resultado de una partida cerrada, listo para guardar. */
function cerrarPartida(num, jugadoresSnapshot, cuentas) {
  return {
    num: num,
    fin: Date.now(),
    jugadores: jugadoresSnapshot.map(function (j) {
      const c = (cuentas || []).find(function (x) { return x.id === j.id || x.nombre === j.nombre; });
      return {
        token: c ? c.token : null,
        nombre: j.nombre,
        recargadoBs: redondear(j.recargadoBs),
        tieneBs: redondear(j.tieneBs),
        resultadoBs: redondear(j.resultadoBs)
      };
    })
  };
}

/**
 * Suma de todas las partidas de esta mesa (las cerradas y, si hay,
 * la que está en curso). Se agrupa por token (el mismo teléfono).
 */
function totalesNoche(partidasCerradas, actual) {
  const porClave = new Map();
  function sumar(lista, esActual) {
    for (let i = 0; i < lista.length; i++) {
      const j = lista[i];
      const clave = j.token || ("n:" + claveNombre(j.nombre));
      let t = porClave.get(clave);
      if (!t) { t = { nombre: j.nombre, resultadoBs: 0, partidas: 0 }; porClave.set(clave, t); }
      t.nombre = j.nombre;
      t.resultadoBs = redondear(t.resultadoBs + (Number(j.resultadoBs) || 0));
      t.partidas += 1;
      if (esActual) t.enCurso = true;
    }
  }
  for (let i = 0; i < (partidasCerradas || []).length; i++) sumar(partidasCerradas[i].jugadores || [], false);
  if (actual && actual.length) sumar(actual, true);
  return Array.from(porClave.values()).sort(function (a, b) { return b.resultadoBs - a.resultadoBs; });
}

/* ---------------- Grupos (cuentas entre noches) ---------------- */

function nuevoGrupo(codigo, nombre) {
  return { codigo: codigo, nombre: String(nombre || "Grupo").slice(0, 40), creado: Date.now(), actualizado: Date.now(), sesiones: [] };
}

/** Añade partidas cerradas al grupo sin repetir ninguna (cada una tiene id único). */
function agregarAlGrupo(grupo, salaCodigo, partidas) {
  const ya = new Set(grupo.sesiones.map(function (s) { return s.id; }));
  let nuevas = 0;
  for (let i = 0; i < partidas.length; i++) {
    const p = partidas[i];
    const id = salaCodigo + "-" + p.num + "-" + p.fin;
    if (ya.has(id)) continue;
    grupo.sesiones.push({
      id: id,
      fecha: p.fin,
      sala: salaCodigo,
      partida: p.num,
      jugadores: p.jugadores.map(function (j) { return { nombre: j.nombre, recargadoBs: j.recargadoBs, resultadoBs: j.resultadoBs }; })
    });
    ya.add(id);
    nuevas++;
  }
  grupo.sesiones.sort(function (a, b) { return a.fecha - b.fecha; });
  if (grupo.sesiones.length > MAX_SESIONES_GRUPO) grupo.sesiones = grupo.sesiones.slice(-MAX_SESIONES_GRUPO);
  if (nuevas) grupo.actualizado = Date.now();
  return nuevas;
}

/** Une dos copias del mismo grupo (por ejemplo la del servidor y la del teléfono). */
function fusionarGrupos(a, b) {
  if (!a) return b;
  if (!b) return a;
  const r = JSON.parse(JSON.stringify(a));
  const ya = new Set(r.sesiones.map(function (s) { return s.id; }));
  for (let i = 0; i < b.sesiones.length; i++) if (!ya.has(b.sesiones[i].id)) r.sesiones.push(b.sesiones[i]);
  r.sesiones.sort(function (x, y) { return x.fecha - y.fecha; });
  if (r.sesiones.length > MAX_SESIONES_GRUPO) r.sesiones = r.sesiones.slice(-MAX_SESIONES_GRUPO);
  r.actualizado = Math.max(a.actualizado || 0, b.actualizado || 0);
  return r;
}

/** Totales por persona en todas las noches del grupo (se agrupa por nombre). */
function totalesGrupo(grupo) {
  const porNombre = new Map();
  const noches = new Set();
  for (let i = 0; i < grupo.sesiones.length; i++) {
    const s = grupo.sesiones[i];
    noches.add(s.sala);
    for (let k = 0; k < s.jugadores.length; k++) {
      const j = s.jugadores[k];
      const clave = claveNombre(j.nombre);
      let t = porNombre.get(clave);
      if (!t) { t = { nombre: j.nombre, resultadoBs: 0, partidas: 0, mesas: new Set() }; porNombre.set(clave, t); }
      t.resultadoBs = redondear(t.resultadoBs + (Number(j.resultadoBs) || 0));
      t.partidas += 1;
      t.mesas.add(s.sala);
    }
  }
  const lista = Array.from(porNombre.values()).map(function (t) {
    return { nombre: t.nombre, resultadoBs: t.resultadoBs, partidas: t.partidas, noches: t.mesas.size };
  }).sort(function (a, b) { return b.resultadoBs - a.resultadoBs; });
  return { jugadores: lista, partidas: grupo.sesiones.length, noches: noches.size };
}

/** Lo que se manda a los teléfonos: totales + últimas partidas (sin datos internos). */
function vistaGrupo(grupo) {
  const t = totalesGrupo(grupo);
  return {
    codigo: grupo.codigo,
    nombre: grupo.nombre,
    totales: t.jugadores,
    partidas: t.partidas,
    noches: t.noches,
    ultimas: grupo.sesiones.slice(-8).reverse().map(function (s) {
      return { fecha: s.fecha, sala: s.sala, partida: s.partida, jugadores: s.jugadores };
    })
  };
}

module.exports = {
  VERSION: VERSION,
  claveNombre: claveNombre,
  firmar: firmar,
  verificarFirma: verificarFirma,
  serializarSala: serializarSala,
  cerrarPartida: cerrarPartida,
  totalesNoche: totalesNoche,
  nuevoGrupo: nuevoGrupo,
  agregarAlGrupo: agregarAlGrupo,
  fusionarGrupos: fusionarGrupos,
  totalesGrupo: totalesGrupo,
  vistaGrupo: vistaGrupo
};
