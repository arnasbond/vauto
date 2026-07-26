#!/usr/bin/env node
/**
 * Sync root shared/intents + llm-context-slice → server/src/shared (NodeNext .js imports).
 *   node scripts/sync-shared-intents.mjs
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

const sliceSrc = join(root, "shared", "llm-context-slice.ts");
const sliceDest = join(root, "server", "src", "shared", "llm-context-slice.ts");
copyFileSync(sliceSrc, sliceDest);
console.log("synced llm-context-slice.ts");
console.log("OK");
