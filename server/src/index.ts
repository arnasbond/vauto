import "dotenv/config";
import cors from "cors";
import express from "express";
import { pool } from "./db.js";
import { runMigrations } from "./migrate.js";
import { seedIfEmpty } from "./seed-runtime.js";
import { apiRouter } from "./routes/api.js";
import { aiRouter } from "./routes/ai.js";
import { billingRouter, handleStripeWebhook } from "./routes/billing.js";
import { authRouter } from "./routes/auth.js";
import { pushRouter } from "./routes/push.js";
import { optionalAuth } from "./middleware/auth.js";
import { assertProductionEnv } from "./env-check.js";

assertProductionEnv();

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors({ origin: true }));
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);
app.use(express.json({ limit: "15mb" }));
app.use(optionalAuth);

app.use("/api/auth", authRouter);
app.use("/api/push", pushRouter);
app.use("/api", apiRouter);
app.use("/api/ai", aiRouter);
app.use("/api/billing", billingRouter);

app.listen(port, async () => {
  try {
    await pool.query("SELECT 1");
    await runMigrations();
    await seedIfEmpty();
    const { backfillListingEmbeddings } = await import(
      "./ai/listing-embedding.js"
    );
    void backfillListingEmbeddings(30).then((n) => {
      if (n > 0) console.log(`Embedding backfill: ${n} listings`);
    });
    const { backfillImageEmbeddings } = await import(
      "./ai/image-embedding.js"
    );
    void backfillImageEmbeddings(15).then((n) => {
      if (n > 0) console.log(`Image embedding backfill: ${n} listings`);
    });
    console.log(`Vauto API http://localhost:${port} (PostgreSQL OK)`);
  } catch {
    console.warn(
      `Vauto API http://localhost:${port} — PostgreSQL nepasiekiamas. Paleiskite: docker compose up -d`
    );
  }
});
