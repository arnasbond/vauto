#!/usr/bin/env node
/**
 * Mirror CLOUDINARY_* from the current process env onto the Render API service,
 * then trigger a deploy so Node reloads the values.
 *
 * Typical CI usage:
 *   1) vercel env pull → source .env
 *   2) node scripts/sync-cloudinary-to-render.mjs
 *
 * Required: RENDER_API_KEY
 * Cloudinary source (any complete set):
 *   CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
 *   OR CLOUDINARY_CLOUD_NAME + CLOUDINARY_UPLOAD_PRESET
 *   OR CLOUDINARY_URL=cloudinary://key:secret@cloud_name
 */
const API = "https://api.render.com/v1";
const KEY = process.env.RENDER_API_KEY?.trim();
const SERVICE_ID =
  process.env.RENDER_SERVICE_ID?.trim() || "srv-d8q3fk6q1p3s739fd9h0";

if (!KEY) {
  console.error("Missing RENDER_API_KEY");
  process.exit(1);
}

function hydrateFromUrl() {
  const raw = process.env.CLOUDINARY_URL?.trim();
  if (!raw) return;
  const match = /^cloudinary:\/\/([^:]+):([^@]+)@([^/?#]+)/i.exec(raw);
  if (!match) {
    console.warn("CLOUDINARY_URL present but could not be parsed");
    return;
  }
  const [, apiKey, apiSecret, cloudName] = match;
  if (!process.env.CLOUDINARY_CLOUD_NAME?.trim()) {
    process.env.CLOUDINARY_CLOUD_NAME = decodeURIComponent(cloudName);
  }
  if (!process.env.CLOUDINARY_API_KEY?.trim()) {
    process.env.CLOUDINARY_API_KEY = decodeURIComponent(apiKey);
  }
  if (!process.env.CLOUDINARY_API_SECRET?.trim()) {
    process.env.CLOUDINARY_API_SECRET = decodeURIComponent(apiSecret);
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

async function setEnvVar(key, value) {
  await api(`/services/${SERVICE_ID}/env-vars/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
  console.log(`✓ ${key} (${value.length} chars)`);
}

async function main() {
  hydrateFromUrl();

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || "";
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || "";
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || "";
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET?.trim() || "";
  const cloudinaryUrl = process.env.CLOUDINARY_URL?.trim() || "";

  console.log("Presence (booleans only):");
  console.log(`  CLOUDINARY_CLOUD_NAME=${cloudName ? "yes" : "NO"}`);
  console.log(`  CLOUDINARY_API_KEY=${apiKey ? "yes" : "NO"}`);
  console.log(`  CLOUDINARY_API_SECRET=${apiSecret ? "yes" : "NO"}`);
  console.log(`  CLOUDINARY_UPLOAD_PRESET=${uploadPreset ? "yes" : "NO"}`);
  console.log(`  CLOUDINARY_URL=${cloudinaryUrl ? "yes" : "NO"}`);

  const signed = Boolean(apiKey && apiSecret);
  const configured = Boolean(cloudName && (signed || uploadPreset));
  if (!configured) {
    console.error(
      "FATAL: incomplete Cloudinary credentials in process env (after Vercel pull / GH secrets)."
    );
    console.error(
      "Need CLOUDINARY_CLOUD_NAME + (API_KEY+API_SECRET or UPLOAD_PRESET), or CLOUDINARY_URL."
    );
    process.exit(1);
  }

  console.log(`Syncing to Render service ${SERVICE_ID}…`);
  await setEnvVar("CLOUDINARY_CLOUD_NAME", cloudName);
  if (apiKey) await setEnvVar("CLOUDINARY_API_KEY", apiKey);
  if (apiSecret) await setEnvVar("CLOUDINARY_API_SECRET", apiSecret);
  if (uploadPreset) await setEnvVar("CLOUDINARY_UPLOAD_PRESET", uploadPreset);
  if (cloudinaryUrl) await setEnvVar("CLOUDINARY_URL", cloudinaryUrl);

  const deploy = await api(`/services/${SERVICE_ID}/deploys`, {
    method: "POST",
    body: JSON.stringify({ clearCache: "do_not_clear" }),
  });
  const d = deploy?.deploy || deploy;
  if (d?.id) {
    console.log(`✓ Deploy triggered: ${d.id} (${d.status ?? "queued"})`);
  } else {
    console.log("✓ Env updated (deploy response had no id)");
  }
  console.log("Verify: https://vauto-api.onrender.com/api/health → features.cloudinary");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
