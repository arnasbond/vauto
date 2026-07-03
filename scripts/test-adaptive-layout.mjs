#!/usr/bin/env node
/**
 * Offline checks for VAUTO adaptive Web/Mobile layout scaffold.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;

function check(cond, label) {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`  [${status}] ${label}`);
}

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

console.log("\n=== VAUTO Adaptive Layout (offline) ===\n");

const files = [
  "src/hooks/useIsMobile.ts",
  "src/context/LayoutModeContext.tsx",
  "src/components/layout/VautoAdaptiveLayout.tsx",
  "src/components/layout/desktop/DesktopHeader.tsx",
  "src/components/layout/desktop/DesktopFooter.tsx",
  "src/components/layout/desktop/DesktopHomeLayout.tsx",
  "src/lib/anonser-links.ts",
  "src/lib/auth/token-handoff.ts",
];

for (const f of files) {
  check(existsSync(join(root, f)), `exists ${f}`);
}

check(read("src/context/AppProviders.tsx").includes("LayoutModeProvider"), "AppProviders mounts LayoutModeProvider");
check(read("src/app/page.tsx").includes("VautoAdaptiveLayout"), "home page uses VautoAdaptiveLayout");
check(read("src/app/page.tsx").includes("DesktopHomeLayout"), "home page uses DesktopHomeLayout");
check(read("src/context/AuthContext.tsx").includes("bootstrapTokenHandoff"), "AuthContext token handoff");
check(read("src/app/globals.css").includes("--anonser-desktop-max"), "desktop design tokens in globals.css");
check(read("server/.env.example").includes("vauto.anonser.lt"), "env.example documents anonser subdomain");

console.log(
  failures === 0
    ? `\n--- ${files.length + 6} passed, 0 failed ---\n`
    : `\n--- ${failures} failed ---\n`
);
process.exit(failures === 0 ? 0 : 1);
