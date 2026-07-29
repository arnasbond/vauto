import { execSync } from "node:child_process";

process.env.NEXT_PUBLIC_SHOW_DEMO_CATALOG = "true";
// Default e2e suite includes conductor runtime-live assertions; mirror CI sync.
process.env.NEXT_PUBLIC_VAUTO_CONDUCTOR =
  process.env.NEXT_PUBLIC_VAUTO_CONDUCTOR || "1";
execSync("node scripts/write-runtime-config.mjs", {
  stdio: "inherit",
  env: process.env,
});
execSync("npm run build", { stdio: "inherit", env: process.env });
