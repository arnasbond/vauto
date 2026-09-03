#!/usr/bin/env node
/**
 * Sync root shared/intents + llm-context-slice → server/src/shared (NodeNext .js imports).
 *   node scripts/sync-shared-intents.mjs
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "shared", "intents");
const destDir = join(root, "server", "src", "shared", "intents");

mkdirSync(destDir, { recursive: true });

function withJsExt(source) {
  return source
    .replace(/from "(\.\.?\/[^"]+)";/g, (m, p1) => {
      if (p1.endsWith(".js") || p1.endsWith(".json")) return m;
      return `from "${p1}.js";`;
    })
    .replace(/from '(\.\.?\/[^']+)';/g, (m, p1) => {
      if (p1.endsWith(".js") || p1.endsWith(".json")) return m;
      return `from '${p1}.js';`;
    });
}

for (const name of readdirSync(srcDir)) {
  if (!name.endsWith(".ts")) continue;
  const raw = readFileSync(join(srcDir, name), "utf8");
  writeFileSync(join(destDir, name), withJsExt(raw), "utf8");
  console.log(`synced intents/${name}`);
}

for (const name of [
  "llm-context-slice.ts",
  "authenticity-text.ts",
  "vehicle-vision-enrich.ts",
  "vehicle-spec-catalog.ts",
  "vehicle-sales-copy.ts",
  "ensure-rich-sales-copy.ts",
  "omniva-locker-eligibility.ts",
  "listing-attributes-sanitize.ts",
  "fact-conflict.ts",
]) {
  const raw = readFileSync(join(root, "shared", name), "utf8");
  writeFileSync(join(root, "server", "src", "shared", name), withJsExt(raw), "utf8");
  console.log(`synced ${name}`);
}
console.log("OK");
