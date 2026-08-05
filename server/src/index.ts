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
import { paymentMethodsRouter } from "./routes/payment-methods.js";
import { growthRouter } from "./routes/growth.js";
import { shippingRouter } from "./routes/shipping.js";
import { authRouter } from "./routes/auth.js";
import { pushRouter } from "./routes/push.js";
import { searchRouter } from "./routes/search.js";
import { ogRouter } from "./routes/og.js";
import { optionalAuth, requireAuth } from "./middleware/auth.js";
import { aiRateLimiter, actionRateLimiter, apiRateLimiter, authRateLimiter, searchRateLimiter } from "./middleware/rate-limit.js";
import { assertProductionEnv } from "./env-check.js";
import { silenceProductionConsole } from "./lib/dev-log.js";

silenceProductionConsole();
assertProductionEnv();

const app = express();
const port = Number(process.env.PORT ?? 4000);

const isProd = process.env.NODE_ENV === "production";
const corsAllowlist = new Set(
  [
    "https://vauto.lt",
    "https://www.vauto.lt",
    process.env.APP_ORIGIN?.replace(/\/+$/, ""),
    process.env.CORS_ORIGIN?.replace(/\/+$/, ""),
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, "")}`
      : "",
    ...String(process.env.CORS_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter(Boolean),
    ...(!isProd
      ? [
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "http://localhost:4173",
          "http://127.0.0.1:4173",
        ]
      : []),
  ].filter(Boolean)
);

app.use(
  cors({
    origin(origin, callback) {
      // Non-browser / same-origin tools (no Origin header).
      if (!origin) {
        callback(null, true);
        return;
      }
      if (corsAllowlist.has(origin.replace(/\/+$/, ""))) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  })
);
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

/**
 * OG Edge — bot-facing HTML for social crawlers (FB/TG/WA/Viber).
 * Mounted outside /api so Vercel can rewrite www.vauto.lt/listing/* UA matches here.
 * Must be registered before the SPA catch-all redirect below.
 */
app.use("/og", ogRouter);
/**
 * Default JSON body: 512kb. Vision / agent routes get 12mb (Base64 photos).
 * Override with JSON_BODY_LIMIT / AI_JSON_BODY_LIMIT only for emergency capacity.
 */
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT?.trim() || "512kb";
const AI_JSON_BODY_LIMIT = process.env.AI_JSON_BODY_LIMIT?.trim() || "12mb";
const largeJsonParser = express.json({ limit: AI_JSON_BODY_LIMIT });
const defaultJsonParser = express.json({ limit: JSON_BODY_LIMIT });
const largeUrlencoded = express.urlencoded({
  limit: AI_JSON_BODY_LIMIT,
  extended: true,
});
const defaultUrlencoded = express.urlencoded({
  limit: JSON_BODY_LIMIT,
  extended: true,
});

function needsLargeJsonBody(path: string): boolean {
  return (
    path.startsWith("/api/ai") ||
    path.startsWith("/api/vauto-agent") ||
    path.startsWith("/api/vauto-server") ||
    path.startsWith("/api/search/vision")
  );
}

app.use((req, res, next) => {
  if (needsLargeJsonBody(req.path)) {
    return largeJsonParser(req, res, next);
  }
  return defaultJsonParser(req, res, next);
});
app.use((req, res, next) => {
  if (needsLargeJsonBody(req.path)) {
    return largeUrlencoded(req, res, next);
  }
  return defaultUrlencoded(req, res, next);
});
app.use(optionalAuth);
app.use("/api/search", searchRateLimiter, searchRouter);
/** Legacy vision search is Gemini-heavy — apply AI tier before general API limiter. */
app.use("/api/search/vision", aiRateLimiter);
app.use("/api/user/avatar", actionRateLimiter);
app.use("/api", apiRateLimiter);

app.use("/api/auth", authRateLimiter, authRouter);
app.use("/api/push", pushRouter);
app.use("/api", apiRouter);
app.use("/api/ai", aiRateLimiter, aiRouter);
app.use("/api/vauto-server", aiRateLimiter, requireAuth, vautoServerRouter);
/** Stage 0 cost abuse: agent requires JWT (guest text spend closed). */
app.use("/api/vauto-agent", aiRateLimiter, requireAuth, vautoAgentRouter);
app.use("/api/billing", billingRouter);
app.use("/api/escrow-billing", escrowBillingRouter);
app.use("/api/payment-methods", paymentMethodsRouter);
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
    if (req.path.startsWith("/api/") || req.path.startsWith("/og/")) {
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
    if (req.path.startsWith("/api/") || req.path.startsWith("/og/")) {
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
      error: "Internal server error",
    });
  }
);

app.listen(port, async () => {
  // Bind first — Render health checks the open port. DB work must never
  // process.exit(1) here: a lagging migrate would crash-loop the deploy.
  console.log(`VAUTO API http://localhost:${port} — starting DB bootstrap…`);

  try {
    await pool.query("SELECT 1");
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.warn(
      `PostgreSQL nepasiekiamas (${detail}). API klausosi be DB — paleiskite: docker compose up -d`
    );
    return;
  }

  try {
    await runMigrations();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(
      `[migrate] Failed — server stays up; payment gates fail-open until schema catches up: ${detail}`
    );
  }

  try {
    await seedIfEmpty();
  } catch (e) {
    console.error("[seed] Failed:", e instanceof Error ? e.message : String(e));
  }

  try {
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
  } catch (e) {
    console.error(
      "[bootstrap] Optional startup tasks failed:",
      e instanceof Error ? e.message : String(e)
    );
  }

  const gemini = Boolean(resolveGeminiApiKey());
  console.log(
    `VAUTO API http://localhost:${port} (PostgreSQL OK) — Gemini agent: ${gemini}`
  );
});
