#!/usr/bin/env node
/**
 * Sync shared/category-registry.ts → server/src/shared/category-registry.ts (NodeNext .js imports).
 * Keeps the server runtime copy byte-identical to the canonical root registry.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcFile = join(root, "shared", "category-registry.ts");
const destFile = join(root, "server", "src", "shared", "category-registry.ts");

if (!existsSync(srcFile)) {
  console.error("[sync-category-registry] missing " + srcFile);
  process.exit(1);
}

function withJsExt(source) {
  return source
    .replace(/from "(\.\.?\/[^"]+)";/g, (m, p1) => {
      if (p1.endsWith(".js") || p1.endsWith(".json") || p1.endsWith(".ts")) {
        return m.replace(/\.ts"/, '.js"');
      }
      return `from "${p1}.js";`;
    })
    .replace(/from '(\.\.?\/[^']+)';/g, (m, p1) => {
      if (p1.endsWith(".js") || p1.endsWith(".json") || p1.endsWith(".ts")) {
        return m.replace(/\.ts'/, ".js'");
      }
      return `from '${p1}.js';`;
    });
}

const raw = readFileSync(srcFile, "utf8");
const transformed = withJsExt(raw);
writeFileSync(destFile, transformed, "utf8");

const srcHash = raw.trim();
const destHash = readFileSync(destFile, "utf8").trim();
if (srcHash === destHash) {
  // Registry has no relative imports; the two copies must be byte-identical.
  console.log("[sync-category-registry] synced (identical content)");
} else {
  console.log("[sync-category-registry] synced (import transform applied)");
}
console.log("OK");
