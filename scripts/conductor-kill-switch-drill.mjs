#!/usr/bin/env node
/**
 * Etapas D — kill-switch drill (no production deploy).
 *
 * Verifies write-runtime-config toggles conductorEnabled via env, then restores file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const out = resolve("public/runtime-config.json");
const script = resolve("scripts/write-runtime-config.mjs");
const backup = readFileSync(out, "utf8");

function syncConfig(env) {
  execFileSync(process.execPath, [script], {
    env: { ...process.env, ...env },
    stdio: "pipe",
  });
  return JSON.parse(readFileSync(out, "utf8"));
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

try {
  const off = syncConfig({
    NEXT_PUBLIC_VAUTO_CONDUCTOR: "0",
    VAUTO_CONDUCTOR: "0",
  });
  assert(off.conductorEnabled === false, "kill-switch OFF did not set conductorEnabled=false");
  console.log("OK kill-switch OFF → conductorEnabled=false");

  const on = syncConfig({
    NEXT_PUBLIC_VAUTO_CONDUCTOR: "1",
    VAUTO_CONDUCTOR: "1",
  });
  assert(on.conductorEnabled === true, "restore ON did not set conductorEnabled=true");
  console.log("OK restore ON → conductorEnabled=true");
} finally {
  writeFileSync(out, backup);
  console.log("OK restored public/runtime-config.json");
}

console.log("Conductor kill-switch drill passed.");
