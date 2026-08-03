#!/usr/bin/env node
/**
 * DEPRECATED: Unsplash category cover backfill is permanently disabled.
 * Use: node server/scripts/restore-real-listing-covers.mjs
 */
console.error(
  [
    "REFUSED: Unsplash/demo cover backfill is disabled.",
    "It assigned the same stock photo to whole categories (bike→Partybox, leather jacket→bracelet).",
    "Run instead:",
    "  npm run db:restore-covers",
    "  npm run db:purge-demo-catalog",
  ].join("\n")
);
process.exit(1);
