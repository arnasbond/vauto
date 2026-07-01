#!/usr/bin/env node
/**
 * Etapas D — production soak probe (daily cron / manual).
 *
 * Checks live frontend runtime-config, version manifest, and API health.
 *
 * Env:
 *   VAUTO_PROD_URL — default https://vauto-chi.vercel.app
 *   EXPECT_CONDUCTOR_ENABLED — "true" (default during soak) or "false" (post kill-switch)
 */
const prodUrl = (process.env.VAUTO_PROD_URL || "https://vauto-chi.vercel.app").replace(
  /\/$/,
  ""
);
const expectConductor =
  (process.env.EXPECT_CONDUCTOR_ENABLED ?? "true").toLowerCase() !== "false";

async function fetchJson(path, timeoutMs = 60_000) {
  const url = `${prodUrl}${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${path} HTTP ${res.status}`);
  }
  if (!body || typeof body !== "object") {
    throw new Error(`${path} invalid JSON`);
  }
  return body;
}

async function checkApiHealth(apiUrl) {
  const base = apiUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api/health`, {
    signal: AbortSignal.timeout(90_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(`API health failed: ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
  }
  return body;
}

async function main() {
  console.log(`Production soak probe — ${prodUrl}`);
  console.log(`Expect conductorEnabled=${expectConductor}`);

  const runtime = await fetchJson("/runtime-config.json");
  if (!runtime.apiUrl || typeof runtime.apiUrl !== "string") {
    throw new Error("runtime-config.json missing apiUrl");
  }
  console.log("OK runtime-config.apiUrl:", runtime.apiUrl);

  if (typeof runtime.conductorEnabled !== "boolean") {
    throw new Error("runtime-config.json missing conductorEnabled boolean");
  }
  if (runtime.conductorEnabled !== expectConductor) {
    throw new Error(
      `conductorEnabled=${runtime.conductorEnabled} (expected ${expectConductor})`
    );
  }
  console.log("OK runtime-config.conductorEnabled:", runtime.conductorEnabled);

  const version = await fetchJson("/version-config.json");
  if (!version.latestVersion) {
    throw new Error("version-config.json missing latestVersion");
  }
  console.log("OK version-config.latestVersion:", version.latestVersion);

  const health = await checkApiHealth(runtime.apiUrl);
  console.log("OK API health:", health.service, "db:", health.db ?? "unknown");
  if (health.readiness) {
    console.log("Readiness:", health.readiness.score, "/100");
  }

  console.log("Production soak probe passed.");
}

main().catch((e) => {
  console.error("Production soak probe FAILED:", e.message ?? e);
  process.exit(1);
});
