#!/usr/bin/env node
/**
 * Auth E2E validation — offline mock token checks + optional live API self-test.
 *
 * Offline (CI): npm run test:auth-e2e
 * Live API: VAUTO_API_URL=... VAUTO_OPS_SECRET=... npm run test:auth-e2e -- --live
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

const live = process.argv.includes("--live");
const apiUrl = (
  process.env.VAUTO_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://vauto-api.onrender.com"
).replace(/\/$/, "");
const secret = process.env.VAUTO_OPS_SECRET?.trim();

console.log("=== Auth E2E — offline mock token checks ===");
process.env.VAUTO_E2E_AUTH = "1";

const {
  encodeE2eGoogleToken,
  encodeE2eAppleToken,
  maybeParseE2eGoogleToken,
  maybeParseE2eAppleToken,
  isE2eMockAuthEnabled,
  E2E_TEST_PHONE,
  E2E_TEST_OTP,
} = await distImport("auth", "e2e-mock-auth.js");

assert(isE2eMockAuthEnabled(), "VAUTO_E2E_AUTH should be enabled for test");

const googlePayload = {
  sub: "offline-google-1",
  email: "offline@vauto.lt",
  name: "Offline Google",
  picture: "https://example.com/p.jpg",
};
const googleToken = encodeE2eGoogleToken(googlePayload);
const parsedGoogle = maybeParseE2eGoogleToken(googleToken);
assert(parsedGoogle?.sub === googlePayload.sub, "Google mock token round-trip");
assert(parsedGoogle?.email === googlePayload.email, "Google mock email preserved");

const applePayload = {
  sub: "offline-apple-1",
  email: "offline-apple@vauto.lt",
  name: "Offline Apple",
};
const appleToken = encodeE2eAppleToken(applePayload);
const parsedApple = maybeParseE2eAppleToken(appleToken);
assert(parsedApple?.sub === applePayload.sub, "Apple mock token round-trip");

const { verifyGoogleIdToken } = await distImport("auth", "google-verify.js");
const { verifyAppleIdToken } = await distImport("auth", "apple-verify.js");

const verifiedGoogle = await verifyGoogleIdToken(googleToken);
assert(verifiedGoogle?.email === googlePayload.email, "verifyGoogleIdToken accepts E2E mock");

const verifiedApple = await verifyAppleIdToken(appleToken);
assert(verifiedApple?.email === applePayload.email, "verifyAppleIdToken accepts E2E mock");

const { issueOtp, verifyOtp, clearAllOtps } = await distImport("services", "otp.js");
const { isDemoBypassPhone } = await distImport("auth", "demo-phones.js");

assert(isDemoBypassPhone(E2E_TEST_PHONE), "E2E test phone is bypass-enabled");
const { code } = issueOtp(E2E_TEST_PHONE);
assert(code === E2E_TEST_OTP, `E2E OTP issued as ${E2E_TEST_OTP}`);
assert(verifyOtp(E2E_TEST_PHONE, E2E_TEST_OTP), "E2E OTP verifies");
clearAllOtps();

console.log("✓ Offline auth E2E checks passed");

if (!live) {
  console.log("(Skipping live API — pass --live with VAUTO_OPS_SECRET to test production)");
  process.exit(0);
}

if (!secret) {
  console.error("Live mode requires VAUTO_OPS_SECRET");
  process.exit(1);
}

console.log(`\n=== Auth E2E — live API (${apiUrl}) ===`);

async function opsFetch(path, opts = {}) {
  const res = await fetch(`${apiUrl}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-Vauto-Ops-Secret": secret,
      ...(opts.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const hygiene = await opsFetch("/api/ops/auth-hygiene");
assert(hygiene.status === 200, `auth-hygiene HTTP ${hygiene.status}`);
console.log("Hygiene:", hygiene.data.hygiene);

const dryRun = await opsFetch("/api/ops/auth-reset", {
  method: "POST",
  body: JSON.stringify({ dryRun: true }),
});
assert(dryRun.status === 200 && dryRun.data.ok, "auth-reset dry-run");

const flow = await opsFetch("/api/test/auth-flow", { method: "POST" });
if (flow.data.enabled === false) {
  console.warn(
    "⚠ VAUTO_E2E_AUTH=1 not set on server — auth-flow self-test skipped (enable on Render for full live test)"
  );
} else {
  assert(flow.status === 200 && flow.data.ok, `auth-flow failed: ${JSON.stringify(flow.data)}`);
  console.log("Auth flow:", {
    google: flow.data.google,
    apple: flow.data.apple,
    sms: flow.data.sms,
    cleanup: flow.data.cleanup,
    hygiene: flow.data.hygiene,
  });
}

const postHygiene = await opsFetch("/api/ops/auth-hygiene");
assert(
  Number(postHygiene.data.hygiene?.staleRoleUsers ?? 0) === 0,
  "no stale admin roles on test users"
);

console.log("✓ Live auth E2E checks passed");
