/* v12 contra el servidor real: mesas de 9/10/15, lista de mesas en vivo,
   contador de espectadores, showdown visible para quien mira (sin cartas
   privadas), bots con personalidad y monedero de monedas en el servidor.
   Requiere: POKER_RAPIDO=1 npm start
   Uso: node pruebas/probar-v12-online.js [http://localhost:3000] */
"use strict";
const WebSocket = require("ws");
const BASE = process.argv[2] || process.env.POKER_URL || "http://localhost:3000";
const WS_URL = BASE.replace(/^http/, "ws") + "/ws";
let aciertos = 0, fallos = 0;
function ok(desc, cond, extra) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc + (extra ? "  -> " + extra : "")); }
}
function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function conectar() {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(WS_URL);
    ws.mensajes = [];
    ws.on("message", function (d) { try { ws.mensajes.push(JSON.parse(d.toString())); } catch (e) { /* */ } });
    ws.on("open", function () { resolve(ws); });
    ws.on("error", reject);
  });
}
function enviar(ws, o) { ws.send(JSON.stringify(o)); }
async function esperar(ws, filtro, ms) {
  const f = typeof filtro === "string" ? function (m) { return m.tipo === filtro; } : filtro;
  const limite = Date.now() + (ms || 5000);
  while (Date.now() < limite) {
    const m = ws.mensajes.find(f);
    if (m) return m;
    await dormir(40);
  }
  return null;
}
async function api(ruta, opciones) {
  const r = await fetch(BASE + ruta, opciones);
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch (e) { /* */ }
  return { status: r.status, cuerpo: cuerpo };
}
function autoJugar(ws) {
  ws.on("message", function (d) {
    let m; try { m = JSON.parse(d.toString()); } catch (e) { return; }
    if (m.tipo === "turno" && m.estado && m.tuId && m.estado.turnoId === m.tuId && m.estado.acciones) {
      enviar(ws, { tipo: "accion", accion: m.estado.acciones.puedeIgualar ? "igualar" : (m.estado.acciones.puedePasar ? "pasar" : "retirarse") });
    }
  });
}

(async function () {
  console.log("Probando v12 en " + BASE);

  console.log("--- Tamaños de mesa: 9, 10 y 15 ---");
  for (const [pedido, esperado] of [[9, 9], [10, 10], [15, 15], [20, 9], ["15", 15], [12, 9]]) {
    const ws = await conectar();
    enviar(ws, { tipo: "crear-privada", nombre: "Prueba", asientos: pedido, fichasIniciales: 1000 });
    const s = await esperar(ws, "en-sala");
    ok("Pedir " + JSON.stringify(pedido) + " asientos crea una mesa de " + esperado, s && s.asientos === esperado && s.estado.asientosTotales === esperado, s && s.asientos);
    ws.close();
  }

  console.log("\n--- Mesa pública de 15 con bots con personalidad ---");
  const a = await conectar();
  enviar(a, { tipo: "unirse-publica", nombre: "Ana", asientos: 15, fichasIniciales: 1000 });
  const sa = await esperar(a, function (m) { return (m.tipo === "en-sala" || m.tipo === "sala-actualizada") && m.codigo; });
  ok("Ana abre una mesa pública", !!sa && sa.publica === true);
  const codigo = sa.codigo;
  ok("La mesa nueva es de 15 asientos", sa.asientos === 15, sa.asientos);
  const b = await conectar();
  enviar(b, { tipo: "unirse", nombre: "Beto", codigo: codigo });
  const sb = await esperar(b, function (m) { return (m.tipo === "en-sala" || m.tipo === "sala-actualizada") && m.codigo; });
  ok("Beto entra con el código", !!sb);
  autoJugar(a); autoJugar(b);
  a.mensajes.length = 0;
  enviar(a, { tipo: "llenar-bots" });
  const llena = await esperar(a, function (m) { return m.tipo === "sala-actualizada" && m.estado && m.estado.jugadores.length === 15; });
  ok("Se llenan los 15 asientos", !!llena);
  const bots = llena ? llena.estado.jugadores.filter(function (j) { return j.tipo === "bot"; }) : [];
  const pers = bots.map(function (j) { return j.personalidad; });
  ok("Los 13 bots tienen personalidad", bots.length === 13 && pers.every(Boolean), pers.join(","));
  ok("Mezcla variada: las 10 personalidades aparecen en la mesa", new Set(pers).size === 10, String(new Set(pers).size));

  console.log("\n--- Lista de mesas en vivo ---");
  const priv = await conectar();
  enviar(priv, { tipo: "crear-privada", nombre: "Privado", asientos: 9 });
  const sp = await esperar(priv, "en-sala");
  const lista = await api("/api/mesas-publicas");
  const fila = lista.cuerpo && lista.cuerpo.mesas.find(function (m) { return m.codigo === codigo; });
  ok("/api/mesas-publicas responde", lista.status === 200 && lista.cuerpo.ok === true);
  ok("La mesa pública aparece en la lista", !!fila);
  ok("Las mesas privadas NO aparecen", !lista.cuerpo.mesas.some(function (m) { return m.codigo === sp.codigo; }));
  ok("La lista trae jugadores, asientos, espectadores y ciegas", fila && fila.jugadores === 15 && fila.humanos === 2 && fila.asientos === 15 && fila.espectadores === 0 && fila.ciegas === "5/10", JSON.stringify(fila));
  const textoLista = JSON.stringify(lista.cuerpo);
  ok("La lista no trae cartas, tokens ni cuentas", !/cartas|token|cuentas|recargado/i.test(textoLista));
  priv.close();

  console.log("\n--- Contador de espectadores ---");
  const e1 = await conectar();
  a.mensajes.length = 0;
  enviar(e1, { tipo: "mirar", codigo: codigo });
  const mir = await esperar(e1, "mirando");
  ok("El espectador entra a mirar", !!mir && mir.esEspectador === true);
  ok("Ve el contador (1)", mir && mir.espectadores === 1, mir && mir.espectadores);
  const avisoA = await esperar(a, function (m) { return m.tipo === "espectadores"; });
  ok("Los jugadores reciben el contador al entrar alguien (1)", !!avisoA && avisoA.espectadores === 1);
  const e2 = await conectar();
  enviar(e2, { tipo: "mirar", codigo: codigo });
  await esperar(e2, "mirando");
  await dormir(150);
  const lista2 = await api("/api/mesas-publicas");
  const fila2 = lista2.cuerpo.mesas.find(function (m) { return m.codigo === codigo; });
  ok("La lista muestra 2 espectadores", fila2 && fila2.espectadores === 2, fila2 && fila2.espectadores);

  console.log("\n--- Partida mirada: sin cartas privadas, showdown visible ---");
  e1.mensajes.length = 0;
  enviar(a, { tipo: "iniciar" });
  const mano = await esperar(e1, "mano-iniciada", 6000);
  ok("El espectador ve empezar la mano", !!mano);
  ok("El estado de una mano en curso no tiene la propiedad de turno de nadie para él", mano && mano.tuId && !mano.estado.jugadores.some(function (j) { return j.id === mano.tuId; }));
  ok("Durante la mano todas las cartas que ve están tapadas",
    mano && mano.estado.jugadores.every(function (j) { return (j.cartas || []).every(function (c) { return c.oculta; }); }));
  // esperar un showdown con cartas mostradas
  const sd = await esperar(e1, function (m) {
    return m.tipo === "showdown" && m.estado && m.estado.resultadoShowdown && !m.estado.resultadoShowdown.sinShowdown;
  }, 60000);
  ok("El espectador recibe un showdown", !!sd);
  if (sd) {
    const revelados = sd.estado.resultadoShowdown.revelados || [];
    const visibles = sd.estado.jugadores.filter(function (j) { return (j.cartas || []).length && j.cartas.every(function (c) { return !c.oculta && c.texto; }); });
    ok("En el showdown ve las cartas de los que muestran (" + visibles.length + ")", visibles.length >= 2 && revelados.length >= 2);
    const idsRevelados = revelados.map(function (r) { return r.id; });
    ok("Las cartas que ve destapadas son solo de los que mostraron", visibles.every(function (j) { return idsRevelados.indexOf(j.id) >= 0; }));
  }
  const todosE = e1.mensajes;
  ok("El espectador nunca recibió «tus-cartas»", !todosE.some(function (m) { return m.tipo === "tus-cartas"; }));
  ok("Ni token ni cuentas en Bs en ningún mensaje", !todosE.some(function (m) { return m.token || m.cuentas || m.mensajeCuentas; }));
  ok("Ningún mensaje de mano en curso le muestra cartas de nadie", !todosE.some(function (m) {
    return m.estado && m.estado.fase && ["preflop", "flop", "turn", "river"].indexOf(m.estado.fase) >= 0 &&
      m.estado.jugadores.some(function (j) { return (j.cartas || []).some(function (c) { return !c.oculta; }) && !j.reveladas; });
  }));
  // Los bots hablan a veces (al azar): esperamos hasta 40 s a que alguno diga algo
  const chatBot = await esperar(e1, function (m) { return m.tipo === "chat" && m.bot; }, 40000);
  ok("Los bots con personalidad hablan en la mesa (por ejemplo: «" + (chatBot ? chatBot.deNombre + ": " + chatBot.frase : "—") + "»)", !!chatBot);
  ok("El espectador también ve los mensajes del chat", !!chatBot && (a.mensajes.concat(b.mensajes)).some(function (m) { return m.tipo === "chat" && m.bot; }));

  console.log("\n--- Chat escrito (80 letras, limpio, con límite) ---");
  b.mensajes.length = 0;
  const largo = "<b>hola</b>\u0000\u202e " + "x".repeat(120);
  enviar(a, { tipo: "chat", texto: largo });
  const ch = await esperar(b, function (m) { return m.tipo === "chat" && m.libre && !m.bot; });
  ok("Un mensaje escrito llega a la mesa", !!ch && ch.deNombre === "Ana");
  ok("Se corta en 80 letras", ch && Array.from(ch.frase).length === 80, ch && Array.from(ch.frase).length);
  ok("Se quitan caracteres de control e invisibles", ch && !/[\u0000-\u001f\u202e]/.test(ch.frase));
  ok("El HTML viaja como texto (el cliente lo escapa al mostrarlo)", ch && ch.frase.indexOf("<b>hola</b>") === 0);
  a.mensajes.length = 0;
  enviar(a, { tipo: "chat", texto: "rápido" });
  ok("Dos mensajes en menos de 2 s: «Esperá»", !!(await esperar(a, function (m) { return m.tipo === "error" && m.codigoError === "chat-rapido"; })));
  await dormir(2100);
  enviar(a, { tipo: "chat", texto: "    " });
  ok("Un mensaje vacío se rechaza", !!(await esperar(a, function (m) { return m.tipo === "error" && m.codigoError === "chat-vacio"; })));
  enviar(a, { tipo: "chat", texto: { mal: 1 } });
  ok("Un texto que no es texto se rechaza", !!(await esperar(a, function (m) { return m.tipo === "error" && m.codigoError === "chat-largo"; })));
  enviar(a, { tipo: "chat", texto: "y".repeat(5000) });
  ok("Un texto gigante se rechaza entero", !!(await esperar(a, function (m) { return m.tipo === "error" && m.codigoError === "chat-largo" && a.mensajes.filter(function (x) { return x.codigoError === "chat-largo"; }).length === 2; })));
  // ventana: 5 mensajes cada 20 s
  let cortado = false;
  for (let i = 0; i < 6; i++) {
    a.mensajes.length = 0;
    enviar(a, { tipo: "chat", texto: "msj " + i });
    const err = await esperar(a, function (m) { return m.tipo === "error" && /chat-/.test(m.codigoError || ""); }, 400);
    if (err && /Muchos/.test(err.mensaje)) { cortado = true; break; }
    await dormir(2050);
  }
  ok("Más de 5 mensajes en 20 s se frenan", cortado);
  e1.mensajes.length = 0;
  enviar(e1, { tipo: "chat", texto: "soy espectador" });
  ok("Un espectador no puede escribir en el chat", !!(await esperar(e1, function (m) { return m.tipo === "error"; })));

  console.log("\n--- Espectador que se va ---");
  a.mensajes.length = 0;
  enviar(e2, { tipo: "salir" });
  const baja = await esperar(a, function (m) { return m.tipo === "espectadores" && m.espectadores === 1; });
  ok("Al irse uno, el contador baja a 1", !!baja);
  e2.close();
  await dormir(200);
  a.mensajes.length = 0;
  e1.close();
  const baja0 = await esperar(a, function (m) { return m.tipo === "espectadores" && m.espectadores === 0; });
  ok("Si se cierra la conexión del último, baja a 0", !!baja0);

  console.log("\n--- Monedero en el servidor ---");
  const id = "0123456789abcdef01234567";
  const malo = await api("/api/monedero/xyz");
  ok("Un código de monedero inválido da 400", malo.status === 400);
  const nada = await api("/api/monedero/ffffffffffffffffffffffff");
  ok("Un monedero que no existe da 404", nada.status === 404);
  const put = await api("/api/monedero/" + id, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ monedero: { saldo: 4321, comprados: ["avatar:cabeza:1", "tema:oro", "no-existe", "tema:oro"], tema: "tema:oro", dorso: "dorso:oro" } })
  });
  ok("Se guarda el monedero", put.status === 200 && put.cuerpo.ok);
  const get = await api("/api/monedero/" + id);
  const m = get.cuerpo && get.cuerpo.monedero;
  ok("Se recupera con el mismo saldo", m && m.saldo === 4321);
  ok("Se limpian artículos inventados o repetidos", m && m.comprados.join(",") === "avatar:cabeza:1,tema:oro", m && m.comprados.join(","));
  ok("El dorso dorado no comprado no queda equipado", m && m.tema === "tema:oro" && m.dorso === "dorso:azul");
  const neg = await api("/api/monedero/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monedero: { saldo: -50 } }) });
  ok("Un saldo negativo se guarda como 0", neg.cuerpo && neg.cuerpo.monedero.saldo === 0);
  const sinCuerpo = await api("/api/monedero/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" });
  ok("Sin monedero en el cuerpo da 400", sinCuerpo.status === 400);

  a.close(); b.close();
  console.log("\n" + aciertos + " aciertos, " + fallos + " fallos");
  process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
