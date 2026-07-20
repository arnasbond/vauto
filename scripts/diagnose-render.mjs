#!/usr/bin/env node
/**
 * Diagnose vauto-api Render service health / deploy failures.
 * Requires: RENDER_API_KEY
 *
 *   RENDER_API_KEY=rnd_xxx node scripts/diagnose-render.mjs
 */
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
    const q = cursor
      ? path.includes("?")
        ? `&cursor=${encodeURIComponent(cursor)}`
        : `?cursor=${encodeURIComponent(cursor)}`
      : "";
    const page = await api(`${path}${q}`);
    if (Array.isArray(page)) out.push(...page);
    else if (page?.items) out.push(...page.items);
    cursor = page?.cursor;
  } while (cursor);
  return out;
}

async function main() {
  const svcRow = await api(`/services/${SERVICE_ID}`);
  const svc = unwrap(svcRow);
  console.log("=== Service ===");
  console.log(
    JSON.stringify(
      {
        id: svc.id,
        name: svc.name,
        type: svc.type,
        suspended: svc.suspended,
        autoDeploy: svc.autoDeploy,
        branch: svc.branch || svc.serviceDetails?.branch,
        url: svc.serviceDetails?.url,
        healthCheckPath: svc.serviceDetails?.healthCheckPath,
        plan: svc.serviceDetails?.plan || svc.plan,
        region: svc.serviceDetails?.region || svc.region,
        updatedAt: svc.updatedAt,
      },
      null,
      2
    )
  );

  console.log("\n=== Env keys (presence only) ===");
  const envRows = await list(`/services/${SERVICE_ID}/env-vars`);
  const keys = envRows.map((r) => unwrap(r)?.key).filter(Boolean).sort();
  const need = [
    "DATABASE_URL",
    "JWT_SECRET",
    "GEMINI_API_KEY",
    "AI_KEY",
    "PORT",
    "APP_ORIGIN",
    "PUBLIC_API_URL",
  ];
  for (const k of need) {
    console.log(`  ${keys.includes(k) ? "✓" : "✗"} ${k}`);
  }
  console.log(`  total keys: ${keys.length}`);

  console.log("\n=== Recent deploys ===");
  const deploys = (await list(`/services/${SERVICE_ID}/deploys`))
    .map(unwrap)
    .slice(0, 8);
  for (const d of deploys) {
    console.log(
      `  ${d.id}  ${d.status?.padEnd?.(18) || String(d.status)}  ${d.finishedAt || d.updatedAt || d.createdAt || ""}  trigger=${d.trigger || "?"}`
    );
  }

  const failed = deploys.find((d) =>
    ["update_failed", "build_failed", "canceled", "deactivated"].includes(
      d.status
    )
  );
  if (failed?.id) {
    console.log(`\n=== Failed deploy detail (${failed.id}) ===`);
    try {
      const detail = unwrap(await api(`/services/${SERVICE_ID}/deploys/${failed.id}`));
      console.log(
        JSON.stringify(
          {
            status: detail.status,
            commit: detail.commit,
            finishedAt: detail.finishedAt,
            startedAt: detail.startedAt,
            update: detail.update,
          },
          null,
          2
        )
      );
    } catch (e) {
      console.log("detail error:", e.message || e);
    }
  }

  console.log("\n=== Postgres ===");
  try {
    const owners = await list("/owners");
    const ownerId = unwrap(owners[0])?.id;
    const dbs = ownerId ? await list(`/postgres?ownerId=${ownerId}`) : [];
    const db = dbs.map(unwrap).find((p) => p.name === DB_NAME) || dbs.map(unwrap)[0];
    if (!db) {
      console.log("  No postgres instance found");
    } else {
      console.log(
        JSON.stringify(
          {
            id: db.id,
            name: db.name,
            status: db.status,
            suspended: db.suspended,
            plan: db.plan,
            region: db.region,
            version: db.version,
            expiresAt: db.expiresAt,
            diskAvailableBytes: db.diskAvailableBytes,
            updatedAt: db.updatedAt,
          },
          null,
          2
        )
      );
      try {
        const info = await api(`/postgres/${db.id}/connection-info`);
        console.log(
          "  connection-info keys:",
          Object.keys(info || {}).join(", "),
          "| has connectionString:",
          Boolean(info?.connectionString || info?.internalConnectionString)
        );
      } catch (e) {
        console.log("  connection-info error:", e.message || e);
      }
    }
  } catch (e) {
    console.log("  postgres list error:", e.message || e);
  }

  console.log("\n=== Live HTTP probe ===");
  for (const path of ["/api/health", "/api/ai/health"]) {
    const url = `https://vauto-api.onrender.com${path}`;
    const t0 = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      const text = await res.text();
      console.log(
        `  ${path} → ${res.status} (${Date.now() - t0}ms) ${text.slice(0, 160).replace(/\s+/g, " ")}`
      );
    } catch (e) {
      console.log(`  ${path} → ERR (${Date.now() - t0}ms) ${e.message || e}`);
    }
  }

  console.log("\n=== Recent app logs (best effort) ===");
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    const q = new URLSearchParams({
      resource: SERVICE_ID,
      limit: "50",
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
    const logs = await api(`/logs?${q}`);
    const lines = Array.isArray(logs) ? logs : logs?.logs || logs?.items || [];
    if (!lines.length) {
      console.log("  (no log lines returned)");
      console.log("  raw keys:", logs && typeof logs === "object" ? Object.keys(logs).join(", ") : typeof logs);
    } else {
      for (const line of lines.slice(-40)) {
        const msg =
          line.message || line.text || line.body || JSON.stringify(line);
        const ts = line.timestamp || line.time || "";
        console.log(`  ${ts} ${String(msg).slice(0, 240)}`);
      }
    }
  } catch (e) {
    console.log("  logs error:", e.message || e);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
