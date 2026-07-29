#!/usr/bin/env node
/**
 * Fail-fast E2E scope probe — max 2 min per step.
 * Scopes: SMS mock, free base + paid VIP, admin 404 masking.
 *
 *   node scripts/e2e-scope-failfast.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STEP_MS = 120_000;
const API = (
  process.env.VAUTO_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://vauto-api.onrender.com"
).replace(/\/$/, "");
const WEB = (process.env.VAUTO_WEB_URL || "https://www.vauto.lt").replace(
  /\/$/,
  ""
);

const results = [];

function log(msg) {
  console.log(msg);
}

function fail(step, detail) {
  console.error(`\n=== BLOCKER ===`);
  console.error(`Step: ${step}`);
  console.error(`Detail:\n${detail}`);
  process.exit(1);
}

function tail(text, n = 30) {
  return text.trim().split(/\r?\n/).slice(-n).join("\n") || "(no output)";
}

async function withTimeout(step, ms, fn) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    log(`\n▶ ${step} (max ${Math.round(ms / 1000)}s)`);
    const value = await fn(ac.signal);
    if (ac.signal.aborted) throw new Error(`TIMEOUT ${ms}ms`);
    clearTimeout(timer);
    results.push({ step, ok: true });
    log(`✓ ${step}`);
    return value;
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ step, ok: false, error: msg });
    fail(step, msg);
  }
}

async function fetchJson(url, opts = {}, signal) {
  const res = await fetch(url, {
    ...opts,
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body, text };
}

function runSpawn(command, args, signal, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const onData = (buf) => {
      const s = buf.toString();
      out += s;
      process.stdout.write(s);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    const kill = () => {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
            shell: true,
            stdio: "ignore",
          });
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        /* ignore */
      }
    };
    signal.addEventListener("abort", kill);
    child.on("error", reject);
    child.on("close", (code) => {
      signal.removeEventListener("abort", kill);
      if (signal.aborted) {
        reject(new Error(`TIMEOUT — last 30 lines:\n${tail(out)}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`exit ${code}\n${tail(out)}`));
        return;
      }
      resolve(out);
    });
  });
}

// ——— 1) SMS ———
await withTimeout("1a. Ensure server dist", STEP_MS, async (signal) => {
  // Always rebuild so SMS/OTP probes match current source (stale dist caused false bulkgate).
  await runSpawn("npm", ["run", "server:build"], signal);
});

await withTimeout("1b. Non-prod SMS provider forced mock", STEP_MS, async () => {
  process.env.NODE_ENV = "development";
  process.env.BULKGATE_APPLICATION_ID = "fake-id-ignored";
  process.env.BULKGATE_APPLICATION_TOKEN = "fake-token-ignored";
  process.env.SMS_MODE = "live";
  const smsUrl = pathToFileURL(
    join(ROOT, "server", "dist", "services", "sms.js")
  ).href;
  const mod = await import(`${smsUrl}?t=${Date.now()}`);
  if (mod.getSmsProvider() !== "mock") {
    throw new Error(`Expected mock, got ${mod.getSmsProvider()}`);
  }
  if (mod.isSmsLive() !== false) throw new Error("isSmsLive must be false");
  if (!(await mod.shouldMockSmsForPhone("+37060000002"))) {
    throw new Error("Demo phone must be mocked");
  }
  log("  provider=mock; BulkGate creds ignored; demo phone mocked");
});

await withTimeout("1c. Demo OTP 123456 offline", STEP_MS, async () => {
  process.env.NODE_ENV = "development";
  delete process.env.VAUTO_DEMO_OTP;
  const otpUrl = pathToFileURL(
    join(ROOT, "server", "dist", "services", "otp.js")
  ).href;
  const otp = await import(`${otpUrl}?t=${Date.now()}-otp`);
  if (!otp.usesDemoOtp()) throw new Error("usesDemoOtp expected true");
  const { code } = otp.issueOtp("+37061112222");
  if (code !== "123456") throw new Error(`Expected 123456, got ${code}`);
  if (!otp.verifyOtp("+37061112222", "123456")) {
    throw new Error("verify failed");
  }
  log("  issued+verified 123456");
});

await withTimeout("1d. Live demo-phone OTP (mocked delivery)", STEP_MS, async (signal) => {
  const send = await fetchJson(
    `${API}/api/auth/otp/send`,
    { method: "POST", body: JSON.stringify({ phone: "+37060000002" }) },
    signal
  );
  if (!send.res.ok) {
    throw new Error(`otp/send ${send.res.status}: ${JSON.stringify(send.body)}`);
  }
  const verify = await fetchJson(
    `${API}/api/auth/otp/verify`,
    {
      method: "POST",
      body: JSON.stringify({
        phone: "+37060000002",
        code: "123456",
        role: "private",
        city: "Vilnius",
      }),
    },
    signal
  );
  if (!verify.res.ok || !verify.body?.token) {
    throw new Error(
      `otp/verify ${verify.res.status}: ${JSON.stringify(verify.body)}`
    );
  }
  log("  live verify OK with 123456 (no BulkGate credit needed)");
});

// ——— 2) Pricing ———
await withTimeout("2. Catalog: base 0€, VIP paid, no promo zero", STEP_MS, async () => {
  const vis = readFileSync(
    join(ROOT, "src", "lib", "listing-publish-visibility.ts"),
    "utf8"
  );
  const mon = readFileSync(
    join(ROOT, "src", "lib", "monetization-catalog.ts"),
    "utf8"
  );
  if (!/id:\s*"standard"[\s\S]*?listPriceEur:\s*0/.test(vis)) {
    throw new Error("standard listPriceEur must be 0");
  }
  if (/applyLaunchPromoPrice/.test(vis) || /applyLaunchPromoPrice/.test(mon)) {
    throw new Error("B2C must not call applyLaunchPromoPrice");
  }
  if (!/listPriceEur:\s*9\.99/.test(vis) || !/listPriceEur:\s*3\.99/.test(vis)) {
    throw new Error("TOP/PLUS prices missing");
  }
  if (!/priceEur:\s*product\.listPriceEur/.test(mon)) {
    throw new Error("promote priceEur must equal listPriceEur");
  }
  if (!/buildPrePublishVisibilityCheckout[\s\S]*listPriceEur <= 0/.test(vis)) {
    throw new Error("checkout must skip when listPriceEur <= 0");
  }
  log("  base free; Boost/Premium/bump at full rates; checkout gated");
});

// ——— 3) Admin 404 ———
await withTimeout("3a. API admin → 404 unauthenticated", STEP_MS, async (signal) => {
  const { res, body } = await fetchJson(
    `${API}/api/admin/platform-flags`,
    {},
    signal
  );
  if (res.status !== 404) {
    throw new Error(`Expected 404, got ${res.status}: ${JSON.stringify(body)}`);
  }
  if (String(body?.error || "").toLowerCase() !== "not found") {
    throw new Error(`Bad body: ${JSON.stringify(body)}`);
  }
  log("  /api/admin/platform-flags → 404");
});

await withTimeout("3b. API admin → 404 junk token", STEP_MS, async (signal) => {
  const { res } = await fetchJson(
    `${API}/api/admin/billing/lookup?email=x@y.z`,
    { headers: { Authorization: "Bearer junk.token" } },
    signal
  );
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  log("  /api/admin/billing/lookup → 404");
});

await withTimeout("3c. Playwright guest /admin 404 UI", STEP_MS, async (signal) => {
  await runSpawn(
    "npx",
    [
      "playwright",
      "test",
      "e2e/admin-404-mask.spec.ts",
      "--config=playwright.prod-smoke.config.ts",
      "--reporter=list",
    ],
    signal,
    { PLAYWRIGHT_BASE_URL: WEB }
  );
});

log("\n=== E2E SCOPE SUMMARY ===");
for (const r of results) {
  log(`${r.ok ? "PASS" : "FAIL"}  ${r.step}`);
}
log("All scoped checks passed.");
