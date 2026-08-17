#!/usr/bin/env node
/**
 * Host builds (cwd = server/) can reach repo-root scripts/sync-marketplace-domain.mjs.
 * Render dockerContext is ./server, so that parent path is outside the image.
 * Synced copies are already committed under src/shared/marketplace-domain.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoScript = join(here, "../../scripts/sync-marketplace-domain.mjs");

if (!existsSync(repoScript)) {
  console.log(
    "[build] skip marketplace-domain sync — ../scripts/sync-marketplace-domain.mjs is outside Docker context; compiling committed src/shared/marketplace-domain"
  );
  process.exit(0);
}

const result = spawnSync(process.execPath, [repoScript], { stdio: "inherit" });
process.exit(result.status === null ? 1 : result.status);
