#!/usr/bin/env node
/**
 * Provision vauto-api + PostgreSQL on Render via API.
 * Requires: RENDER_API_KEY, optional OPENAI_API_KEY
 *
 * Usage:
 *   RENDER_API_KEY=rnd_xxx node scripts/provision-render.mjs
 *
 * GitHub: add RENDER_API_KEY (+ OPENAI_API_KEY) as repo secrets, then
 * Actions → Provision Render API → Run workflow
 */

const API = "https://api.render.com/v1";
const KEY = process.env.RENDER_API_KEY;
const REPO =
  process.env.GITHUB_REPO || "arnasbond/vauto";
const REPO_URL = `https://github.com/${REPO}`;
const SERVICE_NAME = "vauto-api";
const DB_NAME = "vauto-db";
const BRANCH = process.env.RENDER_BRANCH || "master";

if (!KEY) {
  console.error("Missing RENDER_API_KEY");
  console.error("Get one: https://dashboard.render.com/u/settings#api-keys");
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

function unwrap(row) {
  return row?.service || row?.postgres || row?.owner || row;
}

async function getOwnerId() {
  const owners = await list("/owners");
  if (!owners.length) throw new Error("No Render workspace found");
  const o = unwrap(owners[0]);
  console.log(`Workspace: ${o.name} (${o.id})`);
  return o.id;
}

async function findPostgres(ownerId) {
  const rows = await list(`/postgres?ownerId=${ownerId}`);
  for (const row of rows) {
    const p = unwrap(row);
    if (p.name === DB_NAME) return p;
  }
  return null;
}

async function findService(ownerId) {
  const rows = await list(`/services?ownerId=${ownerId}`);
  for (const row of rows) {
    const s = unwrap(row);
    if (s.name === SERVICE_NAME) return s;
  }
  return null;
}

async function createPostgres(ownerId) {
  console.log(`Creating Postgres: ${DB_NAME}…`);
  const res = await api("/postgres", {
    method: "POST",
    body: JSON.stringify({
      name: DB_NAME,
      ownerId,
      plan: "free",
      region: "frankfurt",
      databaseName: "vauto",
      databaseUser: "vauto",
    }),
  });
  return unwrap(res);
}

async function getConnectionString(postgresId) {
  const info = await api(`/postgres/${postgresId}/connection-info`);
  return info.connectionString || info.internalConnectionString;
}

async function createWebService(ownerId, databaseUrl) {
  console.log(`Creating web service: ${SERVICE_NAME}…`);
  const envVars = [
    { key: "DATABASE_URL", value: databaseUrl },
    { key: "PORT", value: "4000" },
  ];
  if (process.env.OPENAI_API_KEY) {
    envVars.push({ key: "OPENAI_API_KEY", value: process.env.OPENAI_API_KEY });
  }

  const res = await api("/services", {
    method: "POST",
    body: JSON.stringify({
      type: "web_service",
      name: SERVICE_NAME,
      ownerId,
      plan: "free",
      region: "frankfurt",
      repo: REPO_URL,
      branch: BRANCH,
      rootDir: "server",
      runtime: "docker",
      dockerContext: ".",
      dockerfilePath: "./Dockerfile",
      healthCheckPath: "/api/health",
      envVars,
    }),
  });
  return unwrap(res);
}

async function waitForPostgres(postgresId, maxMin = 10) {
  for (let i = 0; i < maxMin * 6; i++) {
    const p = unwrap(await api(`/postgres/${postgresId}`));
    if (p.status === "available") return p;
    console.log(`  DB status: ${p.status}…`);
    await sleep(10_000);
  }
  throw new Error("Postgres provisioning timeout");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const ownerId = await getOwnerId();

  let db = await findPostgres(ownerId);
  if (!db) db = await createPostgres(ownerId);
  console.log(`Postgres: ${db.name} (${db.id})`);

  if (db.status !== "available") {
    await waitForPostgres(db.id);
  }

  const databaseUrl = await getConnectionString(db.id);

  let svc = await findService(ownerId);
  if (!svc) svc = await createWebService(ownerId, databaseUrl);
  console.log(`Service: ${svc.name} → https://${svc.slug || SERVICE_NAME}.onrender.com`);
  console.log("Done. Set Vercel NEXT_PUBLIC_API_URL or update public/runtime-config.json");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
