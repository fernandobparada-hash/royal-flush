/* v12.2: tus dos cartas tienen que verse SIEMPRE, grandes, sin nada encima y junto a tu asiento.
   Bug de Fernando: en la mesa de 15 (solo) no se veían sus cartas (en el celular quedaban de 18 px
   una encima de otra, y en la compu se iban al lado de otro jugador).
   Revisa mesas de 9, 10 y 15, solo y online, en teléfono (vertical y acostado) y compu.
   Necesita el servidor: POKER_RAPIDO=1 npm start
   Uso: node pruebas/probar-cartas-propias.js [http://localhost:3000]
   Fotos en $OUT (por defecto /tmp/cartas-propias). */
"use strict";
const fs = require("fs");
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
const OUT = process.env.OUT || "/tmp/cartas-propias";
fs.mkdirSync(OUT, { recursive: true });
let aciertos = 0, fallos = 0;
function ok(desc, cond, extra) {
  if (cond) { aciertos++; console.log("  OK  " + desc); }
  else { fallos++; console.log("  FALLO  " + desc + (extra ? "  -> " + extra : "")); }
}
function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

const PANTALLAS = [
  { tag: "telefono", opts: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { tag: "telefono-acostado", opts: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { tag: "compu", opts: { viewport: { width: 1366, height: 768 } } }
];

async function nuevaPagina(nav, pant) {
  const ctx = await nav.newContext(pant.opts);
  // sin barajado animado para no esperar de más (el riffle se prueba en probar-navegador-v12)
  await ctx.addInitScript(function () { try { localStorage.setItem("rf_barajado", "0"); } catch (e) { /* nada */ } });
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", function (e) { errores.push(e.message); });
  return { ctx: ctx, p: p, errores: errores };
}

/** Espera tus 2 cartas repartidas, que terminen las animaciones y revisa. */
async function revisar(p, etiqueta, foto) {
  const hay = await p.waitForFunction(function () {
    const pz = document.querySelector("#asientos .pieza-cartas.propio");
    return !!pz && pz.querySelectorAll(".carta").length === 2 && !document.querySelector(".carta-voladora, .riffle");
  }, null, { timeout: 15000 }).then(function () { return true; }).catch(function () { return false; });
  ok(etiqueta + ": tus 2 cartas están repartidas", hay);
  if (!hay) return;
  // que se vayan los avisos de un momento (bono diario, etc.) y se acomode la mesa
  await p.waitForFunction(function () {
    const t = document.querySelector(".toast, #toast");
    return !t || t.hidden || getComputedStyle(t).display === "none" || getComputedStyle(t).opacity === "0";
  }, null, { timeout: 6000 }).catch(function () {});
  await dormir(700);
  const r = await p.evaluate(function () {
    const s = window.__RF.medirSolapes();
    const c = window.__RF.medirCartasPropias();
    const pz = document.querySelector("#asientos .pieza-cartas.propio");
    const as = pz ? pz.getAttribute("data-asiento") : "?";
    const conMias = (s.overlaps || []).filter(function (o) { return o.indexOf("cartas-" + as + " ") !== -1 || / cartas-(\d+)$/.exec(o) && / cartas-(\d+)$/.exec(o)[1] === as; });
    return { c: c, conMias: conMias, as: as, todos: s.overlaps || [] };
  });
  ok(etiqueta + ": se ven bien (" + r.c.cartas.map(function (x) { return x[2] + "x" + x[3]; }).join(", ") + ", asiento " + r.as + ")", r.c.ok, r.c.problemas.join("; "));
  ok(etiqueta + ": nada de la mesa se encima con tus cartas", r.conMias.length === 0, r.conMias.join(" | "));
  if (foto) await p.screenshot({ path: OUT + "/" + foto });
}

/** La primera vez sale el editor de avatar: lo saltamos si aparece. */
async function saltarAvatar(p) {
  const b = p.locator("#btn-avatar-saltar");
  await b.waitFor({ state: "visible", timeout: 1500 }).catch(function () {});
  if (await b.isVisible().catch(function () { return false; })) await b.click();
}

async function solo(nav, pant, n) {
  const { ctx, p, errores } = await nuevaPagina(nav, pant);
  await p.goto(BASE + "/");
  await p.fill("#nombre-jugador", "Fernando");
  await p.click("#btn-solo");
  await saltarAvatar(p);
  await p.waitForSelector("#pantalla-solo:not([hidden])", { timeout: 5000 });
  await p.check('input[name="asientos-solo"][value="' + n + '"]');
  await p.click("#btn-empezar-solo");
  await revisar(p, "solo " + n + " · " + pant.tag, "solo-" + n + "-" + pant.tag + ".png");
  ok("solo " + n + " · " + pant.tag + ": sin errores de JavaScript", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

async function online(nav, pant, n) {
  // un anfitrión por WebSocket crea la mesa; tú entras con el código (te toca otro asiento, no el 0)
  const host = new WebSocket(BASE.replace(/^http/, "ws") + "/ws");
  await new Promise(function (r, j) { host.on("open", r); host.on("error", j); });
  let codigo = null;
  host.on("message", function (d) {
    const m = JSON.parse(d.toString());
    if (m.tipo === "en-sala" && !codigo) codigo = m.codigo;
  });
  host.send(JSON.stringify({ tipo: "crear-privada", nombre: "Ana", asientos: n, fichasIniciales: 1000 }));
  for (let k = 0; k < 200 && !codigo; k++) await dormir(30);
  const { ctx, p, errores } = await nuevaPagina(nav, pant);
  await p.goto(BASE + "/");
  await p.fill("#nombre-jugador", "Fernando");
  await p.click("#opciones-online summary");
  await p.fill("#input-codigo", codigo || "");
  await p.click("#btn-unirse-codigo");
  await saltarAvatar(p);
  await p.waitForSelector("#pantalla-mesa:not([hidden])", { timeout: 8000 }).catch(function () {});
  await dormir(300);
  host.send(JSON.stringify({ tipo: "llenar-bots" }));
  await dormir(200);
  host.send(JSON.stringify({ tipo: "iniciar" }));
  const et = "online " + n + " · " + pant.tag;
  await revisar(p, et, "online-" + n + "-" + pant.tag + ".png");
  ok(et + ": tu asiento se dibuja abajo aunque no seas el asiento 0", await p.waitForFunction(function () {
    const pz = document.querySelector("#asientos .pieza-info.propio");
    if (!pz) return false;
    const r = pz.getBoundingClientRect(), m = document.getElementById("mesa-oval").getBoundingClientRect();
    return pz.getAttribute("data-asiento") !== "0" && (r.top + r.height / 2) > m.top + m.height * 0.6;
  }, null, { timeout: 4000 }).then(function () { return true; }).catch(function () { return false; }));
  ok(et + ": sin errores de JavaScript", errores.length === 0, errores.join(" | "));
  host.close();
  await ctx.close();
}

(async function () {
  const nav = await pw.chromium.launch();
  for (const pant of PANTALLAS) {
    for (const n of [9, 10, 15]) {
      console.log("\n=== " + pant.tag + " · " + n + " asientos ===");
      await solo(nav, pant, n);
      await online(nav, pant, n);
    }
  }
  await nav.close();
  console.log("\nFotos en " + OUT);
  console.log(aciertos + " aciertos, " + fallos + " fallos");
  process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
