#!/usr/bin/env node
/**
 * Post-deploy health check — verifies Render API is reachable and reports feature flags.
 *
 * Usage:
 *   node scripts/verify-health.mjs [baseUrl]
 *   node scripts/verify-health.mjs --strict-readiness
 *   STRICT_READINESS=1 node scripts/verify-health.mjs
 */
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const strictReadiness =
  process.argv.includes("--strict-readiness") ||
  process.env.STRICT_READINESS === "1";
const strictAnalyzeSearch =
  process.argv.includes("--strict-analyze-search") ||
  process.env.STRICT_ANALYZE_SEARCH === "1";

const base =
  args[0]?.replace(/\/$/, "") ||
  process.env.VAUTO_API_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "https://vauto-api.onrender.com";

async function main() {
  const url = `${base}/api/health`;
  console.log(`Checking ${url} ...`);

  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.ok) {
    console.error("Health check FAILED:", res.status, body);
    process.exit(1);
  }

  console.log("OK — service:", body.service);
  console.log("DB:", body.db ?? "unknown");

  if (body.features) {
    console.log("Features:", JSON.stringify(body.features, null, 2));
    const optionalOff = Object.entries(body.features)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (optionalOff.length && !strictReadiness) {
      console.warn("Optional features not configured:", optionalOff.join(", "));
    }
  }

  if (body.embeddings) {
    console.log("Embeddings:", JSON.stringify(body.embeddings));
  }

  if (body.readiness) {
    console.log("Readiness:", JSON.stringify(body.readiness));
    if (strictReadiness && body.readiness.score < 100) {
      console.error(`Readiness ${body.readiness.score}/100 (expected 100)`);
      process.exit(1);
    }
  } else if (strictReadiness) {
    console.error("Readiness block missing from /api/health");
    process.exit(1);
  }

  if (strictReadiness) {
    console.log(`Strict check passed — readiness ${body.readiness?.score ?? "?"}/100`);
  }

  await checkAiEndpoints(base);
  const analyzeOk = await checkAnalyzeSearch(base);
  if (strictAnalyzeSearch && !analyzeOk) {
    console.error("analyze-search check FAILED (strict mode)");
    process.exit(1);
  }
}

async function checkAnalyzeSearch(base) {
  const url = `${base}/api/ai/analyze-search`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "kas parduoda rubus", userCity: "Vilnius" }),
      signal: AbortSignal.timeout(45_000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.cleanQuery) {
      console.log(`analyze-search OK: category=${body.category} cleanQuery=${body.cleanQuery}`);
      return true;
    }
    console.warn(`analyze-search: HTTP ${res.status}`, JSON.stringify(body).slice(0, 200));
    return false;
  } catch (e) {
    console.warn("analyze-search unreachable:", e.message ?? e);
    return false;
  }
}

async function checkAiEndpoints(base) {
  const checks = [
    { path: "/api/ai/health", expectOk: true },
    { path: "/api/vauto-server", method: "POST", body: {}, expectStatus: 400 },
    { path: "/api/vauto-agent", method: "POST", body: {}, expectStatus: 400 },
  ];

  for (const c of checks) {
    const url = `${base}${c.path}`;
    try {
      const res = await fetch(url, {
        method: c.method ?? "GET",
        headers: c.body ? { "Content-Type": "application/json" } : undefined,
        body: c.body ? JSON.stringify(c.body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      const status = res.status;
      if (c.expectStatus && status !== c.expectStatus) {
        console.warn(`AI route ${c.path}: expected HTTP ${c.expectStatus}, got ${status}`);
        continue;
      }
      if (c.expectOk && !res.ok) {
        console.warn(`AI route ${c.path}: HTTP ${status}`);
        continue;
      }
      if (c.path.endsWith("/health")) {
        const ai = await res.json().catch(() => ({}));
        const geminiLive =
          ai.gemini === true ||
          ai.provider === "gemini" ||
          (ai.mode === "gemini" && ai.openai === true);
        console.log(
          `AI health (${c.path}):`,
          JSON.stringify(ai),
          geminiLive ? "→ Gemini LIVE" : "→ Demo/fallback"
        );
      } else {
        console.log(`AI route ${c.path}: HTTP ${status} (reachable)`);
      }
    } catch (e) {
      console.warn(`AI route ${c.path} unreachable:`, e.message ?? e);
    }
  }

  await smokeTestVautoAgent(base);
}

async function smokeTestVautoAgent(base) {
  const url = `${base}/api/vauto-agent`;
  const body = {
    messages: [{ role: "user", text: "Sveiki" }],
    context: {
      userCity: "Vilnius",
      userRole: "buyer",
      contact: "+37060000000",
      listings: [],
    },
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    const payload = await res.json().catch(() => ({}));
    if (res.ok && payload?.reply) {
      console.log("vauto-agent smoke: OK");
      return;
    }
    console.warn(
      `vauto-agent smoke: HTTP ${res.status}`,
      payload?.error || payload?.code || ""
    );
  } catch (e) {
    console.warn("vauto-agent smoke failed:", e.message ?? e);
  }
}

main().catch((e) => {
  console.error("Health check error:", e);
  process.exit(1);
});
