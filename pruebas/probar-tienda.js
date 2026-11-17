/* Monedas virtuales y tienda (v12). Ejecutar: node pruebas/probar-tienda.js */
"use strict";
const fs = require("fs");
const path = require("path");
const Tienda = require("../public/js/tienda.js");
const Avatar = require("../public/js/avatar.js");

let aciertos = 0, fallos = 0;
function ok(desc, cond, extra) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc + (extra ? "  -> " + extra : "")); }
}

console.log("--- Código 3174: +1000 cada vez, sin límite ---");
const m = Tienda.nuevoMonedero();
const inicial = m.saldo;
ok("Un monedero nuevo empieza con " + Tienda.SALDO_INICIAL + " monedas", inicial === Tienda.SALDO_INICIAL);
let todosOk = true;
for (let i = 1; i <= 25; i++) {
  const antes = m.saldo;
  const r = Tienda.canjear(m, "3174");
  if (!r.ok || r.monedas !== 1000 || m.saldo !== antes + 1000 || /usaste/i.test(r.mensaje)) { todosOk = false; break; }
}
ok("25 usos seguidos de 3174 suman 1000 cada uno (saldo " + m.saldo + ")", todosOk && m.saldo === inicial + 25000);
ok("Con espacios también funciona", Tienda.canjear(m, " 31 74 ").ok && m.saldo === inicial + 26000);
ok("El monedero no guarda ninguna marca de código usado", Object.keys(m).every(function (k) { return !/usad|codigo|canje/i.test(k); }), Object.keys(m).join(","));
const copia = Tienda.normalizar(JSON.parse(JSON.stringify(m)));
ok("Después de guardar y cargar, 3174 sigue sumando 1000", Tienda.canjear(copia, "3174").ok && copia.saldo === m.saldo + 1000);
const malo = Tienda.canjear(m, "1234");
ok("Un código que no existe no suma nada", !malo.ok && m.saldo === inicial + 26000);
const fuente = fs.readFileSync(path.join(__dirname, "../public/js/tienda.js"), "utf8") + fs.readFileSync(path.join(__dirname, "../public/js/interfaz.js"), "utf8");
ok("No existe el mensaje «Ya usaste este código»", !/ya usaste/i.test(fuente));

console.log("\n--- Ganar monedas jugando ---");
const H = "2026-11-17";
function mano(r, m, hoy) { m = m || Tienda.nuevoMonedero(); return Tienda.premioMano(m, r, hoy || H).n; }
ok("Se empieza con 100 monedas", Tienda.SALDO_INICIAL === 100 && Tienda.nuevoMonedero().saldo === 100);
ok("No jugar la mano: 0", mano({ jugo: false, gano: true }) === 0);
ok("Jugar y perder: +1", mano({ jugo: true }) === 1);
ok("Ganar sin showdown: +1 +5 = 6", mano({ jugo: true, gano: true, categoria: -1 }) === 6);
ok("Ganar en showdown con doble par: +6 (no llega a trío)", mano({ jugo: true, gano: true, showdown: true, categoria: 2 }) === 6);
ok("Ganar en showdown con trío: +1 +5 +10 = 16", mano({ jugo: true, gano: true, showdown: true, categoria: 3 }) === 16);
ok("Ganar con trío pero sin showdown: +6", mano({ jugo: true, gano: true, showdown: false, categoria: 3 }) === 6);
ok("Ganar en showdown con full: +16", mano({ jugo: true, gano: true, showdown: true, categoria: 6 }) === 16);
const mt = Tienda.nuevoMonedero();
let totalManos = 0;
for (let i = 0; i < 130; i++) totalManos += mano({ jugo: true }, mt, H);
ok("Por manos jugadas, como mucho 100 al día (130 manos → " + totalManos + ")", totalManos === 100 && mt.manosHoy === 100);
ok("El tope no frena lo de ganar (+5 igual)", mano({ jugo: true, gano: true }, mt, H) === 5);
ok("Al día siguiente vuelve a sumar", mano({ jugo: true }, mt, "2026-11-18") === 1 && mt.manosHoy === 1);

console.log("\n--- Logros (una sola vez) ---");
const ml = Tienda.nuevoMonedero();
ok("Primer póker: +100 (+1 por la mano)", mano({ jugo: true, categoria: 7 }, ml) === 101 && ml.logros.indexOf("poker") >= 0);
ok("El segundo póker ya no da el logro", mano({ jugo: true, categoria: 7 }, ml) === 1);
ok("Primera escalera de color: +200", mano({ jugo: true, categoria: 8 }, ml) === 201);
ok("Primer Royal Flush: +500", mano({ jugo: true, categoria: 9 }, ml) === 501);
ok("Royal Flush ganado en showdown: +1 +5 +10 y el logro ya cobrado", mano({ jugo: true, gano: true, showdown: true, categoria: 9 }, ml) === 16);
ok("Los logros se guardan", Tienda.normalizar(ml).logros.join(",") === "poker,escalera-color,escalera-real");

console.log("\n--- Partida o torneo ---");
const mp = Tienda.nuevoMonedero();
ok("Ganar la partida: +25", Tienda.premioPartida(mp, 1, false).n === 25);
ok("2.º puesto: +10", Tienda.premioPartida(mp, 2, false).n === 10);
ok("3.º puesto: nada", Tienda.premioPartida(mp, 3, false).n === 0);

console.log("\n--- Solo: la mitad (redondeando hacia abajo) ---");
const msol = Tienda.nuevoMonedero();
ok("Ganar la partida solo: 25 → 12", Tienda.premioPartida(msol, 1, true).n === 12);
ok("…y la media moneda queda guardada", msol.restoSolo === 1);
const ms2 = Tienda.nuevoMonedero();
ok("Una mano solo: 0 (media moneda guardada)", mano({ jugo: true, solo: true }, ms2) === 0 && ms2.restoSolo === 1);
ok("La segunda mano solo completa 1", mano({ jugo: true, solo: true }, ms2) === 1 && ms2.restoSolo === 0);
ok("Ganar en showdown con trío solo: 16 → 8", mano({ jugo: true, gano: true, showdown: true, categoria: 3, solo: true }, ms2) === 8);
ok("2.º puesto solo: 10 → 5", Tienda.premioPartida(Tienda.nuevoMonedero(), 2, true).n === 5);

console.log("\n--- Bono diario ---");
const mb = Tienda.nuevoMonedero();
const dias = ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"];
const bonos = dias.map(function (d) { return Tienda.bonoDiario(mb, d).n; });
ok("Días seguidos: 50, 60, 70, 80, 90, 100, 100 (" + bonos.join(", ") + ")", bonos.join(",") === "50,60,70,80,90,100,100");
ok("Una sola vez por día", Tienda.bonoDiario(mb, "2026-11-23") === null);
ok("Saltear un día vuelve a +50", Tienda.bonoDiario(mb, "2026-11-25").n === 50 && mb.diasSeguidos === 1);
ok("Cruza fin de mes (30 nov → 1 dic sigue la racha)", (function () { const x = Tienda.nuevoMonedero(); Tienda.bonoDiario(x, "2026-11-30"); return Tienda.bonoDiario(x, "2026-12-01").n === 60; })());
ok("El bono no se reduce en solo (no depende del modo)", Tienda.bonoDiario(Tienda.nuevoMonedero(), "2026-11-17").n === 50);
ok("fechaLocal() da AAAA-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(Tienda.fechaLocal()));
const m2 = Tienda.nuevoMonedero();
Tienda.ganar(m2, 17);
ok("ganar() suma al saldo y al total ganado", m2.saldo === Tienda.SALDO_INICIAL + 17 && m2.ganadoTotal === 17);

console.log("\n--- Comprar y equipar ---");
const m3 = Tienda.nuevoMonedero();
m3.saldo = 1100;
let r = Tienda.comprar(m3, "avatar:cabeza:1");
ok("Comprar la cabeza de pez (1000) descuenta el precio", r.ok && m3.saldo === 100 && Tienda.tienePieza(m3, "cabeza", 1));
r = Tienda.comprar(m3, "avatar:cabeza:1");
ok("No se puede comprar dos veces", !r.ok && m3.saldo === 100);
r = Tienda.comprar(m3, "avatar:orejas:1");
ok("Sin saldo suficiente no compra y dice cuánto falta", !r.ok && r.falta === 900 && m3.saldo === 100, JSON.stringify(r));
ok("Las cosas gratis ya se tienen", Tienda.tiene(m3, "tema:clasico") && Tienda.tienePieza(m3, "lentes", 1));
ok("No se puede equipar un tema no comprado", !Tienda.equipar(m3, "tema:oro") && m3.tema === "tema:clasico");
m3.saldo = 1000;
ok("Comprar y equipar el tema negro y oro", Tienda.comprar(m3, "tema:oro").ok && Tienda.equipar(m3, "tema:oro") && m3.tema === "tema:oro");
ok("Comprar y equipar el dorso aguayo", Tienda.comprar(m3, "dorso:aguayo").ok && Tienda.equipar(m3, "dorso:aguayo") && m3.dorso === "dorso:aguayo");
ok("Un artículo inventado no existe", !Tienda.comprar(m3, "avatar:cabeza:99").ok);

console.log("\n--- Avatar: lo bloqueado no se lleva a la mesa ---");
const pez = Object.assign(Avatar.porDefecto(), { cabeza: 1, orejas: 1, lentes: 3, sombrero: 1 });
const nuevo = Tienda.nuevoMonedero();
const bl = Tienda.piezasBloqueadas(nuevo, pez);
ok("Cabeza de pez, orejas de mono, lentes de oro y corona están bloqueadas", bl.map(function (p) { return p.campo; }).join(",") === "cabeza,orejas,lentes,sombrero", bl.map(function (p) { return p.campo; }).join(","));
ok("Su precio total es 1000+1000+250+500", bl.reduce(function (s, p) { return s + p.precio; }, 0) === 2750);
const perm = Tienda.avatarPermitido(nuevo, pez);
ok("Sin comprarlas, en la mesa se usan las opciones gratis", perm.cabeza === 0 && perm.orejas === 0 && perm.lentes === 0 && perm.sombrero === 0);
nuevo.saldo = 9000;
bl.forEach(function (p) { Tienda.comprar(nuevo, p.id); });
const perm2 = Tienda.avatarPermitido(nuevo, pez);
ok("Compradas, se llevan a la mesa", perm2.cabeza === 1 && perm2.orejas === 1 && perm2.lentes === 3 && perm2.sombrero === 1);

console.log("\n--- Catálogo ---");
const cat = Tienda.catalogo();
const tipos = {};
cat.forEach(function (it) { tipos[it.tipo] = (tipos[it.tipo] || 0) + 1; });
ok("Hay piezas de avatar, temas de mesa y dorsos (" + JSON.stringify(tipos) + ")", tipos.avatar >= 30 && tipos.tema >= 5 && tipos.dorso >= 5);
ok("Todo lo que se vende tiene precio > 0 y nombre", cat.filter(function (it) { return it.tipo === "avatar"; }).every(function (it) { return it.precio > 0 && it.nombre; }));
ok("Hay al menos 100 opciones de avatar (" + Avatar.totalOpciones() + ")", Avatar.totalOpciones() >= 100);
ok("Existen cabeza de pez, cara con granos y orejas de mono",
  Avatar.LABELS.cabeza.indexOf("Cabeza de pez") > 0 && Avatar.LABELS.marcas.indexOf("Cara con granos") > 0 && Avatar.LABELS.orejas.indexOf("Orejas de mono") > 0);
ok("Cada pieza de avatar se dibuja como SVG", cat.filter(function (it) { return it.tipo === "avatar"; }).every(function (it) {
  const a = Avatar.porDefecto(); a[it.campo] = it.valor; const s = Avatar.svg(a, 40); return /^<svg[^>]*viewBox="0 0 80 80"/.test(s) && s.indexOf("NaN") < 0 && s.indexOf("undefined") < 0;
}));

console.log("\n--- Exclusivos: cabeza de pez, cara con granos y orejas de mono ---");
const excl = cat.filter(function (it) { return it.exclusivo; });
ok("Son exactamente 3 exclusivos", excl.length === 3, excl.map(function (e) { return e.nombre; }).join(", "));
ok("Cada uno cuesta 1000 monedas", excl.every(function (e) { return e.precio === 1000; }));
ok("Son la cabeza de pez, la cara con granos y las orejas de mono",
  excl.map(function (e) { return e.nombre; }).sort().join("|") === ["Cabeza de pez", "Cara con granos", "Orejas de mono"].sort().join("|"));
let botsConExcl = 0;
for (let i = 0; i < 20000; i++) {
  const a = Avatar.aleatorio(i);
  if (Avatar.esExclusivo("cabeza", a.cabeza) || Avatar.esExclusivo("marcas", a.marcas) || Avatar.esExclusivo("orejas", a.orejas)) botsConExcl++;
}
ok("Ningún bot sale con un exclusivo (20.000 avatares al azar)", botsConExcl === 0, botsConExcl);
const pobre = Tienda.nuevoMonedero();
pobre.saldo = 999;
const rp = Tienda.comprar(pobre, "avatar:cabeza:1");
ok("Con 999 monedas no alcanza (falta 1)", !rp.ok && rp.falta === 1 && pobre.saldo === 999);
ok("Sin comprarlo no se lleva a la mesa", Tienda.avatarPermitido(pobre, { cabeza: 1, marcas: 1, orejas: 1 }).cabeza === 0);
Tienda.canjear(pobre, "3174");
ok("Con el código 3174 (+1000) ya alcanza y se compra con monedas", Tienda.comprar(pobre, "avatar:cabeza:1").ok && pobre.saldo === 999);

console.log("\n--- Temas de sonido ---");
const Sonidos = require("../public/js/sonidos.js");
ok("Hay 5 temas de sonido en la tienda", Tienda.SONIDOS.length === 5 && tipos.sonido === 5);
ok("El clásico es gratis y los demás se compran", Tienda.SONIDOS[0].precio === 0 && Tienda.SONIDOS.slice(1).every(function (x) { return x.precio > 0; }));
ok("Cada tema de la tienda existe en sonidos.js", Tienda.SONIDOS.every(function (x) { return Sonidos.TEMAS.indexOf(x.id.split(":")[1]) >= 0; }));
const ms = Tienda.nuevoMonedero();
ok("Sin comprar no se puede equipar", !Tienda.equipar(ms, "sonido:retro") && ms.sonido === "sonido:clasico");
ms.saldo = 1000;
Tienda.comprar(ms, "sonido:retro");
ok("Comprado se equipa", Tienda.equipar(ms, "sonido:retro") && ms.sonido === "sonido:retro");
ok("normalizar() conserva el sonido comprado y rechaza uno no comprado",
  Tienda.normalizar(ms).sonido === "sonido:retro" && Tienda.normalizar({ sonido: "sonido:fiesta" }).sonido === "sonido:clasico");
ok("Los temas son Clásico (gratis), Casino Vegas, Retro 8-bit, Fiesta y Minimal",
  Tienda.SONIDOS.map(function (x) { return x.nombre; }).join("|") === "Clásico|Casino Vegas|Retro 8-bit|Fiesta|Minimal" && Tienda.SONIDOS[0].precio === 0);
ok("Un tema viejo comprado en la v12 se pasa al nuevo (arcade → retro)", (function () {
  const v = Tienda.normalizar({ comprados: ["sonido:arcade"], sonido: "sonido:arcade" }); return v.sonido === "sonido:retro" && v.comprados.indexOf("sonido:retro") >= 0;
})());
const s1 = Sonidos.crearSonidos({ AudioContext: function () {} });
ok("ponerTema() acepta 'sonido:x' y vuelve a clásico si no existe", s1.ponerTema("sonido:vegas") === "vegas" && s1.ponerTema("nada") === "clasico");
ok("El tema Fiesta afina a la escala pentatónica (La 440 → La)", Math.abs(Sonidos.afinar(440, true) - 440) < 1 && Math.abs(Sonidos.afinar(466, true) - 440) < 1);
ok("Existe el sonido del barajado", s1.NOMBRES.indexOf("barajar") >= 0);

console.log("\n--- Racha de manos ganadas ---");
const mr = Tienda.nuevoMonedero();
let rr = null;
for (let i = 0; i < 3; i++) rr = Tienda.registrarRacha(mr, { jugo: true, gano: true });
ok("Tres manos ganadas seguidas → racha 3, récord 3", rr.racha === 3 && rr.mejor === 3 && rr.nueva);
rr = Tienda.registrarRacha(mr, { jugo: true, gano: false, retiro: true, gratis: true });
ok("Retirarse sin poner más que la ciega no corta la racha", rr.racha === 3 && rr.cambio === "igual");
rr = Tienda.registrarRacha(mr, { jugo: false });
ok("Una mano sin cartas (sin fichas) no cuenta", rr.racha === 3);
rr = Tienda.registrarRacha(mr, { jugo: true, gano: false, retiro: true, gratis: false });
ok("Retirarse después de meter fichas corta la racha", rr.racha === 0 && rr.cambio === "corte" && rr.mejor === 3);
Tienda.registrarRacha(mr, { jugo: true, gano: true });
rr = Tienda.registrarRacha(mr, { jugo: true, gano: false });
ok("Perder en showdown corta la racha (el récord queda)", rr.racha === 0 && rr.mejor === 3);
ok("La racha no cambia las monedas", mr.saldo === Tienda.SALDO_INICIAL);
ok("normalizar() guarda racha y récord", Tienda.normalizar({ racha: 2, mejorRacha: 7 }).mejorRacha === 7 && Tienda.normalizar({ racha: 9, mejorRacha: 2 }).mejorRacha === 9);

console.log("\n--- Chat escrito ---");
const Util = require("../public/js/utilidades.js");
ok("Corta en 80 caracteres", Array.from(Util.limpiarChat("a".repeat(200))).length === 80);
ok("Cuenta un emoji como uno", Array.from(Util.limpiarChat("😀".repeat(100))).length === 80);
ok("Quita caracteres de control e invisibles", Util.limpiarChat("ho\u0000la\u202e\u200b mundo") === "ho la mundo");
ok("Solo espacios queda vacío", Util.limpiarChat("   \n\t ") === "");
ok("escapar() neutraliza HTML", Util.escapar("<img src=x onerror='a'>") === "&lt;img src=x onerror=&#39;a&#39;&gt;");

console.log("\n--- Datos raros ---");
const raro = Tienda.normalizar({ saldo: "abc", comprados: "x", tema: "tema:oro", dorso: 5 });
ok("normalizar() arregla datos rotos", raro.saldo === Tienda.SALDO_INICIAL && Array.isArray(raro.comprados) && raro.tema === "tema:clasico" && raro.dorso === "dorso:azul");
ok("normalizar(null) da un monedero nuevo", Tienda.normalizar(null).saldo === Tienda.SALDO_INICIAL);
ok("formatear() usa punto de miles", Tienda.formatear(1234567) === "1.234.567");

console.log("\n" + aciertos + " aciertos, " + fallos + " fallos");
if (fallos) process.exit(1);
console.log("Todas las pruebas de la tienda pasaron.");
