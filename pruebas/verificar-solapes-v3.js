"use strict";
const { chromium } = require("/tmp/pw/node_modules/playwright-core");

const BASE = process.env.BASE || "http://127.0.0.1:3456";
const OUT = process.env.OUT || "/workspace/poker-mesa";

const VIEWPORTS = [
  { name: "1024x550", w: 1024, h: 550 },
  { name: "1024x600", w: 1024, h: 600 },
  { name: "1280x600", w: 1280, h: 600 },
  { name: "1280x720", w: 1280, h: 720 },
  { name: "1366x650", w: 1366, h: 650 },
  { name: "1440x800", w: 1440, h: 800 },
  { name: "1920x950", w: 1920, h: 950 },
  { name: "800x500", w: 800, h: 500 },
  { name: "zoom125", w: Math.round(1024 / 1.25), h: Math.round(550 / 1.25) },
  { name: "zoom150", w: Math.round(1024 / 1.5), h: Math.round(550 / 1.5) }
];

const PHONES = [
  { name: "iPhone390", w: 390, h: 844 },
  { name: "iPhone430", w: 430, h: 932 },
  { name: "Pixel360", w: 360, h: 800 },
  { name: "land844x390", w: 844, h: 390 },
  { name: "land667x375", w: 667, h: 375 }
];

const FASES = [
  { fase: "preflop", todasApuestas: true, forzarAcciones: true, tag: "preflop-apuestas" },
  { fase: "river", forzarAcciones: true, tag: "river" },
  { fase: "showdown", tag: "showdown" }
];

async function medir(page) {
  return page.evaluate(() => {
    if (window.__RF && window.__RF.ui && window.__RF.ui.estado && window.__RF.aplicarLayout) {
      window.__RF.aplicarLayout(window.__RF.ui.estado);
    }
    return window.__RF.medirSolapes();
  });
}

async function montar(page, asientos, faseOpt) {
  await page.evaluate(({ asientos, faseOpt }) => {
    window.__RF.montarDemo({
      asientos: asientos,
      fase: faseOpt.fase,
      todasApuestas: !!faseOpt.todasApuestas,
      forzarAcciones: !!faseOpt.forzarAcciones,
      nombresLargos: false
    });
  }, { asientos, faseOpt });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    if (window.__RF && window.__RF.ui && window.__RF.ui.estado) {
      window.__RF.aplicarLayout(window.__RF.ui.estado);
    }
  });
  await page.waitForTimeout(80);
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const fallos = [];
  let casos = 0;
  let ok = 0;

  async function correr(list, asientosList) {
    for (const vp of list) {
      const context = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        deviceScaleFactor: 1
      });
      const page = await context.newPage();
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      for (const n of asientosList) {
        for (const fase of FASES) {
          casos++;
          const label = `${vp.name} ${vp.w}x${vp.h} ${n}as ${fase.tag}`;
          try {
            await montar(page, n, fase);
            const r = await medir(page);
            const problems = [];
            if (r.overlaps && r.overlaps.length) problems.push("solapes: " + r.overlaps.join(" | "));
            if (r.fuera && r.fuera.length) problems.push("fuera: " + r.fuera.join(", "));
            if (r.overflowX) problems.push("overflowX " + r.sw + ">" + r.iw);
            if (r.overflowY) problems.push("overflowY " + r.sh + ">" + r.ih);
            if (problems.length) {
              fallos.push({ label, problems, r });
              console.log("FALLO " + label);
              problems.forEach((p) => console.log("  " + p));
            } else {
              ok++;
              console.log("OK    " + label + " items=" + r.nItems);
            }
          } catch (e) {
            fallos.push({ label, problems: [String(e)] });
            console.log("ERROR " + label + " " + e);
          }
        }
      }
      await context.close();
    }
  }

  console.log("=== ESCRITORIO / HORIZONTAL ===");
  await correr(VIEWPORTS, [9, 10]);
  console.log("=== TELEFONOS ===");
  await correr(PHONES, [9, 10]);

  // screenshots
  async function foto(name, w, h, asientos, faseOpt) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await montar(page, asientos, faseOpt);
    await page.screenshot({ path: OUT + "/" + name, fullPage: false });
    console.log("SHOT " + name);
    await context.close();
  }
  await foto("v3-compu-1024x550.png", 1024, 550, 10, { fase: "preflop", todasApuestas: true, forzarAcciones: true });
  await foto("v3-compu-1366.png", 1366, 650, 9, { fase: "river", forzarAcciones: true });
  await foto("v3-compu-10asientos.png", 1440, 800, 10, { fase: "preflop", todasApuestas: true, forzarAcciones: true });

  await browser.close();
  console.log("\n==== RESUMEN " + ok + "/" + casos + " ok, fallos=" + fallos.length + " ====");
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
