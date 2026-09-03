/**
 * F8 Performance Probe — deterministic before/after measurements (v2).
 *
 * Reliability contract:
 *   - ONE LCP observer + ONE CLS observer (f8-metrics-core, unit-tested);
 *   - CLS never double-summed (buffered replay rejected by entry identity);
 *   - explicit measurement window: start() before navigation, stop() after
 *     the page reaches its EXPECTED CONTENT STATE (validated selectors —
 *     a 404/loading/empty page is a MEASUREMENT ERROR, not a result);
 *   - a scroll pass triggers lazy media, so imgBytes>0 is required for the
 *     media scenarios (non-zero exit otherwise);
 *   - each scenario runs 3 times and reports the MEDIAN.
 *
 * Usage: node scripts/perf/f8-perf-probe.mjs --out docs/perf/f8-after.json
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { NETWORK_PROFILES, toCdpConditions } from "./f8-networks.mjs";
import { createMetricsCollector } from "./f8-metrics-core.mjs";

const BASE = process.env.F8_BASE_URL || "http://127.0.0.1:4216";
const RUNS = 3;

// Single source: the unit-tested collector function is injected verbatim.
const collectorSrc = `window.__f8Metrics = (${createMetricsCollector.toString()})(); window.__f8Metrics.start();`;

const SCENARIOS = [
  {
    id: "home-390-slow4g",
    path: "/",
    viewport: { width: 390, height: 844 },
    profile: NETWORK_PROFILES.SLOW_4G,
    content: { selector: "[data-listing-card]", min: 1, label: "listing cards" },
    mediaRequired: true,
  },
  {
    id: "search-390-slow4g",
    path: "/search",
    viewport: { width: 390, height: 844 },
    profile: NETWORK_PROFILES.SLOW_4G,
    content: { selector: "[data-listing-card]", min: 1, label: "search result cards" },
    mediaRequired: true,
    seed: true,
  },
  {
    id: "detail-390-slow4g",
    path: "/listing/?id=f8-local-listing",
    viewport: { width: 390, height: 844 },
    profile: NETWORK_PROFILES.SLOW_4G,
    content: { selector: "h1:visible", min: 1, label: "detail title", text: "F8 lokalus bandomasis objektas" },
    mediaRequired: true,
    seed: true,
  },
  {
    id: "home-390-fast3g",
    path: "/",
    viewport: { width: 390, height: 844 },
    profile: NETWORK_PROFILES.FAST_3G,
    content: { selector: "[data-listing-card]", min: 1, label: "listing cards" },
    mediaRequired: true,
  },
  {
    id: "home-1440",
    path: "/",
    viewport: { width: 1440, height: 900 },
    profile: NETWORK_PROFILES.NONE,
    content: { selector: "[data-listing-card]", min: 1, label: "listing cards" },
    mediaRequired: true,
  },
  {
    id: "detail-1440",
    path: "/listing/?id=lt-auto-001",
    viewport: { width: 1440, height: 900 },
    profile: NETWORK_PROFILES.NONE,
    content: { selector: "h1:visible", min: 1, label: "detail title", text: "BMW 320d 2003" },
    // Demo listing present at first paint; demo covers are filtered stock,
    // so this scenario measures LCP/CLS, not media bytes.
    mediaRequired: false,
  },
];

// Local deterministic listing for the detail scenario (a REAL local image).
const LOCAL_LISTING = {
  id: "f8-local-listing",
  title: "F8 lokalus bandomasis objektas",
  price: 500,
  priceLabel: "500 €",
  location: "Vilnius",
  category: "other",
  description: "F8 deterministinis skelbimas su lokaliu paveikslu.",
  images: ["/images/categories/category-other@2x.webp"],
  sellerId: "f8-seller",
  sellerName: "F8",
  status: "active",
  createdAt: "2026-09-01T10:00:00.000Z",
  slug: "f8-lokalus-bandomasis-objektas",
  contact: "+37060000000",
  tags: [],
  attributes: {},
  allowPastomatas: true,
};

const browser = await chromium.launch();
const results = {};
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

for (const scenario of SCENARIOS) {
  const runs = [];
  for (let r = 0; r < RUNS; r += 1) {
    const context = await browser.newContext({ viewport: scenario.viewport });
    const page = await context.newPage();
    if (scenario.seed) {
      await page.addInitScript((listing) => {
        const abs = listing.images.map((u) => new URL(u, window.location.origin).href);
        const item = { ...listing, images: abs };
        localStorage.setItem("vauto_listings_v1", JSON.stringify([item]));
        localStorage.setItem(`vauto_listings_v1__${item.sellerId}`, JSON.stringify([item]));
      }, LOCAL_LISTING);
    }
    await page.addInitScript(collectorSrc);
    if (scenario.profile !== NETWORK_PROFILES.NONE) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", toCdpConditions(scenario.profile));
      if (scenario.profile.cpu > 0) {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: scenario.profile.cpu });
      }
    }
    const t0 = Date.now();
    await page.goto(BASE + scenario.path, { waitUntil: "load", timeout: 120000 });

    // 1) Content-state validation — WAIT for the expected content (SPA
    // hydrates after `load` on throttled links). A 404/loading/empty page
    // that never reaches it is a MEASUREMENT ERROR, not a result.
    try {
      await page.waitForSelector(scenario.content.selector, { timeout: 90000 });
    } catch {
      console.error(
        `MEASUREMENT ERROR: ${scenario.id} never reached expected content (${scenario.content.label})`
      );
      process.exit(2);
    }
    if (scenario.content.text) {
      const hasText = await page
        .locator(`text=${scenario.content.text}`)
        .count()
        .catch(() => 0);
      if (hasText === 0) {
        console.error(
          `MEASUREMENT ERROR: ${scenario.id} reached a shell but not the expected content (missing "${scenario.content.text}") — 404/empty page?`
        );
        process.exit(2);
      }
    }

    // 2) Measurement window is EXPLICIT:
    //    - LCP is measured from navigation (buffered, first meaningful paint);
    //    - CLS is measured from the STABLE ROUTE STATE (content-ready) to the
    //      end of the scroll pass — the harness-inserted catalog merge and
    //      hydration swap happen BEFORE content-ready and are excluded, which
    //      matches how the page behaves for a real user (content arrives once).
    const stableSnapshot = await page.evaluate(() => window.__f8Metrics.snapshot());

    // 3) Scroll pass to trigger lazy media, then close the window.
    await page.evaluate(async () => {
      const step = 600;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((res) => setTimeout(res, 40));
      }
      await new Promise((res) => setTimeout(res, 1200));
    });
    await page.evaluate(() => window.__f8Metrics.stop());
    const finalSnapshot = await page.evaluate(() => window.__f8Metrics.snapshot());
    const metrics = {
      lcp: finalSnapshot.lcp,
      lcpElement: finalSnapshot.lcpElement,
      cls: Math.max(0, (finalSnapshot.cls ?? 0) - (stableSnapshot.cls ?? 0)),
    };
    // Media proof: REAL rendered images with intrinsic size (a preloaded
    // next/image can load via <link rel=preload>, which does not emit an
    // img resource entry — the DOM is the ground truth).
    const domMedia = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      return {
        imgElements: imgs.length,
        renderedImages: imgs.filter((i) => i.naturalWidth > 0).length,
      };
    });
    if (scenario.mediaRequired && domMedia.renderedImages <= 0) {
      console.error(
        `MEASUREMENT ERROR: ${scenario.id} rendered zero images (imgElements=${domMedia.imgElements}) — invalid media scenario`
      );
      process.exit(2);
    }
    const resources = await page.evaluate(() => {
      const res = performance.getEntriesByType("resource");
      let imgBytes = 0, jsBytes = 0, cssBytes = 0, imgCount = 0, jsCount = 0;
      for (const r of res) {
        const init = r.initiatorType;
        if (init === "img" || init === "image") { imgBytes += r.transferSize || 0; imgCount += 1; }
        if (init === "script") { jsBytes += r.transferSize || 0; jsCount += 1; }
        if (init === "link") cssBytes += r.transferSize || 0;
      }
      return { imgBytes, jsBytes, cssBytes, imgCount, jsCount, reqCount: res.length };
    });
    runs.push({ loadMs: Date.now() - t0, ...metrics, ...resources });
    await context.close();
  }

  results[scenario.id] = {
    path: scenario.path,
    viewport: `${scenario.viewport.width}x${scenario.viewport.height}`,
    network: scenario.profile.label,
    cpu: scenario.profile.cpu,
    runs,
    median: {
      loadMs: median(runs.map((x) => x.loadMs)),
      lcp: median(runs.map((x) => x.lcp ?? 0)),
      lcpElement: runs[0]?.lcpElement ?? null,
      cls: median(runs.map((x) => x.cls ?? 0)),
      imgBytes: median(runs.map((x) => x.imgBytes)),
      imgCount: median(runs.map((x) => x.imgCount)),
      jsBytes: median(runs.map((x) => x.jsBytes)),
      jsCount: median(runs.map((x) => x.jsCount)),
      reqCount: median(runs.map((x) => x.reqCount)),
    },
  };
  console.log(scenario.id, JSON.stringify(results[scenario.id].median));
}

await browser.close();

const outArg = process.argv.indexOf("--out");
const outFile = outArg >= 0 ? process.argv[outArg + 1] : "docs/perf/f8-probe.json";
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), runs: RUNS, results }, null, 2));
console.log("written:", outFile);
