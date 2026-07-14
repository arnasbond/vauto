import { execSync } from "node:child_process";

process.env.NEXT_PUBLIC_VAUTO_CONDUCTOR = process.env.NEXT_PUBLIC_VAUTO_CONDUCTOR || "1";
execSync("node scripts/write-runtime-config.mjs", { stdio: "inherit", env: process.env });
