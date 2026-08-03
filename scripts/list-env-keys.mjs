#!/usr/bin/env node
/**
 * Print env KEY names only (no values) from Render + optional Vercel.
 *   RENDER_API_KEY=… node scripts/list-env-keys.mjs
 */
const RENDER_KEY = process.env.RENDER_API_KEY;
const SERVICE_ID =
  process.env.RENDER_SERVICE_ID || "srv-d8q3fk6q1p3s739fd9h0";

async function renderKeys() {
  if (!RENDER_KEY) {
    console.log("RENDER: missing RENDER_API_KEY");
    return;
  }
  const keys = [];
  let cursor;
  do {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const res = await fetch(
      `https://api.render.com/v1/services/${SERVICE_ID}/env-vars${q}`,
      { headers: { Authorization: `Bearer ${RENDER_KEY}`, Accept: "application/json" } }
    );
    const page = await res.json();
    const rows = Array.isArray(page) ? page : page.items || [];
    for (const row of rows) {
      const ev = row.envVar || row;
      if (ev?.key) keys.push(ev.key);
    }
    cursor = page.cursor;
  } while (cursor);
  keys.sort();
  console.log("RENDER_KEYS=" + keys.join(","));
  console.log(
    "CLOUDINARYish=" +
      keys.filter((k) => /cloud|upload_preset|image/i.test(k)).join(",")
  );
}

async function vercelKeys() {
  const token = process.env.VERCEL_TOKEN;
  const org = process.env.VERCEL_ORG_ID;
  const project = process.env.VERCEL_PROJECT_ID;
  if (!token || !org || !project) {
    console.log("VERCEL: missing token/org/project");
    return;
  }
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${project}/env?teamId=${org}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const body = await res.json();
  const envs = body.envs || body || [];
  const keys = (Array.isArray(envs) ? envs : [])
    .map((e) => e.key)
    .filter(Boolean)
    .sort();
  console.log("VERCEL_KEYS=" + keys.join(","));
  console.log(
    "CLOUDINARYish=" +
      keys.filter((k) => /cloud|upload_preset|image/i.test(k)).join(",")
  );
}

await renderKeys();
await vercelKeys();
