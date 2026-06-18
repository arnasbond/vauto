#!/usr/bin/env node
/** Trigger a Render deploy for vauto-api (idempotent). */
const API = "https://api.render.com/v1";
const KEY = process.env.RENDER_API_KEY;
const SERVICE_NAME = "vauto-api";

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
  return row?.service || row;
}

async function main() {
  const owners = await list("/owners");
  if (!owners.length) throw new Error("No Render workspace");
  const ownerId = unwrap(owners[0]).id;

  const rows = await list(`/services?ownerId=${ownerId}`);
  const svc = rows.map(unwrap).find((s) => s.name === SERVICE_NAME);
  if (!svc) throw new Error(`Service ${SERVICE_NAME} not found`);

  console.log(`Deploying ${svc.name} (${svc.id})…`);
  const deploy = await api(`/services/${svc.id}/deploys`, {
    method: "POST",
    body: JSON.stringify({ clearCache: "do_not_clear" }),
  });
  const d = deploy.deploy || deploy;
  console.log(`Deploy triggered: ${d.id} status=${d.status}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
