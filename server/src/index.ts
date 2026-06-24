import "../load-env.js";
import cors from "cors";
import express from "express";
import { pool } from "./db.js";
import { hasAgentAiKey, resolveGeminiApiKey } from "./load-env.js";
import { runMigrations } from "./migrate.js";
import { seedIfEmpty } from "./seed-runtime.js";
import { apiRouter } from "./routes/api.js";
import { aiRouter } from "./routes/ai.js";
import { vautoServerRouter } from "./routes/vauto-server.js";
import { vautoAgentRouter } from "./routes/vauto-agent.js";
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
app.use(express.json({ limit: "25mb" }));
app.use(optionalAuth);

app.use("/api/auth", authRouter);
app.use("/api/push", pushRouter);
app.use("/api", apiRouter);
app.use("/api/ai", aiRouter);
app.use("/api/vauto-server", vautoServerRouter);
app.use("/api/vauto-agent", vautoAgentRouter);
app.use("/api/billing", billingRouter);

app.use(
  (
    err: Error & { type?: string; status?: number },
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (err.type === "entity.too.large") {
      res.status(413).json({
        ok: false,
        code: "payload_too_large",
        error:
          "Užklausa per didelė. Sutrumpinkite žinutę arba pokalbio istoriją.",
      });
      return;
    }
    next(err);
  }
);

app.listen(port, async () => {
  try {
    await pool.query("SELECT 1");
    await runMigrations();
    await seedIfEmpty();
    const { backfillListingEmbeddings } = await import(
      "./ai/listing-embedding.js"
    );
    void backfillListingEmbeddings(50).then((n) => {
      if (n > 0) console.log(`Embedding backfill: ${n} listings`);
    });
    const { backfillImageEmbeddings } = await import(
      "./ai/image-embedding.js"
    );
    void backfillImageEmbeddings(50).then((n) => {
      if (n > 0) console.log(`Image embedding backfill: ${n} listings`);
    });
    const { runStripeBootstrap } = await import("./billing/ensure-stripe.js");
    void runStripeBootstrap();
    const gemini = Boolean(resolveGeminiApiKey());
    console.log(
      `Vauto API http://localhost:${port} (PostgreSQL OK) — Gemini agent: ${gemini}`
    );
  } catch {
    console.warn(
      `Vauto API http://localhost:${port} — PostgreSQL nepasiekiamas. Paleiskite: docker compose up -d`
    );
  }
});
