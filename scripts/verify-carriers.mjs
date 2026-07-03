#!/usr/bin/env node
/**
 * Carrier readiness probe — reports per-provider status without requiring live keys.
 *
 * Usage:
 *   node scripts/verify-carriers.mjs [baseUrl]
 *   node scripts/verify-carriers.mjs --local
 *   node scripts/verify-carriers.mjs --strict
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const localProbe = process.argv.includes("--local");
const strict = process.argv.includes("--strict") || process.env.CARRIER_STRICT === "1";

const base =
  args[0]?.replace(/\/$/, "") ||
  process.env.VAUTO_API_URL?.replace(/\/$/, "") ||
  "https://vauto-api.onrender.com";

function formatProvider(p) {
  const parts = [
    `${p.providerId}: ${p.status}`,
    `mode=${p.mode}`,
    p.keyConfigured ? "key=yes" : "key=no",
  ];
  if (p.note) parts.push(`(${p.note})`);
  return parts.join(" | ");
}

async function checkRemote() {
  const url = `${base}/api/health`;
  console.log(`Checking carriers via ${url} ...`);

  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.ok) {
    console.error("Health check FAILED:", res.status, body);
    process.exit(1);
  }

  const carriers = body.infra?.shippingCarriers;
  if (!Array.isArray(carriers) || carriers.length === 0) {
    console.error("shippingCarriers block missing from /api/health infra");
    process.exit(1);
  }

  let failed = false;
  for (const p of carriers) {
    console.log(formatProvider(p));
    if (strict && p.keyConfigured && p.mode !== "live") {
      console.error(`Strict: ${p.providerId} has key but mode is not live`);
      failed = true;
    }
  }

  console.log(
    `shippingCarrierLive: ${body.infra?.shippingCarrierLive ?? false} (${body.infra?.shippingCarrierProvider ?? "unknown"})`
  );

  if (failed) process.exit(1);
  console.log("Carrier readiness check OK (remote)");
}

function checkLocal() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  console.log("Running local carrier adapter probe (requires server build)...");

  const build = spawnSync("npm", ["run", "build"], {
    cwd: join(root, "server"),
    stdio: "inherit",
    shell: true,
  });
  if (build.status !== 0) process.exit(build.status ?? 1);

  return import(
    pathToFileURL(join(root, "server", "dist", "shipping", "carrier-readiness.js")).href
  ).then(
    async (mod) => {
      const providers = ["omniva", "dpd", "lp_express"];
      let failed = false;
      for (const id of providers) {
        const result = await mod.probeCarrierAdapter(id);
        console.log(formatProvider(result.readiness));
        console.log(
          `  probe: ok=${result.ok} label=${result.label.id || "(empty)"} mode=${result.label.mode}`
        );
        if (!result.ok) failed = true;
      }
      if (failed) {
        console.error("Local carrier probe FAILED");
        process.exit(1);
      }
      console.log("Carrier readiness check OK (local)");
    }
  );
}

async function main() {
  if (localProbe) {
    await checkLocal();
    return;
  }
  await checkRemote();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
