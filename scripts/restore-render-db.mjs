#!/usr/bin/env node
/**
 * Restore VAUTO Postgres from a logical backup (.sql.gz / .sql / custom dump).
 *
 * Accepts a local backup file OR a directory containing artifact downloads
 * (vauto-*.sql.gz + optional vauto-*.meta.json).
 *
 * After restore: verifies public table list + row counts against meta (when present).
 *
 * Usage:
 *   DATABASE_URL=postgres://… node scripts/restore-render-db.mjs --file backups/vauto-….sql.gz --confirm RESTORE
 *   RENDER_API_KEY=rnd_… node scripts/restore-render-db.mjs --file backups/vauto-….sql.gz --confirm RESTORE
 *   node scripts/restore-render-db.mjs --dir backups --confirm RESTORE
 *
 * Optional:
 *   --meta path/to/vauto-….meta.json
 *   --sha256 path/to/vauto-….sql.gz.sha256
 *   RESTORE_TARGET_DATABASE_URL  isolated temp DB (preferred over DATABASE_URL)
 *   --ensure-available   upgrade suspended free Postgres then wait (Render API)
 *   --skip-count-check   do not fail on row-count mismatch
 */
import { spawnSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createGunzip } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pipeline } from "node:stream/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return null;
  return process.argv[i + 1] ?? null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

const confirm = argValue("--confirm") || process.env.RESTORE_CONFIRM || "";
const skipCountCheck =
  hasFlag("--skip-count-check") || process.env.SKIP_COUNT_CHECK === "1";
const ensureAvailable =
  hasFlag("--ensure-available") ||
  process.env.ENSURE_DB_AVAILABLE === "1" ||
  process.env.ENSURE_DB_AVAILABLE === "true";

if (confirm !== "RESTORE") {
  console.error(
    "[restore-db] Refusing to run without --confirm RESTORE (destructive)."
  );
  process.exit(1);
}

function resolveDatabaseUrl() {
  // Isolated staging/temp DB for restore-before-cutover (H-02).
  const target = process.env.RESTORE_TARGET_DATABASE_URL?.trim();
  if (target) {
    if (!target.startsWith("postgres")) {
      throw new Error(
        `RESTORE_TARGET_DATABASE_URL must be postgres://… (got ${target.slice(0, 40)})`
      );
    }
    console.log(
      "[restore-db] Using RESTORE_TARGET_DATABASE_URL (isolated target)"
    );
    return target;
  }
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  if (!process.env.RENDER_API_KEY?.trim()) {
    throw new Error(
      "Set RESTORE_TARGET_DATABASE_URL, DATABASE_URL, or RENDER_API_KEY"
    );
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

function withSsl(connectionString) {
  const isLocal =
    /localhost|127\.0\.0\.1/i.test(connectionString) ||
    connectionString.includes("@postgres:");
  if (isLocal || /[?&]sslmode=/i.test(connectionString)) return connectionString;
  return connectionString.includes("?")
    ? `${connectionString}&sslmode=require`
    : `${connectionString}?sslmode=require`;
}

function findBin(names) {
  for (const bin of names) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return bin;
  }
  return null;
}

function pickBackupFromDir(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`Backup dir not found: ${dir}`);
  }
  const files = readdirSync(dir)
    .filter((f) => /\.sql\.gz$/i.test(f) || /\.sql$/i.test(f) || /\.dump$/i.test(f))
    .map((f) => path.join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!files.length) {
    throw new Error(`No .sql.gz / .sql / .dump in ${dir}`);
  }
  const file = files[0];
  const base = file.replace(/\.sql\.gz$/i, "").replace(/\.sql$/i, "").replace(/\.dump$/i, "");
  const metaCand = `${base}.meta.json`;
  const shaCand = `${file}.sha256`;
  return {
    file,
    meta: existsSync(metaCand) ? metaCand : null,
    sha256: existsSync(shaCand) ? shaCand : null,
  };
}

function resolveInputs() {
  const fileArg = argValue("--file") || process.env.BACKUP_FILE || "";
  const dirArg = argValue("--dir") || process.env.BACKUP_DIR || "";
  const metaArg = argValue("--meta") || process.env.BACKUP_META || "";
  const shaArg = argValue("--sha256") || process.env.BACKUP_SHA256 || "";

  if (fileArg) {
    if (!existsSync(fileArg)) throw new Error(`Backup file not found: ${fileArg}`);
    let meta = metaArg || null;
    if (!meta) {
      const guess = fileArg
        .replace(/\.sql\.gz$/i, ".meta.json")
        .replace(/\.sql$/i, ".meta.json")
        .replace(/\.dump$/i, ".meta.json");
      if (existsSync(guess)) meta = guess;
    }
    let sha256 = shaArg || null;
    if (!sha256) {
      const guessSha = `${fileArg}.sha256`;
      if (existsSync(guessSha)) sha256 = guessSha;
    }
    return {
      file: path.resolve(fileArg),
      meta: meta ? path.resolve(meta) : null,
      sha256: sha256 ? path.resolve(sha256) : null,
    };
  }

  if (dirArg) {
    const picked = pickBackupFromDir(path.resolve(dirArg));
    return {
      file: picked.file,
      meta: metaArg ? path.resolve(metaArg) : picked.meta,
      sha256: shaArg ? path.resolve(shaArg) : picked.sha256,
    };
  }

  // Default: ./backups from artifact download
  const defaultDir = path.join(root, "backups");
  if (existsSync(defaultDir)) {
    const picked = pickBackupFromDir(defaultDir);
    return {
      file: picked.file,
      meta: metaArg ? path.resolve(metaArg) : picked.meta,
      sha256: shaArg ? path.resolve(shaArg) : picked.sha256,
    };
  }

  throw new Error(
    "Provide --file <backup.sql.gz> or --dir <artifact-dir> (or place files in ./backups)"
  );
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

function parseSha256Sidecar(sidecarPath) {
  const raw = readFileSync(sidecarPath, "utf8").trim();
  const hex = (raw.split(/\s+/)[0] || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hex)) {
    throw new Error(`Invalid SHA-256 sidecar format: ${sidecarPath}`);
  }
  return hex;
}

async function verifyBackupIntegrity(file, sha256Path) {
  if (!sha256Path || !existsSync(sha256Path)) {
    throw new Error(
      `[restore-db] Missing SHA-256 sidecar for ${path.basename(file)} — refuse restore (expected ${path.basename(file)}.sha256)`
    );
  }
  const expected = parseSha256Sidecar(sha256Path);
  const actual = await sha256File(file);
  if (expected !== actual) {
    throw new Error(
      `[restore-db] SHA-256 mismatch for ${path.basename(file)}\n  expected=${expected}\n  actual=  ${actual}`
    );
  }
  console.log(`[restore-db] ✓ SHA-256 OK (${actual.slice(0, 16)}…)`);
}

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Unsafe table name: ${name}`);
  }
  return `"${name}"`;
}

async function collectCounts(connectionString) {
  const require = createRequire(path.join(root, "server", "package.json"));
  const { Client } = require("pg");
  const isLocal =
    /localhost|127\.0\.0\.1/i.test(connectionString) ||
    connectionString.includes("@postgres:");
  const client = new Client({
    connectionString: withSsl(connectionString),
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const tables = (
      await client.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name`
      )
    ).rows.map((r) => r.table_name);

    const counts = {};
    for (const table of tables) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS c FROM ${quoteIdent(table)}`
      );
      counts[table] = rows[0]?.c ?? 0;
    }
    return { tables, counts };
  } finally {
    await client.end();
  }
}

async function ensurePostgresAvailable() {
  const KEY = process.env.RENDER_API_KEY?.trim();
  if (!KEY) throw new Error("--ensure-available requires RENDER_API_KEY");
  const API = "https://api.render.com/v1";
  const DB_NAME = process.env.RENDER_DB_NAME || "vauto-db";
  const PLAN = process.env.RENDER_POSTGRES_PLAN || "basic_256mb";
  const SERVICE_ID =
    process.env.RENDER_SERVICE_ID || "srv-d8q3fk6q1p3s739fd9h0";

  async function api(p, opts = {}) {
    const res = await fetch(`${API}${p}`, {
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
      throw new Error(
        `${opts.method || "GET"} ${p} → ${res.status}: ${
          typeof body === "object" ? body?.message || text : text
        }`
      );
    }
    return body;
  }

  const unwrap = (row) =>
    row?.service || row?.postgres || row?.deploy || row?.envVar || row?.owner || row;

  async function list(p) {
    const out = [];
    let cursor;
    do {
      const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const page = await api(`${p}${q}`);
      if (Array.isArray(page)) out.push(...page);
      else if (page?.items) out.push(...page.items);
      cursor = page?.cursor;
    } while (cursor);
    return out;
  }

  const owners = await list("/owners");
  if (!owners.length) throw new Error("No Render workspace found");
  const ownerId = unwrap(owners[0]).id;
  const dbs = await list(`/postgres?ownerId=${ownerId}`);
  const db = dbs.map(unwrap).find((p) => p.name === DB_NAME);
  if (!db) throw new Error(`Postgres ${DB_NAME} not found`);

  console.log(
    `[restore-db] ensure-available: ${db.name} status=${db.status} suspended=${db.suspended} plan=${db.plan}`
  );

  if (
    db.plan === "free" ||
    db.status === "suspended" ||
    db.suspended === "suspended"
  ) {
    console.log(`[restore-db] Upgrading Postgres to plan=${PLAN}…`);
    await api(`/postgres/${db.id}`, {
      method: "PATCH",
      body: JSON.stringify({ plan: PLAN }),
    });
  }

  for (let i = 0; i < 120; i++) {
    const p = unwrap(await api(`/postgres/${db.id}`));
    console.log(
      `  DB status=${p.status} suspended=${p.suspended} plan=${p.plan}`
    );
    if (p.status === "available" && p.suspended === "not_suspended") {
      const info = await api(`/postgres/${db.id}/connection-info`);
      const url = info.internalConnectionString || info.connectionString;
      if (url) {
        // Never point production API at an isolated restore target.
        if (process.env.RESTORE_TARGET_DATABASE_URL?.trim()) {
          console.log(
            "[restore-db] Skipping service DATABASE_URL update (isolated RESTORE_TARGET_DATABASE_URL)"
          );
        } else {
          await api(`/services/${SERVICE_ID}/env-vars/DATABASE_URL`, {
            method: "PUT",
            body: JSON.stringify({ value: url }),
          });
          console.log("[restore-db] DATABASE_URL refreshed on API service");
        }
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error("Postgres did not become available in time");
}

async function restoreSqlGz(file, connectionString) {
  const psql = findBin(["psql", "psql.exe"]);
  if (!psql) throw new Error("psql not found — install PostgreSQL client tools");

  const cs = withSsl(connectionString);
  console.log(`[restore-db] Restoring plain SQL via ${psql}: ${file}`);

  const { spawn } = await import("node:child_process");
  await new Promise((resolve, reject) => {
    const proc = spawn(
      psql,
      [cs, "-v", "ON_ERROR_STOP=1", "--quiet"],
      {
        env: {
          ...process.env,
          PGSSLMODE: process.env.PGSSLMODE || "require",
        },
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    let stderr = "";
    let stdout = "";
    proc.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    proc.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        if (stdout.trim()) console.log(stdout.trim().slice(0, 500));
        resolve();
      } else {
        reject(
          new Error(
            `psql failed (${code}): ${(stderr || stdout).slice(0, 1200)}`
          )
        );
      }
    });
    const src = /\.gz$/i.test(file)
      ? createReadStream(file).pipe(createGunzip())
      : createReadStream(file);
    src.on("error", reject);
    src.pipe(proc.stdin);
  });
}

async function restoreCustomDump(file, connectionString) {
  const pgRestore = findBin(["pg_restore", "pg_restore.exe"]);
  if (!pgRestore) {
    throw new Error("pg_restore not found — install PostgreSQL client tools");
  }
  const cs = withSsl(connectionString);
  console.log(`[restore-db] Restoring custom dump via ${pgRestore}: ${file}`);
  const r = spawnSync(
    pgRestore,
    [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-acl",
      `--dbname=${cs}`,
      file,
    ],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        PGSSLMODE: process.env.PGSSLMODE || "require",
      },
    }
  );
  // Fail-closed: any non-zero exit is fatal (no exit-1 soft-pass).
  if (r.status !== 0) {
    throw new Error(
      `pg_restore failed (${r.status}): ${(r.stderr || r.stdout || "").slice(0, 1200)}`
    );
  }
  if (r.stderr?.trim()) {
    console.warn(`[restore-db] pg_restore stderr:\n${r.stderr.slice(0, 800)}`);
  }
}

function verifyCounts(actual, meta) {
  const expectedTables = meta.tables || Object.keys(meta.counts || {});
  const expectedCounts = meta.counts || {};
  const missing = expectedTables.filter((t) => !actual.tables.includes(t));
  const mismatches = [];

  for (const [table, expected] of Object.entries(expectedCounts)) {
    const got = actual.counts[table];
    if (got === undefined) {
      mismatches.push({ table, expected, got: null, reason: "missing_table" });
      continue;
    }
    if (Number(got) !== Number(expected)) {
      mismatches.push({ table, expected: Number(expected), got: Number(got) });
    }
  }

  console.log(
    `[restore-db] verify tables actual=${actual.tables.length} expected=${expectedTables.length}`
  );
  console.log(
    `[restore-db] sample counts listings=${actual.counts.listings ?? "?"} users=${actual.counts.users ?? "?"}`
  );

  if (missing.length) {
    console.error(`[restore-db] Missing tables after restore: ${missing.join(", ")}`);
  }
  if (mismatches.length) {
    console.error(
      `[restore-db] Row-count mismatches (${mismatches.length}):`,
      JSON.stringify(mismatches.slice(0, 30), null, 2)
    );
  }

  // Critical: never accept empty core tables when backup had data.
  for (const core of ["listings", "users"]) {
    const exp = Number(expectedCounts[core] ?? 0);
    const got = Number(actual.counts[core] ?? 0);
    if (exp > 0 && got === 0) {
      throw new Error(
        `[restore-db] CRITICAL: ${core} expected ${exp} rows, got 0 after restore`
      );
    }
  }

  if ((missing.length || mismatches.length) && !skipCountCheck) {
    throw new Error(
      `[restore-db] Count verification failed (missing=${missing.length} mismatches=${mismatches.length}). Re-run with --skip-count-check only if intentional.`
    );
  }

  if (skipCountCheck && (missing.length || mismatches.length)) {
    console.warn("[restore-db] Count check skipped via --skip-count-check");
  } else {
    console.log("[restore-db] ✓ Table/row count verification passed");
  }
}

async function main() {
  const { file, meta: metaPath, sha256: shaPath } = resolveInputs();
  console.log(`[restore-db] backup=${file}`);
  if (metaPath) console.log(`[restore-db] meta=${metaPath}`);
  if (shaPath) console.log(`[restore-db] sha256=${shaPath}`);

  // Integrity BEFORE any DB operation (upgrade or restore).
  await verifyBackupIntegrity(file, shaPath);

  if (ensureAvailable) {
    await ensurePostgresAvailable();
  }

  const connectionString = resolveDatabaseUrl();
  console.log("[restore-db] target DATABASE_URL resolved");

  const lower = file.toLowerCase();
  if (lower.endsWith(".dump") || lower.endsWith(".backup")) {
    await restoreCustomDump(file, connectionString);
  } else if (lower.endsWith(".sql.gz") || lower.endsWith(".sql")) {
    await restoreSqlGz(file, connectionString);
  } else {
    throw new Error(`Unsupported backup format: ${file}`);
  }

  const actual = await collectCounts(connectionString);
  console.log(
    `[restore-db] post-restore: ${actual.tables.length} tables, listings=${actual.counts.listings ?? "?"}`
  );

  if (metaPath && existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    verifyCounts(actual, meta);
  } else {
    console.warn(
      "[restore-db] No meta.json — verifying non-empty schema only"
    );
    if (!actual.tables.length) {
      throw new Error("[restore-db] No public tables after restore");
    }
    console.log("[restore-db] ✓ Schema present (no meta for exact counts)");
  }

  console.log("[restore-db] done");
}

main().catch((err) => {
  console.error("[restore-db] FAILED:", err.message || err);
  process.exit(1);
});
