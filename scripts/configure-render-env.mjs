#!/usr/bin/env node
/**
 * Ensure required Render env vars for vauto-api and trigger redeploy.
 * Uses per-key PUT so existing vars (e.g. DATABASE_URL) are not wiped.
 *
 * Usage:
 *   RENDER_API_KEY=rnd_xxx node scripts/configure-render-env.mjs
 */
import { randomBytes } from "node:crypto";

const API = "https://api.render.com/v1";
const KEY = process.env.RENDER_API_KEY;
const SERVICE_ID =
  process.env.RENDER_SERVICE_ID || "srv-d8q3fk6q1p3s739fd9h0";
const DB_NAME = process.env.RENDER_DB_NAME || "vauto-db";

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

function unwrap(row) {
  return row?.envVar || row?.postgres || row?.owner || row?.service || row;
}

async function list(path) {
  const out = [];
  let cursor;
  do {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const page = await api(`${path}${q}`);
    if (Array.isArray(page)) out.push(...page);
    else if (page?.items) out.push(...page.items);
    cursor = page?.cursor;
  } while (cursor);
  return out;
}

async function listEnvVars() {
  const rows = await list(`/services/${SERVICE_ID}/env-vars`);
  const map = new Map();
  for (const row of rows) {
    const ev = unwrap(row);
    if (ev?.key) map.set(ev.key, ev.value ?? "");
  }
  return map;
}

async function setEnvVar(key, value) {
  await api(
    `/services/${SERVICE_ID}/env-vars/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      body: JSON.stringify({ value }),
    }
  );
  console.log(`✓ ${key}`);
}

function generateJwtSecret() {
  return randomBytes(48).toString("base64url");
}

async function restoreDatabaseUrl(existing) {
  if (existing.get("DATABASE_URL")?.trim()) return;

  const owners = await list("/owners");
  if (!owners.length) throw new Error("No Render workspace found");

  const ownerId = unwrap(owners[0]).id;
  const dbs = await list(`/postgres?ownerId=${ownerId}`);
  const db = dbs.map(unwrap).find((p) => p.name === DB_NAME);
  if (!db) throw new Error(`Postgres ${DB_NAME} not found`);

  const info = await api(`/postgres/${db.id}/connection-info`);
  const url = info.connectionString || info.internalConnectionString;
  if (!url) throw new Error("Could not fetch DATABASE_URL from Render Postgres");

  await setEnvVar("DATABASE_URL", url);
}

async function main() {
  console.log(`Configuring env on service ${SERVICE_ID}…`);
  const existing = await listEnvVars();
  console.log(`Current env keys: ${[...existing.keys()].join(", ") || "(none)"}`);

  await restoreDatabaseUrl(existing);

  const jwt =
    process.env.JWT_SECRET?.trim() ||
    (existing.get("JWT_SECRET")?.trim() &&
    existing.get("JWT_SECRET") !== "vauto-dev-secret-change-in-production"
      ? existing.get("JWT_SECRET")
      : generateJwtSecret());

  await setEnvVar("JWT_SECRET", jwt);

  if (!existing.get("PORT")?.trim()) {
    await setEnvVar("PORT", "4000");
  }

  await setEnvVar("STRIPE_AUTO_WEBHOOK", "1");
  await setEnvVar("PUBLIC_API_URL", "https://vauto-api.onrender.com");
  await setEnvVar("APP_ORIGIN", "https://vauto-chi.vercel.app");

  for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) {
    const val = process.env[key]?.trim();
    if (val) await setEnvVar(key, val);
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
