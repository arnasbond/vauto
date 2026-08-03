#!/usr/bin/env node
/**
 * Soft-launch catalog seed — DISABLED for live VAUTO.
 *
 * This script previously inserted Unsplash demo listings into production and
 * polluted the real catalog. It now refuses to run against any live host.
 *
 * Local/dev only when ALL of:
 *   VAUTO_ALLOW_LIVE_SEED=1
 *   VAUTO_API_URL points to localhost / 127.0.0.1
 */
const API = (
  process.env.VAUTO_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://vauto-api.onrender.com"
).replace(/\/$/, "");

const allow =
  String(process.env.VAUTO_ALLOW_LIVE_SEED || "").trim() === "1";
const isLocal = /localhost|127\.0\.0\.1/i.test(API);

console.error(
  [
    "REFUSED: soft-launch Unsplash catalog seeding is disabled.",
    `target=${API}`,
    "Use real user uploads only. To seed a local API explicitly set:",
    "  VAUTO_ALLOW_LIVE_SEED=1 VAUTO_API_URL=http://127.0.0.1:4000",
  ].join("\n")
);

if (!allow || !isLocal) {
  process.exit(1);
}

console.error("Local seed path is intentionally empty — no Unsplash rows.");
process.exit(1);
