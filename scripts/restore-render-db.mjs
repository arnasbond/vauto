#!/usr/bin/env node
/**
 * Restore expired/suspended Render free Postgres by upgrading to a paid plan,
 * refresh DATABASE_URL on vauto-api, and trigger a deploy.
 *
 * Requires: RENDER_API_KEY
 * Optional: RENDER_POSTGRES_PLAN (default basic_256mb)
 *
 *   RENDER_API_KEY=rnd_xxx node scripts/restore-render-db.mjs
 */
const API = "https://api.render.com/v1";
const KEY = process.env.RENDER_API_KEY;
const SERVICE_ID =
  process.env.RENDER_SERVICE_ID || "srv-d8q3fk6q1p3s739fd9h0";
const DB_NAME = process.env.RENDER_DB_NAME || "vauto-db";
const PLAN = process.env.RENDER_POSTGRES_PLAN || "basic_256mb";

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
  return row?.service || row?.postgres || row?.deploy || row?.envVar || row?.owner || row;
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPostgres() {
  const owners = await list("/owners");
  if (!owners.length) throw new Error("No Render workspace found");
  const ownerId = unwrap(owners[0]).id;
  const dbs = await list(`/postgres?ownerId=${ownerId}`);
  const db = dbs.map(unwrap).find((p) => p.name === DB_NAME);
  if (!db) throw new Error(`Postgres ${DB_NAME} not found`);
  return db;
}

async function waitForAvailable(postgresId, maxMin = 20) {
  for (let i = 0; i < maxMin * 6; i++) {
    const p = unwrap(await api(`/postgres/${postgresId}`));
    console.log(
      `  DB status=${p.status} suspended=${p.suspended} plan=${p.plan}`
    );
    if (p.status === "available" && p.suspended === "not_suspended") return p;
    await sleep(10_000);
  }
  throw new Error("Postgres did not become available in time");
}

async function main() {
  const db = await findPostgres();
  console.log(
    `Found ${db.name} (${db.id}) status=${db.status} suspended=${db.suspended} plan=${db.plan} expiresAt=${db.expiresAt || "n/a"}`
  );

  if (db.plan === "free" || db.status === "suspended" || db.suspended === "suspended") {
    console.log(`Upgrading Postgres to plan=${PLAN}…`);
    const updated = unwrap(
      await api(`/postgres/${db.id}`, {
        method: "PATCH",
        body: JSON.stringify({ plan: PLAN }),
      })
    );
    console.log(
      `Upgrade requested → status=${updated.status} plan=${updated.plan}`
    );
  } else {
    console.log("Postgres already on a paid/available plan — skipping upgrade");
  }

  const ready = await waitForAvailable(db.id);
  console.log(`Postgres ready: plan=${ready.plan} status=${ready.status}`);

  const info = await api(`/postgres/${db.id}/connection-info`);
  const url = info.internalConnectionString || info.connectionString;
  if (!url) throw new Error("No connection string after restore");

  console.log("Updating DATABASE_URL on web service…");
  await api(`/services/${SERVICE_ID}/env-vars/DATABASE_URL`, {
    method: "PUT",
    body: JSON.stringify({ value: url }),
  });
  console.log("✓ DATABASE_URL");

  console.log("Triggering vauto-api deploy…");
  const deploy = await api(`/services/${SERVICE_ID}/deploys`, {
    method: "POST",
    body: JSON.stringify({ clearCache: "clear" }),
  });
  const d = deploy?.deploy || deploy;
  console.log(`✓ Deploy ${d?.id || "queued"} status=${d?.status || "unknown"}`);
  console.log("Next: wait for https://vauto-api.onrender.com/api/health");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
