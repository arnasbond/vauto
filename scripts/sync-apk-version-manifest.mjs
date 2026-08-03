#!/usr/bin/env node
/**
 * Refresh apkSizeBytes in public/version-config.json via HEAD on downloadUrl.
 *
 *   node scripts/sync-apk-version-manifest.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "public", "version-config.json");

async function main() {
  const cfg = JSON.parse(readFileSync(file, "utf8"));
  const url = cfg.downloadUrl;
  if (!url) throw new Error("downloadUrl missing");

  const res = await fetch(url, { method: "HEAD", redirect: "follow" });
  if (!res.ok) throw new Error(`HEAD ${url} → ${res.status}`);
  const len = Number(res.headers.get("content-length"));
  if (!Number.isFinite(len) || len <= 0) {
    throw new Error("content-length missing");
  }

  cfg.apkSizeBytes = len;
  if (!cfg.downloadUrl.includes("vauto.lt")) {
    cfg.downloadUrl = "https://www.vauto.lt/download/vauto.apk";
  }
  writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
  console.log(`✓ apkSizeBytes=${len} (${(len / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
