#!/usr/bin/env node
/**
 * Stage 16C — apply the full SQL chain on a disposable Postgres database.
 * Requires TEST_DATABASE_URL (CI postgres service). Drops the temp DB after.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "server", "package.json"));
const { Client } = require("pg");

const base = process.env.TEST_DATABASE_URL?.trim();
if (!base) {
  console.error("TEST_DATABASE_URL required");
  process.exit(1);
}

const name = `vauto_m16_${Date.now()}`;
const admin = new Client({ connectionString: base });
const files = readdirSync(path.join(root, "server", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

function dbUrl(dbName) {
  const u = new URL(base.replace(/^postgres(ql)?:/, "http:"));
  u.pathname = `/${dbName}`;
  return u.toString().replace(/^http:/, "postgres:");
}

async function applyAll(connectionString) {
  const c = new Client({ connectionString });
  await c.connect();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const applied = [];
    for (const file of files) {
      const { rows } = await c.query(
        "SELECT filename FROM schema_migrations WHERE filename = $1",
        [file]
      );
      if (rows.length) continue;
      const sql = readFileSync(
        path.join(root, "server", "migrations", file),
        "utf8"
      ).replace(/^\uFEFF/, "");
      await c.query("BEGIN");
      try {
        await c.query(sql);
        await c.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
          file,
        ]);
        await c.query("COMMIT");
        applied.push(file);
      } catch (e) {
        await c.query("ROLLBACK");
        throw new Error(`${file}: ${e.message || e}`);
      }
    }
    return applied;
  } finally {
    await c.end();
  }
}

await admin.connect();
try {
  await admin.query(`CREATE DATABASE ${name}`);
} finally {
  await admin.end();
}

const url = dbUrl(name);
try {
  const first = await applyAll(url);
  const second = await applyAll(url);
  console.log("FROM_ZERO_FIRST=" + first.length);
  console.log("FROM_ZERO_SECOND=" + second.length);
  console.log("LATEST=" + files.at(-1));
  if (first.length !== files.length) {
    throw new Error(`expected ${files.length} first-pass applies, got ${first.length}`);
  }
  if (second.length !== 0) {
    throw new Error(`second pass not deterministic: ${second.join(",")}`);
  }
  console.log("MIGRATE_FROM_ZERO=ok");
} finally {
  const drop = new Client({ connectionString: base });
  await drop.connect();
  try {
    await drop.query(`DROP DATABASE IF EXISTS ${name}`);
  } finally {
    await drop.end();
  }
}
