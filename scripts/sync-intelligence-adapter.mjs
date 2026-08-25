#!/usr/bin/env node
/**
 * Sync shared/intelligence-adapter + shared/intelligence-projection →
 * server/src/shared (NodeNext .js imports).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const pairs = [
  ["intelligence-adapter", "shared/intelligence-adapter", "server/src/shared/intelligence-adapter"],
  ["intelligence-projection", "shared/intelligence-projection", "server/src/shared/intelligence-projection"],
];

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

for (const [label, srcRel, destRel] of pairs) {
  const srcDir = join(root, srcRel);
  const destDir = join(root, destRel);
  mkdirSync(destDir, { recursive: true });
  for (const name of ["index.ts"]) {
    const raw = readFileSync(join(srcDir, name), "utf8");
    writeFileSync(join(destDir, name), withJsExt(raw), "utf8");
    console.log(`synced ${label}/${name}`);
  }
}
console.log("OK");
