/**
 * F8 Performance Probe — deterministic before/after measurements.
 *
 * Uses the static e2e build (offline catalog, deterministic content) +
 * Playwright/CDP: Slow 4G + 4x CPU throttling for mobile, none for desktop.
 * Collects: LCP, CLS, image bytes/requests, JS bytes/requests, total
 * duration, and resource counts via PerformanceObserver + resource timing.
 *
 * Usage:
 *   node scripts/perf/f8-perf-probe.mjs --out docs/perf/f8-baseline.json
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.F8_BASE_URL || "http://127.0.0.1:4216";

const SLOW4G = { offline: false, latency: 400, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 };
const FAST3G = { offline: false, latency: 562, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 };

const SCENARIOS = [
  { id: "home-390-slow4g", path: "/", viewport: { width: 390, height: 844 }, network: SLOW4G, cpu: 4 },
  { id: "search-390-slow4g", path: "/search", viewport: { width: 390, height: 844 }, network: SLOW4G, cpu: 4 },
  { id: "detail-390-slow4g", path: "/listing/?id=lt-auto-001", viewport: { width: 390, height: 844 }, network: SLOW4G, cpu: 4 },
  { id: "home-390-fast3g", path: "/", viewport: { width: 390, height: 844 }, network: FAST3G, cpu: 4 },
  { id: "home-1440", path: "/", viewport: { width: 1440, height: 900 }, network: null, cpu: 0 },
  { id: "detail-1440", path: "/listing/?id=lt-auto-001", viewport: { width: 1440, height: 900 }, network: null, cpu: 0 },
];

const metricsScript = `
window.__f8 = { entries: [] };
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.entryType === "largest-contentful-paint") window.__f8.lcp = e.startTime;
      if (e.entryType === "layout-shift" && !e.hadRecentInput) window.__f8.cls = (window.__f8.cls || 0) + e.value;
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__f8.lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  const shifts = performance.getEntriesByType("layout-shift");
  window.__f8.cls = shifts.filter((s) => !s.hadRecentInput).reduce((a, s) => a + s.value, 0);
  new PerformanceObserver((list) => { for (const e of list.getEntries()) { if (!e.hadRecentInput) window.__f8.cls = (window.__f8.cls || 0) + e.value; } }).observe({ type: "layout-shift", buffered: true });
} catch (e) {}
`;

const browser = await chromium.launch();
const results = {};

for (const scenario of SCENARIOS) {
  const context = await browser.newContext({ viewport: scenario.viewport });
  const page = await context.newPage();
  if (scenario.network) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", scenario.network);
    if (scenario.cpu > 0) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: scenario.cpu });
    }
  }
  await page.addInitScript(metricsScript);
  const t0 = Date.now();
  await page.goto(BASE + scenario.path, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(4500); // let LCP settle

  const metrics = await page.evaluate(() => ({
    lcp: window.__f8?.lcp ?? null,
    cls: window.__f8?.cls ?? null,
  }));
  const resources = await page.evaluate(() => {
    const res = performance.getEntriesByType("resource");
    let imgBytes = 0, jsBytes = 0, cssBytes = 0, imgCount = 0, jsCount = 0, reqCount = res.length;
    for (const r of res) {
      const init = r.initiatorType;
      if (init === "img" || init === "image") { imgBytes += r.transferSize || 0; imgCount += 1; }
      if (init === "script") { jsBytes += r.transferSize || 0; jsCount += 1; }
      if (init === "link") { cssBytes += r.transferSize || 0; }
    }
    return { imgBytes, jsBytes, cssBytes, imgCount, jsCount, reqCount };
  });
  results[scenario.id] = {
    path: scenario.path,
    viewport: `${scenario.viewport.width}x${scenario.viewport.height}`,
    network: scenario.network ? (scenario.network.latency === 400 ? "slow-4g" : "fast-3g") : "none",
    cpu: scenario.cpu,
    loadMs: Date.now() - t0,
    ...metrics,
    ...resources,
  };
  console.log(scenario.id, JSON.stringify(results[scenario.id]));
  await context.close();
}

await browser.close();

const outArg = process.argv.indexOf("--out");
const outFile = outArg >= 0 ? process.argv[outArg + 1] : "docs/perf/f8-probe.json";
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
console.log("written:", outFile);
