import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

process.env.NEXT_PUBLIC_SHOW_DEMO_CATALOG = "true";
process.env.NEXT_PUBLIC_E2E = "1";
// Default e2e suite includes conductor runtime-live assertions; mirror CI sync.
process.env.NEXT_PUBLIC_VAUTO_CONDUCTOR =
  process.env.NEXT_PUBLIC_VAUTO_CONDUCTOR || "1";
// Drop incremental cache so EditListingModal (and peers) cannot ship stale.
try {
  rmSync(".next", { recursive: true, force: true });
} catch {
  /* ignore */
}
execSync("node scripts/write-runtime-config.mjs", {
  stdio: "inherit",
  env: process.env,
});
execSync("npm run build", { stdio: "inherit", env: process.env });
