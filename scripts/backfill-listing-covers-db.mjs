#!/usr/bin/env node
/**
 * DEPRECATED: Unsplash category cover DB backfill is permanently disabled.
 * Use: node server/scripts/restore-real-listing-covers.mjs
 */
console.error(
  [
    "REFUSED: Unsplash/demo DB cover backfill is disabled.",
    "Run instead:",
    "  npm run db:restore-covers",
    "  npm run db:purge-demo-catalog",
  ].join("\n")
);
process.exit(1);
