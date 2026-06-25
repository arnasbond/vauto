#!/usr/bin/env node
/**
 * Sync Gemini env vars on Vercel and remove legacy OpenAI keys.
 *
 * Usage:
 *   VERCEL_TOKEN=xxx VERCEL_PROJECT_ID=xxx VERCEL_ORG_ID=xxx \
 *   GEMINI_API_KEY=xxx node scripts/configure-vercel-env.mjs
 */
const TOKEN = process.env.VERCEL_TOKEN?.trim();
const PROJECT_ID = process.env.VERCEL_PROJECT_ID?.trim();
const TEAM_ID = process.env.VERCEL_ORG_ID?.trim();
const GEMINI = process.env.GEMINI_API_KEY?.trim() || process.env.AI_KEY?.trim();

if (!TOKEN || !PROJECT_ID) {
  console.error("Missing VERCEL_TOKEN or VERCEL_PROJECT_ID");
  process.exit(1);
}

const API = "https://api.vercel.com";
const TARGETS = ["production", "preview", "development"];

async function vercel(path, opts = {}) {
  const url = new URL(`${API}${path}`);
  if (TEAM_ID) url.searchParams.set("teamId", TEAM_ID);
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
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
      typeof body === "object" && body?.error?.message
        ? body.error.message
        : text || res.statusText;
    throw new Error(`${opts.method || "GET"} ${path} → ${res.status}: ${msg}`);
  }
  return body;
}

async function upsertEnv(key, value, target) {
  const list = await vercel(
    `/v9/projects/${PROJECT_ID}/env?decrypt=false&target=${target}`
  );
  const row = (list?.envs || []).find((e) => e.key === key);
  if (row?.id) {
    await vercel(`/v9/projects/${PROJECT_ID}/env/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ value, type: "encrypted", target: [target] }),
    });
    console.log(`✓ Vercel ${target}: updated ${key}`);
    return;
  }
  await vercel(`/v10/projects/${PROJECT_ID}/env`, {
    method: "POST",
    body: JSON.stringify({
      key,
      value,
      type: "encrypted",
      target: [target],
    }),
  });
  console.log(`✓ Vercel ${target}: created ${key}`);
}

async function deleteEnv(key, target) {
  const list = await vercel(
    `/v9/projects/${PROJECT_ID}/env?decrypt=false&target=${target}`
  );
  const row = (list?.envs || []).find((e) => e.key === key);
  if (!row?.id) {
    console.log(`· Vercel ${target}: ${key} not present`);
    return;
  }
  await vercel(`/v9/projects/${PROJECT_ID}/env/${row.id}`, {
    method: "DELETE",
  });
  console.log(`✓ Vercel ${target}: removed ${key}`);
}

async function main() {
  console.log(`Syncing Vercel env for project ${PROJECT_ID}…`);

  for (const target of TARGETS) {
    await deleteEnv("OPENAI_API_KEY", target);
    if (GEMINI) {
      await upsertEnv("GEMINI_API_KEY", GEMINI, target);
      await upsertEnv("NEXT_PUBLIC_GEMINI_API_KEY", GEMINI, target);
    } else {
      console.warn(`⚠ GEMINI_API_KEY not set — skipping upsert for ${target}`);
    }
  }

  console.log("Vercel env sync complete.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
