import "dotenv/config";
import { pool } from "./db.js";
import { runMigrations } from "./migrate.js";
import { seedIfEmpty } from "./seed-runtime.js";

async function seed() {
  await runMigrations();
  await seedIfEmpty();
  console.log("Seed complete");
  await pool.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
