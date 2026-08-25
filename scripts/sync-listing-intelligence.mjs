#!/usr/bin/env node
/**
 * Sync shared/listing-intelligence → server/src/shared/listing-intelligence
 * (NodeNext .js imports). Server-side consumers import the canonical contract
 * through this mirror so the server tsconfig (rootDir: src) stays valid.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "shared", "listing-intelligence");
const destDir = join(root, "server", "src", "shared", "listing-intelligence");

mkdirSync(destDir, { recursive: true });

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

for (const name of readdirSync(srcDir)) {
  if (!name.endsWith(".ts")) continue;
  if (name.endsWith(".test.ts")) continue;
  const raw = readFileSync(join(srcDir, name), "utf8");
  writeFileSync(join(destDir, name), withJsExt(raw), "utf8");
  console.log(`synced listing-intelligence/${name}`);
}
console.log("OK");
