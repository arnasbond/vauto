import { spawnSync } from "node:child_process";

process.env.NEXT_PUBLIC_VAUTO_CONDUCTOR = "1";

const result = spawnSync("npm", ["run", "build"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
