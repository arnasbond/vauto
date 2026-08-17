#!/usr/bin/env node
/**
 * READ-ONLY production schema_migrations probe.
 * Prints filenames + applied_at only. No user rows. No writes.
 *
 *   RENDER_API_KEY=… node scripts/check-schema-migrations.mjs
 *   DATABASE_URL=postgres://… node scripts/check-schema-migrations.mjs
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "server", "package.json"));
const { Client } = require("pg");

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
    throw new Error("Unexpected DATABASE_URL");
  }
  return url;
}

const expected = readdirSync(path.join(root, "server", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const connectionString = resolveDatabaseUrl();
const isLocal =
  /localhost|127\.0\.0\.1/i.test(connectionString) ||
  connectionString.includes("@postgres:");
let cs = connectionString;
if (!isLocal && !/[?&]sslmode=/i.test(cs)) {
  cs += cs.includes("?") ? "&sslmode=require" : "?sslmode=require";
}

const client = new Client({
  connectionString: cs,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});
await client.connect();
try {
  const { rows } = await client.query(
    "SELECT filename, applied_at FROM schema_migrations ORDER BY filename"
  );
  const applied = rows.map((r) => r.filename);
  const pending = expected.filter((f) => !applied.includes(f));
  console.log("EXPECTED_COUNT=" + expected.length);
  console.log("APPLIED_COUNT=" + applied.length);
  console.log("LATEST_APPLIED=" + (applied.at(-1) || ""));
  console.log("PENDING_COUNT=" + pending.length);
  console.log("APPLIED=" + applied.join(","));
  console.log("PENDING=" + pending.join(","));
  console.log("UP_TO_DATE=" + (pending.length === 0 ? "yes" : "no"));
} finally {
  await client.end();
}
