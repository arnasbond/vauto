/**
 * Build vauto-reproducible-source.zip for external audit (Stage 2 security fixes).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";

const root = process.cwd();
const stage = path.join(os.tmpdir(), "vauto-reproducible-stage2");
const dest = path.join(stage, "vauto-reproducible-source");
const zipPath = path.join(root, "vauto-reproducible-source.zip");

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

function robocopy(rel) {
  const src = path.join(root, rel);
  const out = path.join(dest, rel);
  fs.mkdirSync(out, { recursive: true });
  try {
    execFileSync(
      "robocopy",
      [
        src,
        out,
        "/E",
        "/XD",
        "node_modules",
        ".next",
        "dist",
        "build",
        "out",
        ".git",
        "coverage",
        ".turbo",
        ".cache",
        "test-results",
        "playwright-report",
        "playwright-report-prod-real",
        "__pycache__",
        ".vercel",
        "/XF",
        ".env",
        ".env.local",
        ".env.production",
        ".env.development",
        "*.tsbuildinfo",
        "/NFL",
        "/NDL",
        "/NJH",
        "/NJS",
        "/nc",
        "/ns",
        "/np",
      ],
      { stdio: "ignore" }
    );
  } catch (e) {
    const code = /** @type {NodeJS.ErrnoException & { status?: number }} */ (e).status ?? 1;
    // robocopy: 0–7 = success-ish; >=8 = failure
    if (code >= 8) throw e;
  }
  console.log("TREE", rel);
}

for (const t of [
  "src",
  "server",
  "shared",
  "e2e",
  "scripts",
  "tests",
  "public",
  ".github",
]) {
  robocopy(t);
}

const files = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next.config.ts",
  "next-env.d.ts",
  "postcss.config.mjs",
  ".eslintrc.json",
  ".gitignore",
  ".vercelignore",
  ".env.example",
  "vercel.json",
  "render.yaml",
  "docker-compose.yml",
  "playwright.config.ts",
  "playwright.live.config.ts",
  "playwright.prod-real.config.ts",
  "playwright.prod-smoke.config.ts",
  "README.md",
];
for (const f of files) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, f));
}
for (const f of [
  "server/package.json",
  "server/package-lock.json",
  "server/tsconfig.json",
  "server/Dockerfile",
  "server/.env.example",
]) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
    fs.copyFileSync(src, path.join(dest, f));
  }
}

// scrub
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (["node_modules", ".next", "dist", "build", "out", ".git"].includes(ent.name)) {
        fs.rmSync(p, { recursive: true, force: true });
      } else walk(p);
    } else if (
      [".env", ".env.local", ".env.production", ".env.development"].includes(ent.name)
    ) {
      fs.rmSync(p, { force: true });
    }
  }
}
walk(dest);

fs.writeFileSync(
  path.join(dest, "REPRODUCIBLE_MANIFEST.txt"),
  [
    "VAUTO REPRODUCIBLE SOURCE — Stage 3 AI + Stage 4 CI/CD",
    `Generated: ${new Date().toISOString()}`,
    "Includes: .github/workflows (ci, backup-db, deploy), Stage 3 AI safety,",
    "fail-closed image safety, user-only history sanitization, untrusted XML",
    "",
  ].join("\n"),
  "utf8"
);

fs.rmSync(zipPath, { force: true });
execFileSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${dest.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
  ],
  { stdio: "inherit" }
);

const st = fs.statSync(zipPath);
const mb = (st.size / (1024 * 1024)).toFixed(2);
console.log("ZIP", zipPath, "SIZE_MB", mb);

const desktop = path.join(os.homedir(), "OneDrive", "Desktop");
const deskAlt = path.join(process.env.USERPROFILE || "", "Desktop");
for (const d of [desktop, deskAlt, "H:\\OneDrive\\Desktop"]) {
  try {
    if (fs.existsSync(d)) {
      fs.copyFileSync(zipPath, path.join(d, "vauto-reproducible-source.zip"));
      console.log("DESKTOP", path.join(d, "vauto-reproducible-source.zip"));
      break;
    }
  } catch {
    /* ignore */
  }
}

fs.rmSync(stage, { recursive: true, force: true });
