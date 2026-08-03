#!/usr/bin/env node
/**
 * Restore listing covers from Cloudinary Admin/Search API.
 *
 * Resolves credentials from env, or from Render service env when
 * RENDER_API_KEY is set:
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 *   DATABASE_URL (or via resolve-render-database-url.mjs)
 *
 * Matching (in order):
 *   1) Search expression: public_id / tags / context contain listing id or draft uuid
 *   2) Time-proximity to listing.created_at within unused folder:vauto assets
 *   3) Neutral system placeholder (uploaded once to vauto/system/) — never Unsplash
 *
 * Usage:
 *   node server/scripts/restore-covers-from-cloudinary.mjs
 *   node server/scripts/restore-covers-from-cloudinary.mjs --dry-run
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const dryRun = process.argv.includes("--dry-run");

const RENDER_SERVICE_ID =
  process.env.RENDER_SERVICE_ID || "srv-d8q3fk6q1p3s739fd9h0";
const PLACEHOLDER_PUBLIC_ID = "vauto/system/listing-placeholder";

const STOCK_HOST_RE =
  /(?:images\.)?unsplash\.com|source\.unsplash\.com|picsum\.photos|placeholder\.com|via\.placeholder|placehold\.co|loremflickr|dummyimage/i;

function basicAuth(key, secret) {
  return Buffer.from(`${key}:${secret}`).toString("base64");
}

async function renderApi(pathName, key) {
  const res = await fetch(`https://api.render.com/v1${pathName}`, {
    headers: {
      Authorization: `Bearer ${key}`,
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
      `Render ${pathName} → ${res.status}: ${typeof body === "object" ? body?.message : text}`
    );
  }
  return body;
}

async function listRenderEnv(renderKey) {
  const map = new Map();
  let cursor;
  do {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const page = await renderApi(
      `/services/${RENDER_SERVICE_ID}/env-vars${q}`,
      renderKey
    );
    const rows = Array.isArray(page) ? page : page?.items || [];
    for (const row of rows) {
      const ev = row?.envVar || row;
      if (ev?.key) map.set(ev.key, ev.value ?? "");
    }
    cursor = page?.cursor;
  } while (cursor);
  return map;
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  if (!process.env.RENDER_API_KEY?.trim()) {
    throw new Error("Set DATABASE_URL or RENDER_API_KEY");
  }
  const r = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "resolve-render-database-url.mjs"), "--print"],
    { encoding: "utf8", env: process.env, cwd: root }
  );
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "Failed to resolve DATABASE_URL");
  }
  const url = r.stdout.trim();
  if (!url.startsWith("postgres")) {
    throw new Error(`Unexpected DATABASE_URL: ${url.slice(0, 60)}`);
  }
  return url;
}

async function listVercelEnvMap() {
  const token = process.env.VERCEL_TOKEN?.trim();
  const org = process.env.VERCEL_ORG_ID?.trim();
  const project = process.env.VERCEL_PROJECT_ID?.trim();
  if (!token || !org || !project) return new Map();

  const listRes = await fetch(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/env?teamId=${encodeURIComponent(org)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const listBody = await listRes.json();
  if (!listRes.ok) {
    throw new Error(
      `Vercel env list → ${listRes.status}: ${JSON.stringify(listBody).slice(0, 200)}`
    );
  }
  const envs = Array.isArray(listBody?.envs) ? listBody.envs : [];
  const map = new Map();

  const looksEncrypted = (v) =>
    !v ||
    v.includes("••••") ||
    v.startsWith("eyJ") ||
    v.startsWith("@encrypted");

  for (const ev of envs) {
    const key = ev?.key;
    if (!key || !/^CLOUDINARY_/i.test(key)) continue;

    const targets = Array.isArray(ev.target) ? ev.target : [];
    // Prefer production; accept preview only if production missing later.
    const isProd = !targets.length || targets.includes("production");
    const isPreview = targets.includes("preview");
    if (!isProd && !isPreview) continue;

    let value = typeof ev.value === "string" ? ev.value : "";
    if (looksEncrypted(value) && ev.id) {
      const urls = [
        `https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/env/${ev.id}?teamId=${encodeURIComponent(org)}&decrypt=true`,
        `https://api.vercel.com/v1/projects/${encodeURIComponent(project)}/env/${ev.id}?teamId=${encodeURIComponent(org)}&decrypt=true`,
        `https://api.vercel.com/v8/projects/${encodeURIComponent(project)}/env/${ev.id}?decrypt=true&teamId=${encodeURIComponent(org)}`,
      ];
      for (const url of urls) {
        const one = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const oneBody = await one.json().catch(() => ({}));
        const candidate =
          (typeof oneBody?.value === "string" && oneBody.value) ||
          (typeof oneBody?.env?.value === "string" && oneBody.env.value) ||
          (typeof oneBody?.decrypted === "string" && oneBody.decrypted) ||
          "";
        if (one.ok && candidate && !looksEncrypted(candidate)) {
          value = candidate;
          break;
        }
      }
    }

    if (!value || looksEncrypted(value)) {
      console.warn(
        `[cloudinary-restore] could not decrypt Vercel env ${key} (id=${ev.id})`
      );
      continue;
    }

    // Prefer production over preview when both exist.
    if (map.has(key) && !isProd) continue;
    map.set(key, value);
  }
  return map;
}

async function resolveCloudinaryCreds() {
  let cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim() || "";
  let key = process.env.CLOUDINARY_API_KEY?.trim() || "";
  let secret = process.env.CLOUDINARY_API_SECRET?.trim() || "";

  const applyMap = (env, label) => {
    cloud = cloud || env.get("CLOUDINARY_CLOUD_NAME")?.trim() || "";
    key = key || env.get("CLOUDINARY_API_KEY")?.trim() || "";
    secret = secret || env.get("CLOUDINARY_API_SECRET")?.trim() || "";
    const url = env.get("CLOUDINARY_URL")?.trim() || "";
    if (url && (!cloud || !key || !secret)) {
      const m = url.match(
        /^cloudinary:\/\/([^:]+):([^@]+)@([A-Za-z0-9_-]+)/i
      );
      if (m) {
        key = key || m[1];
        secret = secret || m[2];
        cloud = cloud || m[3];
      }
    }
    console.log(
      `[cloudinary-restore] ${label}: cloud=${Boolean(cloud)} key=${Boolean(key)} secret=${Boolean(secret)}`
    );
  };

  if ((!cloud || !key || !secret) && process.env.VERCEL_TOKEN?.trim()) {
    console.log("[cloudinary-restore] Loading CLOUDINARY_* from Vercel env…");
    applyMap(await listVercelEnvMap(), "Vercel");
  }

  if ((!cloud || !key || !secret) && process.env.RENDER_API_KEY?.trim()) {
    console.log("[cloudinary-restore] Loading CLOUDINARY_* from Render env…");
    applyMap(await listRenderEnv(process.env.RENDER_API_KEY.trim()), "Render");
  }

  if (!cloud || !key || !secret) {
    throw new Error(
      "Missing CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET (checked env, Vercel, Render)"
    );
  }
  return { cloud, key, secret };
}

async function cloudinary(cloud, key, secret, method, apiPath, body) {
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}${apiPath}`, {
    method,
    headers: {
      Authorization: `Basic ${basicAuth(key, secret)}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `Cloudinary ${apiPath} → ${res.status}: ${text.slice(0, 300)}`
    );
  }
  return json;
}

async function searchAssets(cloud, key, secret, expression, max = 30) {
  try {
    const data = await cloudinary(cloud, key, secret, "POST", "/resources/search", {
      expression,
      max_results: max,
      with_field: ["tags", "context", "image_metadata"],
    });
    return Array.isArray(data?.resources) ? data.resources : [];
  } catch (e) {
    console.warn(`[search] ${expression} → ${e.message}`);
    return [];
  }
}

async function listFolderAssets(cloud, key, secret, prefix = "vauto/") {
  const out = [];
  let nextCursor;
  do {
    const q = new URLSearchParams({
      type: "upload",
      prefix,
      max_results: "500",
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    });
    const data = await cloudinary(
      cloud,
      key,
      secret,
      "GET",
      `/resources/image/upload?${q}`
    );
    out.push(...(data.resources || []));
    nextCursor = data.next_cursor;
  } while (nextCursor);
  return out;
}

/** Solid soft-gray 64×64 PNG (no product imagery). */
function placeholderPngBuffer() {
  const width = 64;
  const height = 64;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 4;
      raw[i] = 0xe8;
      raw[i + 1] = 0xea;
      raw[i + 2] = 0xed;
      raw[i + 3] = 0xff;
    }
  }
  const compressed = zlib.deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    return table;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++)
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdrData),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function ensurePlaceholder(cloud, key, secret) {
  try {
    const existing = await cloudinary(
      cloud,
      key,
      secret,
      "GET",
      `/resources/image/upload/${encodeURIComponent(PLACEHOLDER_PUBLIC_ID)}`
    );
    if (existing?.secure_url) return existing.secure_url;
  } catch {
    /* create below */
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([placeholderPngBuffer()], { type: "image/png" }),
    "listing-placeholder.png"
  );
  form.append("public_id", PLACEHOLDER_PUBLIC_ID);
  form.append("overwrite", "true");
  // Do not also set folder — public_id already includes vauto/system/
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth(key, secret)}` },
      body: form,
    }
  );
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  if (!res.ok || !json.secure_url) {
    // Fallback: absolute site asset (committed SVG) — still no Unsplash.
    console.warn(
      `[placeholder] upload failed ${res.status} ${text.slice(0, 160)} — using www.vauto.lt SVG`
    );
    return "https://www.vauto.lt/listing-placeholder.svg";
  }
  return json.secure_url;
}

function listingTokens(row) {
  const tokens = new Set();
  const id = String(row.id || "");
  tokens.add(id);
  tokens.add(id.replace(/^l-/i, ""));
  const attrs =
    typeof row.attributes === "string"
      ? (() => {
          try {
            return JSON.parse(row.attributes);
          } catch {
            return {};
          }
        })()
      : row.attributes && typeof row.attributes === "object"
        ? row.attributes
        : {};
  const draft = String(attrs.clientDraftId || "").trim();
  if (draft) {
    tokens.add(draft);
    tokens.add(draft.replace(/^l-/i, ""));
  }
  return [...tokens].filter((t) => t.length >= 8);
}

function assetMatchesToken(asset, token) {
  const hay = [
    asset.public_id,
    asset.filename,
    ...(asset.tags || []),
    JSON.stringify(asset.context || {}),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(String(token).toLowerCase());
}

function isUsableAsset(asset) {
  const url = asset?.secure_url || "";
  if (!url || STOCK_HOST_RE.test(url)) return false;
  const pid = String(asset.public_id || "");
  if (pid.startsWith("vauto/system/")) return false;
  if (pid.includes("avatar")) return false;
  return true;
}

function needsCover(image) {
  if (!image || !String(image).trim()) return true;
  if (STOCK_HOST_RE.test(image)) return true;
  if (String(image).startsWith("data:")) return true;
  if (/listing-placeholder/i.test(image)) return true;
  return false;
}

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

async function main() {
  const { cloud, key, secret } = await resolveCloudinaryCreds();
  let connectionString = resolveDatabaseUrl();
  const isLocal =
    /localhost|127\.0\.0\.1/i.test(connectionString) ||
    connectionString.includes("@postgres:");
  if (!isLocal && !/[?&]sslmode=/i.test(connectionString)) {
    connectionString += connectionString.includes("?")
      ? "&sslmode=require"
      : "?sslmode=require";
  }

  console.log(
    `[cloudinary-restore] cloud=${cloud.slice(0, 24)}… dryRun=${dryRun}`
  );

  const folderAssets = await listFolderAssets(cloud, key, secret, "vauto/");
  console.log(`[cloudinary-restore] folder:vauto assets=${folderAssets.length}`);
  for (const a of folderAssets.slice(0, 8)) {
    console.log(`  sample ${a.public_id} ${a.created_at || ""}`);
  }

  const placeholderUrl = dryRun
    ? "https://www.vauto.lt/listing-placeholder.svg"
    : await ensurePlaceholder(cloud, key, secret);
  console.log(`[cloudinary-restore] placeholder=${placeholderUrl}`);

  const pool = new pg.Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  try {
    const hasImages = await columnExists(client, "listings", "images");
    const hasAttrs = await columnExists(client, "listings", "attributes");
    const cols = ["id", "title", "category", "image", "seller_id", "created_at"];
    if (hasAttrs) cols.push("attributes");
    if (hasImages) cols.push("images");

    const { rows } = await client.query(
      `SELECT ${cols.join(", ")}
       FROM listings
       WHERE COALESCE(status, 'active') NOT IN ('deleted', 'archived')
         AND id !~* '^(lt-|demo-|seller-|l-soft-)'
       ORDER BY created_at DESC NULLS LAST`
    );

    console.log(`[cloudinary-restore] listings=${rows.length}`);

    const usedPublicIds = new Set();
    let restored = 0;
    let placeholders = 0;
    let kept = 0;

    for (const row of rows) {
      if (!needsCover(row.image) && /res\.cloudinary\.com/i.test(String(row.image))) {
        kept += 1;
        console.log(`KEEP   ${row.id} ${String(row.title).slice(0, 40)}`);
        continue;
      }

      let matched = null;
      const tokens = listingTokens(row);

      for (const token of tokens) {
        const found = await searchAssets(
          cloud,
          key,
          secret,
          `(public_id:*${token}* OR tags=${token} OR context.custom.listingId=${token} OR context.custom.listing_id=${token})`,
          10
        );
        matched = found.find((a) => isUsableAsset(a) && !usedPublicIds.has(a.public_id));
        if (matched) break;

        matched = folderAssets.find(
          (a) =>
            isUsableAsset(a) &&
            !usedPublicIds.has(a.public_id) &&
            assetMatchesToken(a, token)
        );
        if (matched) break;
      }

      if (!matched && row.created_at) {
        const created = new Date(row.created_at).getTime();
        const windowMs = 72 * 60 * 60 * 1000;
        const candidates = folderAssets
          .filter((a) => isUsableAsset(a) && !usedPublicIds.has(a.public_id))
          .map((a) => ({
            a,
            delta: Math.abs(new Date(a.created_at).getTime() - created),
          }))
          .filter((x) => Number.isFinite(x.delta) && x.delta <= windowMs)
          .sort((x, y) => x.delta - y.delta);
        if (candidates[0] && candidates[0].delta <= windowMs) {
          // Only accept time match if uniquely close (<15m) or sole candidate in window
          const best = candidates[0];
          const second = candidates[1];
          if (
            best.delta <= 15 * 60 * 1000 ||
            !second ||
            best.delta * 3 < second.delta
          ) {
            matched = best.a;
          }
        }
      }

      if (matched?.secure_url) {
        usedPublicIds.add(matched.public_id);
        const cover = matched.secure_url;
        console.log(
          `RESTORE ${row.id} ${String(row.title).slice(0, 40)} → ${matched.public_id}`
        );
        if (!dryRun) {
          if (hasImages) {
            await client.query(
              `UPDATE listings SET image = $1, images = $2::jsonb WHERE id = $3`,
              [cover, JSON.stringify([cover]), row.id]
            );
          } else {
            await client.query(`UPDATE listings SET image = $1 WHERE id = $2`, [
              cover,
              row.id,
            ]);
          }
        }
        restored += 1;
        continue;
      }

      console.log(
        `PLACE  ${row.id} ${String(row.title).slice(0, 40)} (no Cloudinary match)`
      );
      if (!dryRun) {
        if (hasImages) {
          await client.query(
            `UPDATE listings SET image = $1, images = $2::jsonb WHERE id = $3`,
            [placeholderUrl, JSON.stringify([placeholderUrl]), row.id]
          );
        } else {
          await client.query(`UPDATE listings SET image = $1 WHERE id = $2`, [
            placeholderUrl,
            row.id,
          ]);
        }
      }
      placeholders += 1;
    }

    console.log(
      `[cloudinary-restore] done restored=${restored} placeholders=${placeholders} kept=${kept}`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[cloudinary-restore] FAILED:", err.message || err);
  process.exit(1);
});
