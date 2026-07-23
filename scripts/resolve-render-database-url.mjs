#!/usr/bin/env node
/**
 * Resolve external Postgres DATABASE_URL for vauto-db via Render API.
 * Prints the URL to stdout (no other noise) when --print is passed.
 *
 *   RENDER_API_KEY=rnd_xxx node scripts/resolve-render-database-url.mjs --print
 */
const API = "https://api.render.com/v1";
const KEY = process.env.RENDER_API_KEY;
const DB_NAME = process.env.RENDER_DB_NAME || "vauto-db";
const printOnly = process.argv.includes("--print");

if (!KEY) {
  console.error("Missing RENDER_API_KEY");
  process.exit(1);
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
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
  return row?.postgres || row?.owner || row?.service || row?.envVar || row;
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

async function resolveDatabaseUrl() {
  const owners = await list("/owners");
  if (!owners.length) throw new Error("No Render workspace found");
  const ownerId = unwrap(owners[0]).id;
  const dbs = await list(`/postgres?ownerId=${ownerId}`);
  const db = dbs.map(unwrap).find((p) => p.name === DB_NAME);
  if (!db) throw new Error(`Postgres ${DB_NAME} not found`);

  const info = await api(`/postgres/${db.id}/connection-info`);
  // Prefer external — GitHub Actions / local hosts are outside Render's network
  const url =
    info.externalConnectionString ||
    info.connectionString ||
    info.internalConnectionString;
  if (!url) throw new Error("No connection string from Render Postgres");
  return { url, dbId: db.id, dbName: db.name };
}

async function main() {
  const { url, dbId, dbName } = await resolveDatabaseUrl();
  if (printOnly) {
    process.stdout.write(url);
    return;
  }
  console.log(`Resolved ${dbName} (${dbId})`);
  console.log("DATABASE_URL is set in process (not printed).");
  process.env.DATABASE_URL = url;
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

export { resolveDatabaseUrl };
