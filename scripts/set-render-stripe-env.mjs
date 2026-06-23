#!/usr/bin/env node
/**
 * Set Stripe env vars on Render vauto-api and trigger redeploy.
 *
 * Usage:
 *   RENDER_API_KEY=rnd_xxx \
 *   STRIPE_SECRET_KEY=sk_test_xxx \
 *   STRIPE_WEBHOOK_SECRET=whsec_xxx \
 *   node scripts/set-render-stripe-env.mjs
 */
const API = "https://api.render.com/v1";
const KEY = process.env.RENDER_API_KEY;
const SERVICE_ID =
  process.env.RENDER_SERVICE_ID || "srv-d8q3fk6q1p3s739fd9h0";

const REQUIRED = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];

if (!KEY) {
  console.error("Missing RENDER_API_KEY");
  console.error("Create: https://dashboard.render.com/u/settings#api-keys");
  process.exit(1);
}

for (const k of REQUIRED) {
  if (!process.env[k]?.trim()) {
    console.error(`Missing ${k}`);
    process.exit(1);
  }
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

async function upsertEnv(key, value) {
  await api(
    `/services/${SERVICE_ID}/env-vars/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      body: JSON.stringify({ value }),
    }
  );
  console.log(`✓ ${key}`);
}

async function main() {
  console.log(`Updating env on service ${SERVICE_ID}…`);

  await upsertEnv("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY.trim());
  await upsertEnv(
    "STRIPE_WEBHOOK_SECRET",
    process.env.STRIPE_WEBHOOK_SECRET.trim()
  );
  await upsertEnv("STRIPE_AUTO_WEBHOOK", "1");
  await upsertEnv("PUBLIC_API_URL", "https://vauto-api.onrender.com");
  await upsertEnv("APP_ORIGIN", "https://vauto-chi.vercel.app");

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
