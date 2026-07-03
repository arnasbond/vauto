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
check(read("src/app/page.tsx").includes("hidden md:block"), "home page uses CSS desktop breakpoint");
check(read("src/components/layout/VautoAdaptiveLayout.tsx").includes("vauto-adaptive-content"), "adaptive content uses desktop width class");
check(read("src/context/AuthContext.tsx").includes("bootstrapTokenHandoff"), "AuthContext token handoff");
check(read("src/app/globals.css").includes("--anonser-desktop-max"), "desktop design tokens in globals.css");
check(read("src/lib/site-url.ts").includes("https://www.vauto.lt"), "canonical site URL in site-url.ts");
check(read("public/manifest.json").includes("www.vauto.lt"), "manifest uses www.vauto.lt");
check(read("vercel.json").includes("NEXT_PUBLIC_APP_ORIGIN"), "vercel.json sets NEXT_PUBLIC_APP_ORIGIN");

// Migrated pages use the adaptive layout (no leftover AppShell)
const migrated = [
  "src/app/chats/page.tsx",
  "src/app/pokalbiai/page.tsx",
  "src/app/chats/thread/page.tsx",
  "src/app/chats/[id]/page.tsx",
  "src/app/add/page.tsx",
  "src/app/fashion/mine/page.tsx",
];
for (const f of migrated) {
  const src = read(f);
  check(
    src.includes("VautoAdaptiveLayout") && !src.includes("AppShell"),
    `${f} migrated to VautoAdaptiveLayout`
  );
}
check(
  read("src/components/dashboard/DashboardShell.tsx").includes("VautoAdaptiveLayout"),
  "DashboardShell (profile) uses VautoAdaptiveLayout"
);

const passed = files.length + 8 + migrated.length + 1;
console.log(
  failures === 0
    ? `\n--- ${passed} passed, 0 failed ---\n`
    : `\n--- ${failures} failed ---\n`
);
process.exit(failures === 0 ? 0 : 1);
