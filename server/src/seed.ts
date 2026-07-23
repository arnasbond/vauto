import "dotenv/config";
import { pool } from "./db.js";
import { runMigrations } from "./migrate.js";
import { seedIfEmpty } from "./seed-runtime.js";

async function seed() {
  // Explicit `npm run seed` always wants the mock catalog locally.
  if (!process.env.SEED_DEMO_CATALOG?.trim()) {
    process.env.SEED_DEMO_CATALOG = "1";
  }
  await runMigrations();
  await seedIfEmpty();
  console.log("Seed complete");
  await pool.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
