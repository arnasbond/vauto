#!/usr/bin/env node
/** Smoke test live API readiness — exit 1 if score < 100. */
const URL = process.env.VAUTO_API_URL ?? "https://vauto-api.onrender.com/api/health";

const res = await fetch(URL);
if (!res.ok) {
  console.error(`Health HTTP ${res.status}`);
  process.exit(1);
}

const health = await res.json();
console.log(JSON.stringify(health, null, 2));

if (!health.ok || health.db !== "connected") {
  console.error("API not healthy");
  process.exit(1);
}

const score = health.readiness?.score ?? 0;
if (score < 100) {
  console.error(`Readiness ${score}/100 (expected 100)`);
  process.exit(1);
}

console.log(`OK — readiness ${score}/100`);
