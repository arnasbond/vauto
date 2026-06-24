#!/usr/bin/env node
/**
 * Production security audit against live API.
 *
 * Usage:
 *   node scripts/audit-security.mjs [baseUrl]
 */
const base =
  process.argv
    .slice(2)
    .find((a) => !a.startsWith("--"))
    ?.replace(/\/$/, "") ||
  process.env.VAUTO_API_URL?.replace(/\/$/, "") ||
  "https://vauto-api.onrender.com";

const findings = [];

function record(severity, area, detail, ok) {
  findings.push({ severity, area, detail, ok });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${severity} · ${area}: ${detail}`);
}

async function jsonFetch(path, opts = {}) {
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

async function authToken() {
  const phone = process.env.VAUTO_SMOKE_PHONE ?? "+37060000001";
  await jsonFetch("/api/auth/otp/send", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
  const verify = await jsonFetch("/api/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({
      phone,
      code: process.env.VAUTO_DEMO_OTP ?? "123456",
      role: "private",
      city: "Vilnius",
    }),
  });
  return verify.body?.token;
}

async function main() {
  console.log(`Security audit: ${base}\n`);

  const health = await jsonFetch("/api/health");
  const features = health.body?.features ?? {};

  record(
    "info",
    "Health",
    `readiness ${health.body?.readiness?.score ?? "?"}/100`,
    health.res.ok && health.body?.ok
  );

  const otpSend = await jsonFetch("/api/auth/otp/send", {
    method: "POST",
    body: JSON.stringify({ phone: "+37060000999" }),
  });
  const leaksHint = Boolean(otpSend.body?.devHint);
  record(
    leaksHint ? "high" : "info",
    "OTP",
    leaksHint
      ? "devHint exposed in /otp/send response (remove in production)"
      : "no devHint in OTP send response",
    !leaksHint
  );

  const token = await authToken();
  if (!token) {
    record("high", "Auth", "could not obtain session for wallet audit", false);
  } else {
    const topUp = await jsonFetch("/api/wallet/top-up", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: 10 }),
    });
    const demoWalletOpen =
      topUp.res.ok && topUp.body?.mode === "demo" && features.stripe;
    record(
      demoWalletOpen ? "critical" : "info",
      "Wallet",
      demoWalletOpen
        ? "free demo top-up allowed while Stripe is enabled"
        : features.stripe
          ? `demo top-up blocked (${topUp.res.status})`
          : "Stripe off — demo wallet expected",
      !demoWalletOpen
    );
  }

  record(
    features.sms ? "info" : "high",
    "OTP",
    features.sms ? "Twilio SMS configured" : "SMS off — static demo OTP likely active",
    Boolean(features.sms)
  );

  record(
    features.googleOAuth ? "info" : "medium",
    "OAuth",
    features.googleOAuth ? "Google token verification on" : "Google OAuth disabled",
    true
  );

  record(
    features.jwt ? "info" : "critical",
    "JWT",
    features.jwt ? "JWT_SECRET configured" : "JWT not configured",
    Boolean(features.jwt)
  );

  const failed = findings.filter((f) => !f.ok && f.severity !== "info");
  console.log(
    `\nAudit summary: ${findings.length} checks, ${failed.length} issue(s)`
  );
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error("Audit error:", e);
  process.exit(1);
});
