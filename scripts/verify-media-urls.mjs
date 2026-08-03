#!/usr/bin/env node
/**
 * Verify listing media URLs are durable absolute http(s) links (Cloudinary/CDN),
 * not ephemeral data: URLs or stock Unsplash images that vanish on code deploy.
 *
 * Media files live on Cloudinary — deploys never delete them. Only DB pointers matter.
 *
 *   DATABASE_URL=… node scripts/verify-media-urls.mjs
 *   RENDER_API_KEY=… node scripts/verify-media-urls.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

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
  return r.stdout.trim();
}

async function main() {
  let connectionString = resolveDatabaseUrl();
  const isLocal =
    /localhost|127\.0\.0\.1/i.test(connectionString) ||
    connectionString.includes("@postgres:");
  if (!isLocal && !/[?&]sslmode=/i.test(connectionString)) {
    connectionString += connectionString.includes("?")
      ? "&sslmode=require"
      : "?sslmode=require";
  }

  const require = createRequire(path.join(root, "server", "package.json"));
  const { Client } = require("pg");
  const client = new Client({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT id, title, image
       FROM listings
       WHERE COALESCE(status, 'active') NOT IN ('deleted', 'archived')
       ORDER BY created_at DESC NULLS LAST
       LIMIT 5000`
    );

    const report = {
      total: rows.length,
      empty: 0,
      http: 0,
      cloudinary: 0,
      placeholder: 0,
      dataUrl: 0,
      stock: 0,
      relativeOrOther: 0,
      samples: [],
    };

    for (const row of rows) {
      const img = String(row.image || "").trim();
      let kind = "empty";
      if (!img) {
        report.empty += 1;
        kind = "empty";
      } else if (img.startsWith("data:")) {
        report.dataUrl += 1;
        kind = "dataUrl";
      } else if (/unsplash\.com|picsum\.photos/i.test(img)) {
        report.stock += 1;
        kind = "stock";
      } else if (/listing-placeholder/i.test(img)) {
        report.placeholder += 1;
        report.http += 1;
        if (/cloudinary/i.test(img)) report.cloudinary += 1;
        kind = "placeholder";
      } else if (/^https?:\/\//i.test(img)) {
        report.http += 1;
        if (/res\.cloudinary\.com/i.test(img)) report.cloudinary += 1;
        kind = "http";
      } else {
        report.relativeOrOther += 1;
        kind = "other";
      }
      if (report.samples.length < 15) {
        report.samples.push({
          id: row.id,
          title: String(row.title || "").slice(0, 40),
          kind,
          image: img.slice(0, 100),
        });
      }
    }

    console.log(JSON.stringify(report, null, 2));

    const bad = report.dataUrl + report.stock + report.relativeOrOther;
    if (bad > 0) {
      console.error(
        `[verify-media] WARN: ${bad} listing(s) have non-durable covers (dataUrl/stock/relative)`
      );
      process.exit(2);
    }
    console.error(
      `[verify-media] OK: ${report.http}/${report.total} http(s) covers (${report.cloudinary} cloudinary, ${report.placeholder} placeholders)`
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("[verify-media] FAILED:", e.message || e);
  process.exit(1);
});
