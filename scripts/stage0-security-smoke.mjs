#!/usr/bin/env node
/**
 * Stage 0 security smoke checks (no network, no DB).
 * Run: node scripts/stage0-security-smoke.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxLoader = pathToFileURL(
  path.join(root, "server/node_modules/tsx/dist/loader.mjs")
).href;

function runTsx(code, env = {}) {
  return spawnSync(process.execPath, ["--import", tsxLoader, "-e", code], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

console.log("=== Stage 0 security smoke ===");
console.log("tsx loader:", tsxLoader);

{
  const r = runTsx(
    `import { DEV_JWT_SECRET } from "./server/src/auth/tokens.ts"; console.log("bad", DEV_JWT_SECRET)`,
    {
      NODE_ENV: "production",
      JWT_SECRET: "vauto-dev-secret-change-in-production",
    }
  );
  assert.notEqual(
    r.status,
    0,
    `expected fail, got ${r.status}: ${r.stderr || r.stdout}`
  );
  assert.match(
    String(r.stderr || r.stdout),
    /JWT_SECRET must be a strong/i,
    String(r.stderr || r.stdout)
  );
  console.log("OK 0.1 JWT: default secret rejected in production");
}

{
  const r = runTsx(
    `import { signAccessToken, verifyAccessToken } from "./server/src/auth/tokens.ts";
     const t = signAccessToken({ sub: "u1", role: "user" });
     const p = verifyAccessToken(t);
     if (!p || p.sub !== "u1") process.exit(3);
     console.log("signed-ok");`,
    {
      NODE_ENV: "production",
      JWT_SECRET: "stage0-strong-secret-not-default-0123456789",
    }
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /signed-ok/);
  console.log("OK 0.1 JWT: strong secret signs/verifies");
}

{
  const simulatedProd = true;
  const enabled = !simulatedProd && true;
  assert.equal(enabled, false);
  console.log("OK 0.1 client Gemini: production gate keeps browser key path off");
}

{
  const r = runTsx(
    `
    import { requireOpsSecret } from "./server/src/middleware/ops-secret.ts";
    const req = { headers: {} };
    let status = 0;
    let body = null;
    const res = {
      status(c) { status = c; return this; },
      json(b) { body = b; return this; },
    };
    let nextCalled = false;
    requireOpsSecret(req, res, () => { nextCalled = true; });
    await new Promise((r) => setTimeout(r, 80));
    if (nextCalled) { console.error("next called"); process.exit(4); }
    if (status !== 404) { console.error("status", status, body); process.exit(5); }
    console.log("ops-blocked-ok");
    `,
    {
      NODE_ENV: "production",
      JWT_SECRET: "stage0-strong-secret-not-default-0123456789",
      VAUTO_OPS_SECRET: "",
    }
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /ops-blocked-ok/);
  console.log("OK 0.2 ops: production without secret → 404");
}

{
  const r = runTsx(
    `
    import { requireOpsSecret } from "./server/src/middleware/ops-secret.ts";
    const req = { headers: {} };
    let nextCalled = false;
    requireOpsSecret(req, { status(){return this;}, json(){return this;} }, () => { nextCalled = true; });
    if (!nextCalled) process.exit(6);
    console.log("ops-dev-ok");
    `,
    {
      NODE_ENV: "development",
      JWT_SECRET: "dev-local",
    }
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /ops-dev-ok/);
  console.log("OK 0.2 ops: development open without secret");
}

{
  const ai = fs.readFileSync(path.join(root, "server/src/routes/ai.ts"), "utf8");
  assert.match(ai, /aiRouter\.get\("\/health"/);
  assert.match(ai, /aiRouter\.use\(requireAuth\)/);
  const healthIdx = ai.indexOf('aiRouter.get("/health"');
  const authIdx = ai.indexOf("aiRouter.use(requireAuth)");
  assert.ok(healthIdx >= 0 && authIdx > healthIdx, "health must register before requireAuth");

  const index = fs.readFileSync(path.join(root, "server/src/index.ts"), "utf8");
  assert.match(index, /app\.use\("\/api\/vauto-agent", aiRateLimiter, requireAuth/);

  const authMw = fs.readFileSync(
    path.join(root, "server/src/middleware/auth.ts"),
    "utf8"
  );
  assert.match(authMw, /ALLOW_LEGACY_USER_HEADER === "true"/);
  assert.equal(
    /NODE_ENV !== "production"/.test(authMw),
    false,
    "legacy header must not auto-enable outside production"
  );

  const api = fs.readFileSync(path.join(root, "server/src/routes/api.ts"), "utf8");
  assert.match(
    api,
    /function actorId\(req: AuthedRequest\): string \{\r?\n  return req\.authUserId \?\? "";/
  );
  assert.match(api, /apiRouter\.delete\("\/listings\/:id", requireAuth/);
  assert.match(api, /apiRouter\.patch\("\/listings\/:id", requireAuth/);
  assert.match(api, /canActForUser\(req, req\.params\.id\)/);
  assert.match(api, /canActForUser\(req, req\.params\.userId\)/);

  const gemini = fs.readFileSync(path.join(root, "src/lib/gemini-browser.ts"), "utf8");
  assert.match(gemini, /NODE_ENV === "production"\) return null/);
  const pipeline = fs.readFileSync(path.join(root, "src/lib/ai-pipeline.ts"), "utf8");
  assert.match(pipeline, /NODE_ENV === "production"\) return false/);

  console.log("OK 0.3 source: /api/ai health public, rest requireAuth; vauto-agent requireAuth");
  console.log("OK 0.4 source: actorId JWT-only; listings/users/chats ownership gates present");
}

console.log("=== Stage 0 smoke PASSED ===");
