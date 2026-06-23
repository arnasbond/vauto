#!/usr/bin/env node
/**
 * Ensure required Render env vars for vauto-api and trigger redeploy.
 *
 * Usage:
 *   RENDER_API_KEY=rnd_xxx node scripts/configure-render-env.mjs
 *
 * Optional (only set when provided):
 *   JWT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 */
import { randomBytes } from "node:crypto";

const API = "https://api.render.com/v1";
const KEY = process.env.RENDER_API_KEY;
const SERVICE_ID =
  process.env.RENDER_SERVICE_ID || "srv-d8q3fk6q1p3s739fd9h0";

if (!KEY) {
  console.error("Missing RENDER_API_KEY");
  process.exit(1);
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" && body?.message
        ? body.message
        : text || res.statusText;
    throw new Error(`${opts.method || "GET"} ${path} → ${res.status}: ${msg}`);
  }
  return body;
}

async function listEnvVars() {
  const rows = await api(`/services/${SERVICE_ID}/env-vars`);
  const map = new Map();
  for (const row of rows) {
    const ev = row.envVar || row;
    if (ev?.key) map.set(ev.key, ev.value ?? "");
  }
  return map;
}

async function upsertEnv(key, value) {
  await api(`/services/${SERVICE_ID}/env-vars`, {
    method: "PUT",
    body: JSON.stringify([{ key, value }]),
  });
  console.log(`✓ ${key}`);
}

function generateJwtSecret() {
  return randomBytes(48).toString("base64url");
}

async function main() {
  console.log(`Configuring env on service ${SERVICE_ID}…`);
  const existing = await listEnvVars();

  const jwt =
    process.env.JWT_SECRET?.trim() ||
    (existing.get("JWT_SECRET")?.trim() &&
    existing.get("JWT_SECRET") !== "vauto-dev-secret-change-in-production"
      ? existing.get("JWT_SECRET")
      : generateJwtSecret());

  await upsertEnv("JWT_SECRET", jwt);
  await upsertEnv("STRIPE_AUTO_WEBHOOK", "1");
  await upsertEnv("PUBLIC_API_URL", "https://vauto-api.onrender.com");
  await upsertEnv("APP_ORIGIN", "https://vauto-chi.vercel.app");

  for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) {
    const val = process.env[key]?.trim();
    if (val) await upsertEnv(key, val);
  }

  const deploy = await api(`/services/${SERVICE_ID}/deploys`, {
    method: "POST",
    body: JSON.stringify({ clearCache: "do_not_clear" }),
  });
  const d = deploy.deploy || deploy;
  console.log(`✓ Deploy triggered: ${d.id} (${d.status})`);
  console.log("Check: https://vauto-api.onrender.com/api/health");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
