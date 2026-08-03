#!/usr/bin/env node
/**
 * Report Render Postgres recovery / PITR window for vauto-db.
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
    throw new Error(
      `${path} → ${res.status}: ${typeof body === "object" ? body?.message : text}`
    );
  }
  return body;
}

function unwrap(row) {
  return row?.postgres || row?.owner || row;
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
  const ownerId = unwrap(owners[0]).id;
  const dbs = await list(`/postgres?ownerId=${ownerId}`);
  const db = dbs.map(unwrap).find((p) => p.name === DB_NAME);
  if (!db) throw new Error(`Postgres ${DB_NAME} not found`);

  const full = unwrap(await api(`/postgres/${db.id}`));
  let recovery = null;
  try {
    recovery = await api(`/postgres/${db.id}/recovery-info`);
  } catch (e) {
    recovery = { error: String(e.message || e) };
  }

  const report = {
    id: full.id,
    name: full.name,
    plan: full.plan,
    status: full.status,
    suspended: full.suspended,
    region: full.region,
    createdAt: full.createdAt,
    /** Paid plans get continuous PITR (Hobby ~3d / Pro ~7d workspace window). */
    paidPlan: full.plan && full.plan !== "free",
    recoveryInfo: recovery,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.paidPlan) {
    console.error(
      "WARN: free Postgres has NO automatic backups / PITR — upgrade required."
    );
    process.exit(2);
  }
  if (recovery?.error) {
    console.error("WARN: could not read recovery-info:", recovery.error);
    process.exit(3);
  }
  console.error(
    "OK: paid Postgres — Render continuous PITR should be active for this instance."
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
