#!/usr/bin/env node
/**
 * Sync shared/marketplace-domain → server/src/shared/marketplace-domain (NodeNext .js imports).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "shared", "marketplace-domain");
const destDir = join(root, "server", "src", "shared", "marketplace-domain");

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
  console.log(`synced marketplace-domain/${name}`);
}
console.log("OK");
