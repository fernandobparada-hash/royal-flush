"use strict";
const { chromium, devices } = require("/tmp/pw/node_modules/playwright-core");

const BASE = process.env.BASE || "http://127.0.0.1:3456";
const OUT = process.env.OUT || "/workspace/poker-mesa";

const IPHONES = ["iPhone 13", "iPhone 14", "iPhone 15 Pro Max"];

async function montar(page, opt) {
  await page.evaluate((opt) => {
    window.__RF.montarDemo(opt);
  }, opt);
  await page.waitForTimeout(280);
  await page.evaluate(() => {
    if (window.__RF && window.__RF.ui && window.__RF.ui.estado) {
      window.__RF.aplicarLayout(window.__RF.ui.estado);
    }
  });
  await page.waitForTimeout(80);
}

async function forzarCartasPropias(page, textosYPalos) {
  await page.evaluate((pares) => {
    const mazo = window.PokerEvaluador.crearMazo();
    const cartas = pares.map(function (p) {
      return mazo.find(function (c) { return c.texto === p.texto && c.palo === p.palo; });
    });
    const mesa = window.__RF.ui.mesa;
    const yo = mesa && mesa.jugadorPorId && mesa.jugadorPorId("humano");
    if (yo) yo.cartas = cartas;
    window.__RF.renderMesa(mesa.estadoPublico("humano"));
  }, textosYPalos);
  await page.waitForTimeout(280);
  await page.evaluate(() => {
    if (window.__RF.ui.estado) window.__RF.aplicarLayout(window.__RF.ui.estado);
  });
  await page.waitForTimeout(80);
}

async function inspeccionar(page) {
  return page.evaluate(() => {
    const issues = [];
    const propios = Array.from(document.querySelectorAll(".pieza-cartas.propio .carta"));
    const todas = Array.from(document.querySelectorAll(".carta"));
    const lista = propios.length ? propios : todas;
    const ranks = [];
    lista.forEach(function (el, i) {
      const r = el.getBoundingClientRect();
      const svg = el.querySelector("svg.cara-carta, svg");
      if (!svg) { issues.push("carta " + i + " sin SVG"); return; }
      const rangos = Array.from(el.querySelectorAll("text.rango-svg")).map(function (t) { return (t.textContent || "").trim(); });
      if (!rangos.length || !rangos[0]) issues.push("carta " + i + " sin rango visible");
      ranks.push(rangos[0] || "");
      const centro = el.querySelector("text.palo-centro-svg");
      if (centro) {
        const cr = centro.getBoundingClientRect();
        if (cr.width < 1 || cr.height < 1) issues.push("carta " + i + " palo central vacío");
        if (cr.left < r.left - 1.5 || cr.right > r.right + 1.5 || cr.top < r.top - 1.5 || cr.bottom > r.bottom + 1.5) {
          issues.push("carta " + i + " palo se sale de la carta");
        }
      }
      const overflow = getComputedStyle(el).overflow;
      if (overflow !== "hidden" && overflow !== "clip") issues.push("carta " + i + " overflow=" + overflow);
    });
    const nameEl = document.querySelector(".pieza-info.propio .nombre-jugador");
    const nameText = nameEl ? nameEl.textContent.trim() : "";
    const nameClipped = !!(nameEl && nameEl.clientWidth > 0 && nameEl.scrollWidth > nameEl.clientWidth + 1);
    if (!nameText || nameText === "F..." || nameText === "F…" || /^\w\.\.\.?$/.test(nameText)) {
      issues.push("nombre propio truncado: " + JSON.stringify(nameText));
    }
    if (nameText && nameText.indexOf("Fernando") === -1 && nameText.length <= 2) {
      issues.push("nombre propio ilegible: " + JSON.stringify(nameText));
    }
    if (nameClipped && nameText !== "Fernando" && nameText.indexOf("Fernando") === -1) {
      issues.push("nombre propio no cabe: " + JSON.stringify(nameText) + " scroll=" + nameEl.scrollWidth + " client=" + nameEl.clientWidth);
    }
    const ap = document.querySelector(".apuesta-frente, .pila-valor, #bote");
    const apSize = ap ? parseFloat(getComputedStyle(ap).fontSize) : 0;
    if (apSize > 16) issues.push("número de ficha demasiado grande: " + apSize + "px");
    const msg = document.getElementById("mensaje-mesa");
    const msgClip = !!(msg && msg.clientWidth > 0 && msg.scrollWidth > msg.clientWidth + 2 && msg.clientHeight < 8);
    const htmlFs = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return {
      issues: issues,
      ranks: ranks,
      nameText: nameText,
      nameClipped: nameClipped,
      apSize: apSize,
      htmlFs: htmlFs,
      nPropios: propios.length,
      nCartas: todas.length,
      msg: msg ? msg.textContent : "",
      msgClip: msgClip
    };
  });
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let fallos = 0, ok = 0;

  async function caso(label, contextFactory, body) {
    const context = await contextFactory();
    const page = await context.newPage();
    try {
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await body(page);
      ok++;
      console.log("OK    " + label);
    } catch (e) {
      fallos++;
      console.log("FALLO " + label + " :: " + (e && e.message ? e.message : e));
    }
    await context.close();
  }

  for (const name of IPHONES) {
    const desc = devices[name];
    if (!desc) { console.log("SIN DISPOSITIVO " + name); fallos++; continue; }
    await caso(name + " cartas y nombre", function () {
      return browser.newContext({ ...desc });
    }, async (page) => {
      await montar(page, { asientos: 9, fase: "flop", forzarAcciones: true, nombre: "Fernando" });
      await forzarCartasPropias(page, [
        { texto: "10", palo: "♣" },
        { texto: "A", palo: "♥" }
      ]);
      const r = await inspeccionar(page);
      if (r.issues.length) throw new Error(r.issues.join(" | ") + " | " + JSON.stringify(r));
      if (r.ranks.indexOf("10") < 0) throw new Error("no se ve el 10: " + r.ranks);
      if (r.nameText.indexOf("Fernando") < 0) throw new Error("nombre=" + r.nameText);
    });
  }

  await caso("accesibilidad html font-size 24px en iPhone 14", function () {
    return browser.newContext({ ...devices["iPhone 14"] });
  }, async (page) => {
    await page.addStyleTag({ content: "html { font-size: 24px !important; }" });
    await montar(page, { asientos: 9, fase: "preflop", todasApuestas: true, forzarAcciones: true, nombre: "Fernando" });
    await forzarCartasPropias(page, [
      { texto: "10", palo: "♣" },
      { texto: "K", palo: "♠" }
    ]);
    const r = await inspeccionar(page);
    if (r.issues.length) throw new Error(r.issues.join(" | ") + " | " + JSON.stringify(r));
    if (r.nameText.indexOf("Fernando") < 0) throw new Error("nombre=" + r.nameText);
    if (r.apSize > 16) throw new Error("fichas " + r.apSize);
  });

  // Screenshots
  const context = await browser.newContext({ ...devices["iPhone 14"] });
  const page = await context.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await montar(page, { asientos: 9, fase: "flop", forzarAcciones: true, nombre: "Fernando" });
  await forzarCartasPropias(page, [
    { texto: "10", palo: "♣" },
    { texto: "A", palo: "♥" }
  ]);
  await page.evaluate(() => {
    const msg = document.getElementById("mensaje-mesa");
    if (msg) msg.textContent = "Preflop · a hablar.";
  });
  await page.screenshot({ path: OUT + "/v4-iphone-mesa.png", fullPage: false });
  const box = await page.locator(".pieza-cartas.propio").boundingBox();
  if (!box) throw new Error("no hay caja de cartas propias para el recorte");
  const pad = 18;
  const vw = page.viewportSize();
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: Math.min(vw.width - Math.max(0, box.x - pad), box.width + pad * 2),
    height: Math.min(vw.height - Math.max(0, box.y - pad), box.height + pad * 2)
  };
  await page.screenshot({ path: OUT + "/v4-cartas-cerca.png", clip: clip, fullPage: false });
  console.log("SHOT v4-iphone-mesa.png y v4-cartas-cerca.png", clip);
  await context.close();
  await browser.close();
  console.log("==== CARTAS " + ok + " ok, fallos=" + fallos + " ====");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
