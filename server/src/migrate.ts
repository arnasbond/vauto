import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  const migrationPath = join(
    __dirname,
    "../../database/migrations/002_trust_geo_moderation.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");
  await pool.query(sql);
}
