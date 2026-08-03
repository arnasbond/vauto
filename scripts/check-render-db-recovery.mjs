#!/usr/bin/env node
/**
 * Report Render Postgres recovery / PITR status for vauto-db.
 *
 * Paid Render Postgres includes continuous PITR (workspace-dependent window).
 * Free instances have no backups — this script exits non-zero in that case.
 *
 *   RENDER_API_KEY=rnd_… node scripts/check-render-db-recovery.mjs
 */
const API = "https://api.render.com/v1";
const KEY = process.env.RENDER_API_KEY;
const DB_NAME = process.env.RENDER_DB_NAME || "vauto-db";

if (!KEY) {
  console.error("Missing RENDER_API_KEY");
  process.exit(1);
}

async function api(path) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${KEY}`,
      Accept: "application/json",
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
    const err = new Error(
      `${path} → ${res.status}: ${typeof body === "object" ? body?.message || text : text}`
    );
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/** Prefer the Postgres resource — never accidentally unwrap nested owner/workspace. */
function unwrapPostgres(row) {
  if (!row || typeof row !== "object") return row;
  if (row.postgres && typeof row.postgres === "object") return row.postgres;
  if (typeof row.id === "string" && row.id.startsWith("dpg-")) return row;
  return row;
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

async function main() {
  const owners = await list("/owners");
  const ownerRow = owners[0]?.owner || owners[0];
  const ownerId = ownerRow?.id;
  if (!ownerId) throw new Error("No Render owner/workspace found");

  const dbs = await list(`/postgres?ownerId=${ownerId}`);
  const db = dbs.map(unwrapPostgres).find((p) => p?.name === DB_NAME);
  if (!db?.id) throw new Error(`Postgres ${DB_NAME} not found`);

  const full = unwrapPostgres(await api(`/postgres/${db.id}`));
  const plan = String(full.plan || db.plan || "");
  const paidPlan = Boolean(plan) && plan !== "free";

  let recovery = null;
  try {
    recovery = await api(`/postgres/${db.id}/recovery-info`);
  } catch (e) {
    // Some API versions expose recovery only via Dashboard / different path.
    recovery = {
      available: null,
      note: String(e.message || e),
      status: e.status || null,
    };
  }

  const report = {
    id: full.id || db.id,
    name: full.name || db.name,
    plan: plan || null,
    status: full.status || db.status || null,
    suspended: full.suspended || db.suspended || null,
    region: full.region || db.region || null,
    createdAt: full.createdAt || db.createdAt || null,
    paidPlan,
    pitrExpected: paidPlan,
    recoveryInfo: recovery,
    guidance: paidPlan
      ? "Paid instance: Render continuous PITR is included (Hobby workspace ~3 days, Pro+ ~7 days). Also run npm run db:backup for logical dumps."
      : "Free instance: NO automatic backups / PITR. Upgrade to basic_256mb+ and keep weekly logical dumps.",
  };

  console.log(JSON.stringify(report, null, 2));

  if (!paidPlan) {
    console.error(
      "WARN: free Postgres has NO automatic backups / PITR — upgrade required."
    );
    process.exit(2);
  }

  if (recovery?.status === 404) {
    console.error(
      "OK: paid Postgres detected. recovery-info endpoint 404 on this API version — rely on Dashboard Recovery + logical dumps."
    );
    process.exit(0);
  }

  console.error(
    "OK: paid Postgres — Render continuous PITR expected for this instance."
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
