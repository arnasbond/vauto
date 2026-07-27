#!/usr/bin/env node
/**
 * Elevate a production user to super_admin by nickname/name match.
 *
 *   RENDER_API_KEY=… node scripts/elevate-admin-user.mjs --nickname=arnas
 *   DATABASE_URL=… node scripts/elevate-admin-user.mjs --nickname=arnas --apply
 *
 * Default is dry-run (SELECT only). Pass --apply to UPDATE.
 */
import { createRequire } from "module";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../server/package.json"));
const { Client } = require("pg");

function argValue(flag) {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : null;
}

const nickname = (argValue("--nickname") || "arnas").trim().toLowerCase();
const apply = process.argv.includes("--apply");

async function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  if (!process.env.RENDER_API_KEY) {
    throw new Error("Set DATABASE_URL or RENDER_API_KEY");
  }
  const script = path.join(__dirname, "resolve-render-database-url.mjs");
  const result = spawnSync(process.execPath, [script, "--print"], {
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to resolve DATABASE_URL");
  }
  const url = result.stdout.trim();
  if (!url.startsWith("postgres")) {
    throw new Error("resolve-render-database-url did not return a postgres URL");
  }
  return url;
}

async function main() {
  const databaseUrl = await resolveDatabaseUrl();
  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("render.com")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  await client.connect();
  try {
    const preview = await client.query(
      `SELECT id, name, nickname, first_name, email, role
       FROM users
       WHERE lower(coalesce(nickname, '')) = $1
          OR lower(coalesce(name, '')) = $1
          OR lower(coalesce(first_name, '')) = $1
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 20`,
      [nickname]
    );
    console.log(`Matched ${preview.rowCount} user(s) for "${nickname}":`);
    for (const row of preview.rows) {
      console.log(
        `  ${row.id} | name=${row.name ?? ""} | nick=${row.nickname ?? ""} | first=${row.first_name ?? ""} | email=${row.email ?? ""} | role=${row.role}`
      );
    }
    if (!apply) {
      console.log("Dry-run only. Re-run with --apply to set role=super_admin.");
      return;
    }
    if (preview.rowCount === 0) {
      console.error("No matching users — aborting.");
      process.exitCode = 1;
      return;
    }
    const updated = await client.query(
      `UPDATE users
       SET role = 'super_admin', updated_at = now()
       WHERE lower(coalesce(nickname, '')) = $1
          OR lower(coalesce(name, '')) = $1
          OR lower(coalesce(first_name, '')) = $1
       RETURNING id, name, nickname, first_name, email, role`,
      [nickname]
    );
    console.log(`Updated ${updated.rowCount} user(s):`);
    for (const row of updated.rows) {
      console.log(
        `  ${row.id} | nick=${row.nickname ?? ""} | email=${row.email ?? ""} | role=${row.role}`
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
