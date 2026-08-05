#!/usr/bin/env node
/**
 * Full logical Postgres dump for VAUTO disaster recovery.
 *
 * Produces:
 *   backups/vauto-<stamp>.sql.gz        — pg_dump (plain SQL, gzipped)
 *   backups/vauto-<stamp>.sql.gz.sha256 — SHA-256 of the dump (integrity)
 *   backups/vauto-<stamp>.meta.json     — row counts + media URL inventory
 *
 * Usage:
 *   DATABASE_URL=postgres://… node scripts/backup-db.mjs
 *   RENDER_API_KEY=rnd_… node scripts/backup-db.mjs
 *   node scripts/backup-db.mjs --dry-run
 *
 * npm: npm run db:backup
 */
import { spawnSync } from "node:child_process";
import { createReadStream, createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createGzip } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const outDir =
  process.env.VAUTO_BACKUP_DIR?.trim() || path.join(root, "backups");

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

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").replace(/T/, "_").slice(0, 19);
}

function findPgDump() {
  const fromEnv = process.env.PG_DUMP_PATH?.trim();
  if (fromEnv) return fromEnv;
  const candidates = ["pg_dump", "pg_dump.exe"];
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return bin;
  }
  return null;
}

async function collectMeta(connectionString) {
  const require = createRequire(path.join(root, "server", "package.json"));
  const { Client } = require("pg");
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

    let mediaUrls = [];
    if (tables.includes("listings")) {
      const hasImage = (
        await client.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='listings' AND column_name='image'`
        )
      ).rows.length;
      if (hasImage) {
        const { rows } = await client.query(
          `SELECT id, title, image
           FROM listings
           WHERE image IS NOT NULL AND TRIM(image) <> ''
           ORDER BY created_at DESC NULLS LAST
           LIMIT 5000`
        );
        mediaUrls = rows.map((r) => ({
          listingId: r.id,
          title: String(r.title || "").slice(0, 80),
          image: r.image,
          host: safeHost(r.image),
          isHttp: /^https?:\/\//i.test(String(r.image || "")),
          isCloudinary: /res\.cloudinary\.com/i.test(String(r.image || "")),
          isDataUrl: String(r.image || "").startsWith("data:"),
          isStock: /unsplash\.com|picsum\.photos/i.test(String(r.image || "")),
        }));
      }
    }

    if (tables.includes("listing_media")) {
      const { rows } = await client.query(
        `SELECT listing_id, url FROM listing_media
         WHERE url IS NOT NULL AND TRIM(url) <> ''
         LIMIT 5000`
      );
      for (const r of rows) {
        mediaUrls.push({
          listingId: r.listing_id,
          title: "(listing_media)",
          image: r.url,
          host: safeHost(r.url),
          isHttp: /^https?:\/\//i.test(String(r.url || "")),
          isCloudinary: /res\.cloudinary\.com/i.test(String(r.url || "")),
          isDataUrl: String(r.url || "").startsWith("data:"),
          isStock: /unsplash\.com|picsum\.photos/i.test(String(r.url || "")),
        });
      }
    }

    const mediaSummary = {
      total: mediaUrls.length,
      http: mediaUrls.filter((m) => m.isHttp).length,
      cloudinary: mediaUrls.filter((m) => m.isCloudinary).length,
      dataUrl: mediaUrls.filter((m) => m.isDataUrl).length,
      stock: mediaUrls.filter((m) => m.isStock).length,
      nonHttp: mediaUrls.filter((m) => !m.isHttp && !m.isDataUrl).length,
    };

    return {
      createdAt: new Date().toISOString(),
      tables,
      counts,
      mediaSummary,
      mediaUrls,
    };
  } finally {
    await client.end();
  }
}

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Unsafe table name: ${name}`);
  }
  return `"${name}"`;
}

function safeHost(url) {
  try {
    return new URL(String(url)).host;
  } catch {
    return null;
  }
}

async function runDump(connectionString, sqlGzPath) {
  const pgDump = findPgDump();
  mkdirSync(path.dirname(sqlGzPath), { recursive: true });

  if (pgDump) {
    const child = spawnSync(
      pgDump,
      [
        "--no-owner",
        "--no-acl",
        "--clean",
        "--if-exists",
        "--format=plain",
        `--dbname=${connectionString}`,
      ],
      {
        encoding: "buffer",
        maxBuffer: 512 * 1024 * 1024,
        env: {
          ...process.env,
          PGSSLMODE: process.env.PGSSLMODE || "require",
        },
      }
    );

    if (child.status === 0) {
      const { Readable } = await import("node:stream");
      const gzip = createGzip({ level: 9 });
      const out = createWriteStream(sqlGzPath);
      await pipeline(Readable.from(child.stdout), gzip, out);
      return { method: "pg_dump", binary: pgDump };
    }

    const err = (child.stderr || child.stdout || Buffer.from("")).toString(
      "utf8"
    );
    if (!/version mismatch/i.test(err)) {
      throw new Error(`pg_dump failed (${child.status}): ${err.slice(0, 800)}`);
    }
    console.warn(
      `[backup-db] pg_dump version mismatch — falling back to node SQL export:\n${err.slice(0, 200)}`
    );
  } else {
    console.warn(
      "[backup-db] pg_dump not found — using node SQL export fallback"
    );
  }

  await runNodeSqlDump(connectionString, sqlGzPath);
  return { method: "node-sql", binary: null };
}

async function runNodeSqlDump(connectionString, sqlGzPath) {
  const require = createRequire(path.join(root, "server", "package.json"));
  const { Client } = require("pg");
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
    const tables = (
      await client.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name`
      )
    ).rows.map((r) => r.table_name);

    const chunks = [
      "-- VAUTO logical backup (node SQL fallback)\n",
      `-- createdAt ${new Date().toISOString()}\n`,
      "BEGIN;\n",
    ];

    for (const table of tables) {
      const ident = quoteIdent(table);
      chunks.push(`\n-- TABLE ${table}\n`);
      chunks.push(`DELETE FROM ${ident};\n`);
      const { rows } = await client.query(`SELECT * FROM ${ident}`);
      if (!rows.length) continue;
      const cols = Object.keys(rows[0]);
      const colList = cols.map(quoteIdent).join(", ");
      for (const row of rows) {
        const vals = cols
          .map((c) => sqlLiteral(row[c]))
          .join(", ");
        chunks.push(
          `INSERT INTO ${ident} (${colList}) VALUES (${vals});\n`
        );
      }
    }
    chunks.push("COMMIT;\n");

    const { Readable } = await import("node:stream");
    const gzip = createGzip({ level: 9 });
    const out = createWriteStream(sqlGzPath);
    await pipeline(Readable.from(Buffer.from(chunks.join(""), "utf8")), gzip, out);
  } finally {
    await client.end();
  }
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString("hex")}'`;
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

/** Write companion SHA-256 sidecar: `<file>.sha256` with `hex  basename`. */
async function writeSha256Sidecar(filePath) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  const hex = hash.digest("hex");
  const sidecar = `${filePath}.sha256`;
  writeFileSync(sidecar, `${hex}  ${path.basename(filePath)}\n`, "utf8");
  return { sidecar, hex };
}

async function main() {
  const connectionString = resolveDatabaseUrl();
  const id = stamp();
  const sqlGz = path.join(outDir, `vauto-${id}.sql.gz`);
  const metaPath = path.join(outDir, `vauto-${id}.meta.json`);

  console.log(`[backup-db] dryRun=${dryRun}`);
  console.log(`[backup-db] outDir=${outDir}`);

  const meta = await collectMeta(connectionString);
  console.log(
    `[backup-db] tables=${meta.tables.length} listings=${meta.counts.listings ?? "?"} users=${meta.counts.users ?? "?"}`
  );
  console.log(
    `[backup-db] media http=${meta.mediaSummary.http} cloudinary=${meta.mediaSummary.cloudinary} dataUrl=${meta.mediaSummary.dataUrl} stock=${meta.mediaSummary.stock}`
  );

  if (dryRun) {
    mkdirSync(outDir, { recursive: true });
    const dryPath = path.join(outDir, `vauto-${id}.meta.dry-run.json`);
    writeFileSync(
      dryPath,
      JSON.stringify(
        {
          ...meta,
          mediaUrls: meta.mediaUrls.slice(0, 20),
          note: "dry-run truncated mediaUrls",
        },
        null,
        2
      )
    );
    console.log(`[backup-db] dry-run — would write ${sqlGz}`);
    console.log(`[backup-db] dry-run meta sample → ${dryPath}`);
    return;
  }

  mkdirSync(outDir, { recursive: true });
  const dumpInfo = await runDump(connectionString, sqlGz);
  const { sidecar, hex } = await writeSha256Sidecar(sqlGz);
  writeFileSync(
    metaPath,
    JSON.stringify({ ...meta, dump: dumpInfo, sha256: hex }, null, 2)
  );

  console.log(`[backup-db] method=${dumpInfo.method} wrote ${sqlGz}`);
  console.log(`[backup-db] sha256=${hex} → ${sidecar}`);
  console.log(`[backup-db] wrote ${metaPath}`);
  console.log("[backup-db] done");
}

main().catch((err) => {
  console.error("[backup-db] FAILED:", err.message || err);
  process.exit(1);
});
