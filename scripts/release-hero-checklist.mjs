#!/usr/bin/env node
/**
 * Phase A hero release ritual — see docs/PHASE_A_CLOSEOUT.md
 *
 * Always: test:ai-golden + AI restore e2e (+ smoke).
 * Live Vision: required before promote when Gemini key present;
 *   SKIP_LIVE_VISION=1 prints a loud warning (never silent).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

function run(label, command, args, opts = {}) {
  console.log(`\n=== ${label} ===\n> ${command} ${args.join(" ")}\n`);
  const r = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...opts.env },
  });
  if (r.status !== 0) {
    console.error(`\n[release:hero] FAILED: ${label} (exit ${r.status ?? "null"})\n`);
    process.exit(r.status ?? 1);
  }
}

console.log("VAUTO release:hero — Phase A checklist");

run("AI golden path (offline)", "npm", ["run", "test:ai-golden"]);

run("AI assistant restore + smoke e2e", "npx", [
  "playwright",
  "test",
  "e2e/ai-assistant-restore.spec.ts",
  "e2e/smoke.spec.ts",
]);

const skipLive = process.env.SKIP_LIVE_VISION === "1";
const hasGemini =
  Boolean(process.env.GEMINI_API_KEY?.trim()) ||
  Boolean(process.env.GOOGLE_API_KEY?.trim());

if (skipLive) {
  console.warn(
    "\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n" +
      "[release:hero] WARNING: SKIP_LIVE_VISION=1 — live Vision OCR\n" +
      "  (prepublish-live / test:e2e:live) was NOT run.\n" +
      "  Do NOT promote an AI seller release without Vision smoke\n" +
      "  unless this is an emergency hotfix.\n" +
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n"
  );
} else if (!hasGemini) {
  console.warn(
    "\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n" +
      "[release:hero] WARNING: no GEMINI_API_KEY/GOOGLE_API_KEY —\n" +
      "  skipping live Vision. Set the key and re-run, or set\n" +
      "  SKIP_LIVE_VISION=1 only for non-AI hotfixes.\n" +
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n"
  );
} else {
  const liveConfig = resolve(root, "playwright.live.config.ts");
  if (!existsSync(liveConfig)) {
    console.error("[release:hero] missing playwright.live.config.ts");
    process.exit(1);
  }
  // playwright.live.config.ts webServer starts Next on :3000 (or reuses it).
  // Do not force CI=true locally — that skips system Chrome and needs
  // `npx playwright install` for bundled chromium_headless_shell.
  run("Live Vision / PrePublish (Gemini)", "npm", ["run", "test:e2e:live"], {
    env: {
      PLAYWRIGHT_BASE_URL:
        process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://127.0.0.1:3000",
    },
  });
}

console.log("\n[release:hero] PASS — golden + restore/smoke OK.\n");
process.exit(0);
