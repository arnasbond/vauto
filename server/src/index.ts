import fs from "node:fs";
import path from "node:path";
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
import { escrowBillingRouter } from "./routes/escrow-billing.js";
import { growthRouter } from "./routes/growth.js";
import { shippingRouter } from "./routes/shipping.js";
import { authRouter } from "./routes/auth.js";
import { pushRouter } from "./routes/push.js";
import { spintaRouter } from "./routes/spinta.js";
import { searchRouter } from "./routes/search.js";
import { optionalAuth } from "./middleware/auth.js";
import { aiRateLimiter, actionRateLimiter, apiRateLimiter, authRateLimiter, searchRateLimiter } from "./middleware/rate-limit.js";
import { assertProductionEnv } from "./env-check.js";

assertProductionEnv();

const app = express();
const port = Number(process.env.PORT ?? 4000);

// Reflect request Origin — sufficient for JWT Bearer (no cookies).
// For future .anonser.lt cookie sessions, switch to an explicit allowlist + credentials.
app.use(cors({ origin: true }));
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);
/**
 * Multi-photo agent uploads (up to 6× Base64 data URLs) need a large JSON body.
 * Client pre-resizes cars to ≤1600px / docs ≤1920px; keep 50mb headroom for bursts.
 */
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT?.trim() || "50mb";
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ limit: JSON_BODY_LIMIT, extended: true }));
app.use(optionalAuth);
app.use("/api/search", searchRateLimiter, searchRouter);
app.use("/api/spinta", actionRateLimiter, spintaRouter);
app.use("/api/user/avatar", actionRateLimiter);
app.use("/api", apiRateLimiter);

app.use("/api/auth", authRateLimiter, authRouter);
app.use("/api/push", pushRouter);
app.use("/api", apiRouter);
app.use("/api/ai", aiRateLimiter, aiRouter);
app.use("/api/vauto-server", aiRateLimiter, vautoServerRouter);
app.use("/api/vauto-agent", aiRateLimiter, vautoAgentRouter);
app.use("/api/billing", billingRouter);
app.use("/api/escrow-billing", escrowBillingRouter);
app.use("/api/growth", growthRouter);
app.use("/api/shipping", shippingRouter);

// --- Frontend hosting ------------------------------------------------------
// The Next.js UI is a static export (`output: "export"`) hosted on Vercel;
// this Express service is API-only under /api/*. Two safety nets so the root
// host never returns a bare "Cannot GET /":
//   1. If a built static bundle is present (STATIC_DIR or ./out), serve it —
//      this enables optional single-service hosting straight from Render.
//   2. Otherwise redirect non-API browser traffic to the real frontend origin
//      (APP_ORIGIN), so the site opens instead of erroring.
const staticDir = path.resolve(
  process.env.STATIC_DIR || path.join(process.cwd(), "out")
);
const hasStaticBundle = fs.existsSync(path.join(staticDir, "index.html"));
const frontendOrigin = (process.env.APP_ORIGIN ?? "").replace(/\/+$/, "");

if (hasStaticBundle) {
  app.use(express.static(staticDir, { extensions: ["html"] }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });
  console.log(`Static frontend served from ${staticDir}`);
} else if (frontendOrigin) {
  const frontendHost = (() => {
    try {
      return new URL(frontendOrigin).host.toLowerCase();
    } catch {
      return "";
    }
  })();
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    // Avoid a redirect loop if this host already IS the frontend origin.
    const host = req.headers.host?.toLowerCase();
    if (host && frontendHost && host === frontendHost) {
      next();
      return;
    }
    res.redirect(302, frontendOrigin + req.originalUrl);
  });
}

app.use(
  (
    err: Error & { type?: string; status?: number; limit?: number; length?: number },
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (err.type === "entity.too.large") {
      console.error(
        `[body] payload_too_large path=${req.path} limit=${err.limit ?? JSON_BODY_LIMIT} length=${err.length ?? "?"}`
      );
      res.status(413).json({
        ok: false,
        code: "payload_too_large",
        error:
          "Užklausa per didelė (nuotraukos). Palaukite kol nuotraukos įkeliamos į debesį arba sumažinkite failų dydį.",
        limit: JSON_BODY_LIMIT,
      });
      return;
    }
    if (res.headersSent) {
      next(err);
      return;
    }
    console.error(
      `[api] unhandled ${req.method} ${req.path}:`,
      err?.message || err
    );
    res.status(err.status && err.status >= 400 && err.status < 600 ? err.status : 500).json({
      ok: false,
      error: err?.message || "Internal Server Error",
    });
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
    const { startPortalSyncCron } = await import("./spinta/portal-sync-cron.js");
    startPortalSyncCron();
    const gemini = Boolean(resolveGeminiApiKey());
    console.log(
      `VAUTO API http://localhost:${port} (PostgreSQL OK) — Gemini agent: ${gemini}`
    );
  } catch {
    console.warn(
      `VAUTO API http://localhost:${port} — PostgreSQL nepasiekiamas. Paleiskite: docker compose up -d`
    );
  }
});
