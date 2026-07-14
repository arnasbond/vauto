import { execSync } from "node:child_process";

process.env.NEXT_PUBLIC_SHOW_DEMO_CATALOG = "true";
execSync("npm run build", { stdio: "inherit", env: process.env });
