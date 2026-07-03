#!/usr/bin/env node
/**
 * Critical server smoke tests — ops-secret, carrier contract, Gemini retry helpers.
 * Requires: npm run server:build
 */
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "server", "dist");

function distImport(...segments) {
  return import(pathToFileURL(join(dist, ...segments)).href);
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const { requireOpsSecret } = await distImport("middleware", "ops-secret.js");
const { SimulatedCarrierAdapter } = await distImport(
  "shipping",
  "providers",
  "carrier-adapters.js"
);
const { probeCarrierAdapter } = await distImport("shipping", "carrier-readiness.js");
const { AgentRouteError, isRetriableGeminiStatus } = await distImport(
  "ai",
  "agent-errors.js"
);

// --- ops-secret middleware ---
function mockRes() {
  const res = { statusCode: 200, body: null };
  return {
    status(code) {
      res.statusCode = code;
      return {
        json(payload) {
          res.body = payload;
          return res;
        },
      };
    },
    get result() {
      return res;
    },
  };
}

const prevEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
process.env.VAUTO_OPS_SECRET = "test-ops-secret";

const noHeaderReq = { headers: {} };
const noHeaderRes = mockRes();
let nextCalled = false;
requireOpsSecret(noHeaderReq, noHeaderRes, () => {
  nextCalled = true;
});
assert(noHeaderRes.result.statusCode === 403, "ops-secret rejects missing header in prod");
assert(!nextCalled, "ops-secret does not call next without header");

const goodReq = { headers: { "x-vauto-ops-secret": "test-ops-secret" } };
const goodRes = mockRes();
nextCalled = false;
requireOpsSecret(goodReq, goodRes, () => {
  nextCalled = true;
});
assert(nextCalled, "ops-secret allows valid header in prod");

delete process.env.VAUTO_OPS_SECRET;
const noSecretRes = mockRes();
nextCalled = false;
requireOpsSecret(goodReq, noSecretRes, () => {
  nextCalled = true;
});
assert(noSecretRes.result.statusCode === 404, "ops-secret returns 404 when secret unset");
assert(!nextCalled, "ops-secret does not call next when secret unset");

process.env.NODE_ENV = "development";
nextCalled = false;
requireOpsSecret(noHeaderReq, mockRes(), () => {
  nextCalled = true;
});
assert(nextCalled, "ops-secret bypasses in non-production");

process.env.NODE_ENV = prevEnv;

// --- carrier adapter contract ---
const adapter = new SimulatedCarrierAdapter("omniva");
const label = await adapter.createLabel({
  escrowId: "e2e-escrow",
  listingId: "listing-1",
  providerId: "omniva",
  lockerId: "locker-vilnius",
  lockerName: "Omniva Vilnius",
  parcelSize: "M",
});
assert(label.mode === "simulated", "simulated adapter returns mode=simulated");
assert(label.id.startsWith("OMN"), "simulated omniva label has OMN prefix");
assert(label.trackingCode === label.id, "trackingCode matches label id");
assert(label.qrPayload.includes("VAUTO-SHIP"), "qrPayload format valid");

const tracking = await adapter.getTrackingStatus(label.trackingCode);
assert(tracking.status === "label_created", "simulated tracking returns label_created");
assert(/simuliacija/i.test(tracking.summaryLt), "simulated tracking mentions simulation");

const probe = await probeCarrierAdapter("dpd");
assert(probe.ok, "carrier probe succeeds for dpd without keys");
assert(probe.label.mode === "simulated", "carrier probe uses simulated without keys");

// --- Gemini retry helper ---
assert(isRetriableGeminiStatus(503), "503 is retriable");
assert(isRetriableGeminiStatus(429), "429 is retriable");
assert(!isRetriableGeminiStatus(400), "400 is not retriable");

const geminiErr = new AgentRouteError("gemini_error", "high demand", 503, 503);
assert(geminiErr.geminiStatus === 503, "AgentRouteError stores geminiStatus");

// --- webhook idempotency module exists ---
const require = createRequire(import.meta.url);
const fs = await import("node:fs");
assert(
  fs.existsSync(join(root, "server", "dist", "billing", "webhook-idempotency.js")),
  "webhook-idempotency compiled"
);
assert(
  fs.existsSync(join(root, "server", "migrations", "022_stripe_webhook_events.sql")),
  "stripe webhook idempotency migration exists"
);

console.log("Critical server smoke: OK");
