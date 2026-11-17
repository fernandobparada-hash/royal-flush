/* v12 en un navegador real: Editar avatar desde el menú, piezas con candado y precio,
   tienda (código 3174 repetido, temas, dorsos), mesa de 15 con personalidades,
   monedas ganadas al jugar y «Mesas en vivo» para mirar con contador.
   Necesita el servidor: POKER_RAPIDO=1 npm start
   Uso: node pruebas/probar-navegador-v12.js [http://localhost:3000] */
"use strict";
const WebSocket = require("ws");

function cargarPlaywright() {
  const candidatos = ["playwright", "playwright-core", "/opt/npm-tools/node_modules/playwright", "/tmp/pw/node_modules/playwright-core"];
  for (let i = 0; i < candidatos.length; i++) {
    try { return require(candidatos[i]); } catch (e) { /* siguiente */ }
  }
  return null;
}
const pw = cargarPlaywright();
if (!pw) { console.log("OMITIDA: no hay Playwright instalado."); process.exit(0); }

const BASE = process.argv[2] || "http://localhost:3000";
let aciertos = 0, fallos = 0;
function ok(desc, cond, extra) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc + (extra ? "  -> " + extra : "")); }
}
function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  const nav = await pw.chromium.launch();
  for (const [tag, vp] of [["teléfono", { width: 390, height: 844 }], ["compu", { width: 1366, height: 768 }]]) {
    console.log("\n=== " + tag + " " + vp.width + "x" + vp.height + " ===");
    const ctx = await nav.newContext({ viewport: vp });
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", function (e) { errores.push(e.message); });
    await p.goto(BASE + "/");
    await p.fill("#nombre-jugador", "Fernando");
    const saldo = function () { return p.evaluate(function () { return window.__RF.ui.monedero.saldo; }); };
    await p.waitForFunction(function () { return /\+50 🪙/.test(document.getElementById("toasts").textContent); }, null, { timeout: 4000 }).catch(function () {});
    ok("Primera vez: 100 de inicio + 50 de bono diario, con aviso «+50 🪙»", await saldo() === 150 && /\+50 🪙/.test(await p.textContent("#toasts")), await saldo());
    const s0 = await saldo();
    ok("Se ve el saldo de monedas en el menú (" + s0 + ")", (await p.textContent("#barra-extras-menu .saldo-monedas")).trim() === String(s0));

    console.log("--- Editar avatar ---");
    ok("El menú tiene «Editar avatar»", await p.isVisible("#btn-editar-avatar"));
    await p.click("#btn-editar-avatar");
    ok("Abre el editor", await p.isVisible("#pantalla-avatar"));
    const nChips = await p.locator("#controles-avatar button").count();
    ok("El editor muestra todas las opciones (" + nChips + ")", nChips === await p.evaluate(function () { return window.PokerAvatar.totalOpciones(); }));
    const pez = p.locator('#controles-avatar button[data-campo="cabeza"][data-valor="1"]');
    ok("La cabeza de pez tiene candado, precio 1000 y marca de exclusivo", (await pez.getAttribute("class")).indexOf("bloqueado") >= 0 && /1000/.test(await pez.textContent()) && (await pez.getAttribute("class")).indexOf("exclusivo") >= 0);
    await pez.click();
    ok("Tocar una pieza bloqueada la muestra en la vista previa", (await p.innerHTML("#preview-avatar")).indexOf("<svg") === 0 && await p.isVisible("#aviso-bloqueadas"));
    ok("El aviso ofrece comprarla (o dice cuánto falta)", /Comprar|faltan/.test(await p.textContent("#btn-comprar-bloqueadas")));
    await p.click("#btn-avatar-listo");
    ok("«Listo» no deja salir con piezas sin comprar", await p.isVisible("#pantalla-avatar"));
    const granos = p.locator('#controles-avatar button[data-campo="marcas"][data-valor="1"]');
    const orejas = p.locator('#controles-avatar button[data-campo="orejas"][data-valor="1"]');
    ok("Cara con granos y orejas de mono también están (1000 cada una)", /1000/.test(await granos.textContent()) && /1000/.test(await orejas.textContent()));
    await p.click('#controles-avatar button[data-campo="cabeza"][data-valor="0"]');
    ok("Volviendo a lo gratis, el aviso desaparece", await p.isHidden("#aviso-bloqueadas"));
    await p.click("#btn-avatar-listo");
    ok("«Listo» vuelve al menú", await p.isVisible("#pantalla-menu"));

    console.log("--- Código 3174 en el pie del menú ---");
    ok("Hay un botón «Código» abajo del todo en el menú", await p.isVisible("#btn-codigo-menu") && await p.evaluate(function () {
      const b = document.getElementById("btn-codigo-menu").getBoundingClientRect();
      const d = document.querySelector("#pantalla-menu .disclaimer").getBoundingClientRect();
      const otros = Array.from(document.querySelectorAll("#pantalla-menu button")).filter(function (x) { return (x.checkVisibility ? x.checkVisibility() : x.offsetParent) && x.id !== "btn-codigo-menu" && x.id !== "btn-canjear-menu"; });
      return b.top >= d.bottom - 1 && otros.every(function (x) { return x.getBoundingClientRect().top < b.top; });
    }));
    await p.click("#btn-codigo-menu");
    await p.fill("#input-codigo-menu", "3174");
    const m0 = await saldo();
    for (let i = 0; i < 4; i++) await p.click("#btn-canjear-menu");
    ok("Desde el menú, 3174 cuatro veces suma 4000", await saldo() === m0 + 4000, (await saldo()) - m0);
    ok("Sin «Ya usaste este código» y el saldo del menú se actualiza", !/usaste/i.test(await p.textContent("#aviso-codigo-menu")) &&
      (await p.textContent("#barra-extras-menu .saldo-monedas")).replace(/\./g, "") === String(m0 + 4000));
    await p.fill("#input-codigo-menu", "1111");
    await p.click("#btn-canjear-menu");
    ok("Un código que no existe no suma", await saldo() === m0 + 4000 && /no existe/.test(await p.textContent("#aviso-codigo-menu")));

    console.log("--- Tienda y código 3174 ---");
    await p.click("#btn-tienda");
    const items = await p.locator("#grilla-tienda .item-tienda").count();
    ok("La tienda muestra las piezas de avatar con su dibujo (" + items + ")", items >= 30 && await p.locator("#grilla-tienda .item-tienda svg").count() === items);
    await p.click('.tabs-tienda button[data-tab="codigo"]');
    await p.fill("#input-codigo-monedas", "3174");
    const antes = await saldo();
    for (let i = 0; i < 3; i++) await p.click("#btn-canjear");
    const despues = await saldo();
    ok("Escribir 3174 tres veces suma 3000 (" + antes + " → " + despues + ")", despues === antes + 3000);
    ok("No aparece «Ya usaste este código»", !/usaste/i.test(await p.textContent("#aviso-canje")));
    ok("El saldo se ve actualizado en la tienda", (await p.textContent("#pantalla-tienda .saldo-monedas")).replace(/\./g, "") === String(despues));
    // comprar y usar la cabeza de pez desde la tienda
    await p.click('.tabs-tienda button[data-tab="avatar"]');
    await p.click('#grilla-tienda button[data-id="avatar:cabeza:1"]');
    ok("Comprar la cabeza de pez descuenta 1000", await saldo() === despues - 1000);
    ok("En la tienda los 3 exclusivos tienen el sello «Exclusivo»", await p.locator("#grilla-tienda .item-tienda.exclusivo .sello-exclusivo").count() === 3);
    ok("Y queda puesta en tu avatar", await p.evaluate(function () { return window.__RF.ui.avatar.cabeza === 1; }));
    await p.click('.tabs-tienda button[data-tab="tema"]');
    await p.click('#grilla-tienda button[data-id="tema:azul"]');
    ok("Comprar el tema azul lo equipa", await p.evaluate(function () { return document.documentElement.getAttribute("data-tema") === "azul"; }));
    await p.click('.tabs-tienda button[data-tab="dorso"]');
    await p.click('#grilla-tienda button[data-id="dorso:rojo"]');
    ok("Comprar el dorso rojo lo equipa", await p.evaluate(function () { return document.documentElement.getAttribute("data-dorso") === "rojo"; }));
    await p.click('.tabs-tienda button[data-tab="sonido"]');
    ok("La pestaña Sonidos muestra 5 temas con «Probar»", await p.locator("#grilla-tienda .item-tienda").count() === 5 && await p.locator('#grilla-tienda button[data-accion="probar"]').count() === 5);
    ok("Los temas son Clásico, Casino Vegas, Retro 8-bit, Fiesta y Minimal", (await p.locator("#grilla-tienda .nombre-item").allTextContents()).join("|") === "Clásico|Casino Vegas|Retro 8-bit|Fiesta|Minimal");
    await p.click('#grilla-tienda button[data-id="sonido:retro"][data-accion="comprar"]');
    ok("Comprar Retro 8-bit lo equipa", await p.evaluate(function () { return window.__RF.ui.monedero.sonido === "sonido:retro"; }));
    await p.click('#grilla-tienda button[data-id="sonido:vegas"][data-accion="probar"]');
    await dormir(1300);
    ok("«Probar» otro tema no cambia el equipado", await p.evaluate(function () { return window.__RF.ui.monedero.sonido === "sonido:retro"; }));
    await p.reload();
    ok("Al recargar la página se mantienen saldo, tema y dorso", await saldo() === despues - 1000 - 150 - 100 - 150 &&
      await p.evaluate(function () { return document.documentElement.getAttribute("data-tema") === "azul" && document.documentElement.getAttribute("data-dorso") === "rojo"; }));
    await p.fill("#nombre-jugador", "Fernando");

    console.log("--- Mesa solo de 15 con personalidades ---");
    await p.click("#btn-solo");
    ok("Hay opción de 15 asientos y no de 20", await p.locator('input[name="asientos-solo"][value="15"]').count() === 1 && await p.locator('input[name="asientos-solo"][value="20"]').count() === 0);
    await p.check('input[name="asientos-solo"][value="15"]');
    await p.click("#btn-empezar-solo");
    const vioRiffle = await p.waitForSelector(".riffle .riffle-carta", { timeout: 5000 }).then(function () { return true; }).catch(function () { return false; });
    const tRiffle = Date.now();
    ok("Antes de repartir se ve el barajado (riffle)", vioRiffle);
    ok("El riffle usa el dorso equipado (rojo)", await p.evaluate(function () {
      const c = document.querySelector(".riffle .riffle-carta"); return !!c && getComputedStyle(c).borderTopColor.replace(/\s/g, "") === "rgb(244,227,178)";
    }));
    await p.waitForSelector(".riffle", { state: "detached", timeout: 5000 }).catch(function () {});
    const durRiffle = Date.now() - tRiffle;
    ok("El riffle dura entre 1,2 y 1,8 s (" + durRiffle + " ms)", durRiffle >= 1150 && durRiffle <= 1900, durRiffle);
    await p.waitForSelector(".pieza-info[data-asiento='14']", { timeout: 8000 });
    ok("La mesa tiene 15 asientos", await p.locator(".pieza-info").count() === 15);
    const tags = await p.locator(".tag-personalidad").count();
    ok("Los 14 bots muestran su personalidad (etiqueta con descripción)", tags === 14 && /·/.test(await p.locator(".tag-personalidad").first().getAttribute("title")));
    ok("El felt usa el color del tema azul", await p.evaluate(function () {
      const st = document.querySelector('[id^="feltLuz"] stop'); return getComputedStyle(st).stopColor.replace(/\s/g, "") === "rgb(47,134,207)";
    }));
    ok("Tu avatar en la mesa es la cabeza de pez comprada", await p.evaluate(function () {
      const j = window.__RF.ui.estado.jugadores.find(function (x) { return x.id === "humano"; }); return j.avatar.cabeza === 1;
    }));
    // jugar una mano: retirarse cuando toque (o esperar) y ver que suman monedas
    // En solo se gana la mitad: contamos en medias monedas (saldo×2 + la media guardada)
    const medias = function () { return p.evaluate(function () { const m = window.__RF.ui.monedero; return m.saldo * 2 + (m.restoSolo || 0); }); };
    const s1 = await medias();
    const limite = Date.now() + 120000;
    while (Date.now() < limite && await medias() === s1) {
      if (await p.isVisible("#btn-retirarse") && await p.isEnabled("#btn-retirarse")) { await p.click("#btn-retirarse").catch(function () {}); }
      await dormir(400);
    }
    const s2 = await medias();
    ok("Jugando solo se gana la mitad (+" + ((s2 - s1) / 2) + " monedas en la primera mano)", s2 - s1 >= 1);
    ok("La racha es un número y su contador solo se ve si es 1 o más", await p.evaluate(function () {
      const n = window.__RF.ui.monedero.racha; const el = document.getElementById("info-racha");
      return typeof n === "number" && el.hidden === (n < 1);
    }));

    console.log("--- Chat escrito ---");
    await p.click("#btn-abrir-chat");
    ok("El chat tiene un campo para escribir de 80 letras", await p.isVisible("#input-chat") && await p.getAttribute("#input-chat", "maxlength") === "80");
    const malo = '<img src=x onerror="window.__xss=1">hola';
    await p.fill("#input-chat", malo);
    await p.click("#btn-enviar-chat");
    await dormir(150);
    ok("El mensaje se muestra como texto (escapado), sin ejecutar HTML", await p.evaluate(function (m) {
      const li = Array.from(document.querySelectorAll("#log-chat li")).find(function (x) { return x.textContent.indexOf(m) >= 0; });
      return !!li && !document.querySelector("#log-chat img, .globo-chat img") && window.__xss === undefined;
    }, malo));
    ok("Aparece el globo sobre tu asiento", await p.locator('.pieza-globo[data-asiento="0"] .globo-chat').count() === 1);
    await p.fill("#input-chat", "otro");
    await p.click("#btn-enviar-chat");
    ok("Mandar dos seguidos avisa que esperes", /Esperá/.test(await p.textContent("#aviso-chat")));
    await p.click("#btn-cerrar-chat");

    console.log("--- Sin fichas: «Recargar» abajo ---");
    await p.waitForFunction(function () {
      const u = window.__RF.ui; const j = u.mesa && u.mesa.jugadorPorId("humano");
      return j && (j.retirado || !j.enMano || u.mesa.fase === "entre-manos");
    }, null, { timeout: 60000 }).catch(function () {});
    await p.evaluate(function () {
      const u = window.__RF.ui; const j = u.mesa.jugadorPorId("humano"); j.fichas = 0; window.__RF.renderMesa(u.mesa.estadoPublico("humano"));
    });
    ok("Con 0 fichas aparece la barra con «Recargar» abajo", await p.isVisible("#btn-recargar-sin-fichas") && await p.evaluate(function () {
      const b = document.getElementById("barra-sin-fichas").getBoundingClientRect(); return b.top > window.innerHeight * 0.5;
    }));
    await p.click("#btn-recargar-sin-fichas");
    ok("Abre «Recargar» con un solo campo de monto (sin montos fijos)", await p.isVisible("#input-recarga") &&
      await p.locator("#vista-recargar button").count() === 1 && await p.isHidden("#tab-resumen"));
    await p.fill("#input-recarga", "5");
    await p.click("#btn-recargar");
    ok("Menos de 10 Bs no se puede", /mínimo/.test(await p.textContent("#aviso-recarga")));
    await p.fill("#input-recarga", "25");
    await p.click("#btn-recargar");
    await dormir(200);
    ok("25 Bs suman 250 fichas en solo y la barra se va", await p.evaluate(function () {
      const u = window.__RF.ui; const j = u.mesa.jugadorPorId("humano"); return (j.fichas + (u.recargaSoloPendiente || 0)) === 250;
    }) && await p.isHidden("#barra-sin-fichas"));

    const solapes = await p.evaluate(function () { return window.__RF.medirSolapes(); });
    ok("Sin solapes en la mesa de 15", !solapes.overlaps.length && !solapes.fuera.length, JSON.stringify(solapes.overlaps));
    await p.click("#btn-salir-mesa");
    const conf = p.locator("#btn-confirmar-salir");
    if (await conf.count() && await conf.isVisible()) await conf.click();
    await dormir(300);

    console.log("--- Opción para apagar el barajado ---");
    await p.goto(BASE + "/");
    await p.click("#opciones-online summary");
    ok("En Opciones hay «Animación de barajado» (prendida)", await p.isVisible("#opcion-barajado") && await p.isChecked("#opcion-barajado"));
    await p.uncheck("#opcion-barajado");
    await p.fill("#nombre-jugador", "Fernando");
    await p.click("#btn-solo");
    await p.click("#btn-empezar-solo");
    const hubo = await p.waitForSelector(".riffle", { timeout: 2500 }).then(function () { return true; }).catch(function () { return false; });
    ok("Apagada, no hay barajado y se reparte directo", !hubo && await p.waitForSelector(".carta-voladora", { timeout: 4000 }).then(function () { return true; }).catch(function () { return false; }));
    await p.click("#btn-salir-mesa");
    if (await conf.count() && await conf.isVisible()) await conf.click();
    await p.goto(BASE + "/");
    await p.click("#opciones-online summary");
    await p.check("#opcion-barajado");
    ok("Queda guardada al volver a prenderla", await p.evaluate(function () { return localStorage.getItem("rf_barajado") === "1"; }));
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.fill("#nombre-jugador", "Fernando");
    await p.click("#btn-solo");
    await p.click("#btn-empezar-solo");
    const conMenos = await p.waitForSelector(".riffle", { timeout: 2500 }).then(function () { return true; }).catch(function () { return false; });
    ok("Con «menos movimiento» del aparato tampoco hay barajado (aunque esté prendido)", !conMenos);
    await p.emulateMedia({ reducedMotion: "no-preference" });
    await p.click("#btn-salir-mesa");
    if (await conf.count() && await conf.isVisible()) await conf.click();

    console.log("--- Mesas en vivo ---");
    // una mesa pública con dos personas (por WebSocket)
    const wsA = new WebSocket(BASE.replace(/^http/, "ws") + "/ws");
    await new Promise(function (r) { wsA.on("open", r); });
    wsA.send(JSON.stringify({ tipo: "unirse-publica", nombre: "Ana" + tag.length, asientos: 9 }));
    await dormir(500);
    await p.goto(BASE + "/");
    await p.click("#btn-mesas-vivo");
    await p.waitForSelector("#lista-mesas-vivo li", { timeout: 6000 }).catch(function () {});
    const filas = await p.locator("#lista-mesas-vivo li").count();
    ok("La lista muestra mesas públicas (" + filas + ")", filas >= 1);
    await p.locator("#lista-mesas-vivo button[data-mirar]").first().click();
    await p.waitForSelector("#pantalla-mesa:not([hidden])", { timeout: 6000 }).catch(function () {});
    ok("«Mirar» entra a la mesa como espectador", await p.evaluate(function () { return window.__RF.ui.espectador === true; }));
    await dormir(400);
    ok("Se ve el contador de espectadores (👁 1)", await p.isVisible("#info-espectadores") && /1/.test(await p.textContent("#info-espectadores")));
    ok("El espectador no tiene botones de juego", await p.evaluate(function () {
      const pa = document.getElementById("panel-acciones"); return !pa || pa.hidden || getComputedStyle(pa).display === "none" || !window.__RF.ui.estado.acciones;
    }));
    wsA.close();
    ok("Sin errores de JavaScript", errores.length === 0, errores.join(" | "));
    await ctx.close();
  }
  await nav.close();
  console.log("\n" + aciertos + " aciertos, " + fallos + " fallos");
  process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
