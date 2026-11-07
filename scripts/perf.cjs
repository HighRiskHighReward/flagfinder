/**
 * Lab measurement of LCP, CLS and INP (approx.) under mobile throttling with Chromium CDP:
 * Pixel 7 viewport, 4x CPU slowdown, ~1.6 Mbps down / 750 Kbps up / 150 ms RTT ("Slow 4G"-like).
 * Usage: node scripts/perf.cjs http://localhost:3000   (against a production build)
 * Writes artifacts/perf.json. These are lab numbers on this machine, not field data.
 */
const { chromium, devices } = require("playwright");
const fs = require("fs");
const base = process.argv[2] || "http://localhost:3000";
const RUNS = 3;

async function measure(browser, path, interact) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    window.__lcp = 0; window.__cls = 0; window.__inp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) window.__inp = Math.max(window.__inp, e.duration); }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  });
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  if (interact) { await interact(page); await page.waitForTimeout(1500); }
  const m = await page.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls, inp: window.__inp }));
  await ctx.close();
  return m;
}

(async () => {
  const browser = await chromium.launch();
  const pages = [
    { name: "home (results list, mobile)", path: "/", interact: async (p) => { await p.getByTestId("chip-girls").click(); } },
    { name: "results: girls 10-12 near Plano", path: "/?region=plano&gender=girls&ageMin=10&ageMax=12", interact: async (p) => { await p.getByTestId("view-map").click(); } },
  ];
  const out = { conditions: "Playwright Chromium, Pixel 7 emulation, CPU 4x slowdown, 150 ms RTT, 1.6 Mbps down / 750 Kbps up, production build (next start), local Postgres, synthetic demo data, median of " + RUNS + " runs", measuredAt: new Date().toISOString(), results: [] };
  // resolve an event page path
  const ctx = await browser.newContext(); const p = await ctx.newPage(); await p.goto(base + "/");
  const href = await p.locator("[data-testid=result-list] [data-testid=result-card] h2 a").first().getAttribute("href"); await ctx.close();
  pages.push({ name: "event page", path: href, interact: null });
  for (const pg of pages) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await measure(browser, pg.path, pg.interact));
    const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(RUNS / 2)];
    const r = { page: pg.name, lcpMs: Math.round(med("lcp")), cls: Number(med("cls").toFixed(3)), inpMs: pg.interact ? Math.round(med("inp")) : null, runs };
    out.results.push(r);
    console.log(`${r.page}: LCP ${r.lcpMs} ms · CLS ${r.cls} · INP≈ ${r.inpMs ?? "n/a"} ms`);
  }
  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync("artifacts/perf.json", JSON.stringify(out, null, 2));
  await browser.close();
})();
