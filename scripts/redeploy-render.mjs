#!/usr/bin/env node
/** Trigger a Render deploy for vauto-api (idempotent). */
const API = "https://api.render.com/v1";
const KEY = process.env.RENDER_API_KEY;
const SERVICE_NAME = process.env.RENDER_SERVICE_NAME || "vauto-api";
const SERVICE_ID = process.env.RENDER_SERVICE_ID;

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
  return row?.service || row?.owner || row;
}

function matchesService(s) {
  if (!s) return false;
  return (
    s.name === SERVICE_NAME ||
    s.slug === SERVICE_NAME ||
    String(s.serviceDetails?.url ?? "").includes(`${SERVICE_NAME}.onrender.com`)
  );
}

async function findService() {
  if (SERVICE_ID) {
    return unwrap(await api(`/services/${SERVICE_ID}`));
  }

  const owners = await list("/owners");
  for (const row of owners) {
    const owner = unwrap(row);
    const rows = await list(`/services?ownerId=${owner.id}&limit=100`);
    const svc = rows.map(unwrap).find(matchesService);
    if (svc) return svc;
  }

  const all = await list("/services?limit=100");
  const svc = all.map(unwrap).find(matchesService);
  if (svc) return svc;

  const names = all.map((r) => unwrap(r).name).filter(Boolean);
  throw new Error(
    `Service ${SERVICE_NAME} not found. Available: ${names.join(", ") || "none"}`
  );
}

async function main() {
  const svc = await findService();
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
