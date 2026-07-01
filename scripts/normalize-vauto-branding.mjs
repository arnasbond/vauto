#!/usr/bin/env node
/**
 * Normalize user-facing branding: vAuto / Vauto -> VAUTO
 * Preserves code identifiers (VautoContext, useVauto, vauto-original, vauto_listings_v1, etc.)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".html",
  ".md",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "out",
  ".git",
]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(ent.name))) out.push(full);
  }
  return out;
}

function normalize(content) {
  let next = content;

  // vAuto -> VAUTO (always branding)
  next = next.replace(/vAuto/g, "VAUTO");

  // Vauto + uppercase letter = TypeScript identifier — skip; lowercase prefix = useVauto etc.
  next = next.replace(/(?<![a-z])Vauto(?![A-Z])/g, "VAUTO");

  // Lowercase wordmark in logo JSX (vauto<span...)
  next = next.replace(/vauto(?=<span)/g, "VAUTO");

  return next;
}

function shouldProcess(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  if (rel.startsWith("node_modules/")) return false;
  if (rel.startsWith("out/")) return false;
  if (rel.includes("android/app/src/main/assets/public/")) return false;
  return true;
}

let changed = 0;
for (const file of walk(ROOT)) {
  if (!shouldProcess(file)) continue;
  const raw = fs.readFileSync(file, "utf8");
  const next = normalize(raw);
  if (next !== raw) {
    fs.writeFileSync(file, next, "utf8");
    changed += 1;
    console.log(path.relative(ROOT, file));
  }
}
console.log(`\nUpdated ${changed} file(s).`);
