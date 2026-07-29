#!/usr/bin/env node
/**
 * Chaotic / real-world edge-case stress harness (offline).
 *
 * Covers: heavy typos, mixed LT/EN/RU, ultra-short affirmations,
 * vision↔text category conflict heuristics, job-seeker create typos.
 *
 *   npm run server:build
 *   node scripts/test-chaotic-inputs.mjs
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "server", "dist");

function distImport(...segments) {
  return import(pathToFileURL(join(dist, ...segments)).href);
}

let failures = 0;
function check(cond, label) {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  console.log(`  [${status}] ${label}`);
}

async function main() {
  console.log("VAUTO chaotic-input stress test (offline)\n");

  const chaotic = await distImport("shared", "chaotic-input.js");
  const sell = await distImport("ai", "sell-intent-fallback.js");
  const browse = await distImport("lib", "browse-all-intent.js");
  const organism = await distImport("shared", "listing-organism.js");
  const workflow = await distImport("ai", "listing-workflow-intent.js");

  console.log("== Typos & slang sell / job create ==");
  check(
    chaotic.hasChaoticSellIntent("pordodu ratud r16"),
    `"pordodu ratud r16" → sell intent`
  );
  check(
    sell.detectServerSellIntent("pordodu ratud r16"),
    `detectServerSellIntent("pordodu ratud r16")`
  );
  check(
    chaotic.hasChaoticJobSeekerCreateIntent("ieskau drbo"),
    `"ieskau drbo" → job-seeker create`
  );
  check(
    sell.isJobSeekerListingCreateIntent("ieskau drbo Vilniuje"),
    `isJobSeekerListingCreateIntent("ieskau drbo…")`
  );
  check(
    chaotic.hasChaoticSellIntent("продаю iphone 12"),
    `RU "продаю iphone 12" → sell`
  );
  check(
    chaotic.hasChaoticJobSeekerCreateIntent("ищу работу Kaunas"),
    `RU "ищу работу" → job create`
  );
  check(
    /parduodu/.test(chaotic.normalizeChaoticUserText("pordodu ratud r16")),
    `normalize maps pordodu→parduodu`
  );
  check(
    /ratus/.test(chaotic.normalizeChaoticUserText("pordodu ratud r16")),
    `normalize maps ratud→ratus`
  );

  console.log("\n== Ultra-short confirmations (no browse-all, no forced PrePublish) ==");
  for (const phrase of ["ok", "nu", "👍", "taip", "gerai", "да"]) {
    check(
      chaotic.isUltraShortConfirmation(phrase),
      `isUltraShortConfirmation("${phrase}")`
    );
    check(
      browse.isListingConfirmationPhrase(phrase),
      `confirmation excludes browse-all for "${phrase}"`
    );
    check(
      !browse.isBrowseAllIntent(phrase),
      `"${phrase}" is NOT browse-all`
    );
    check(
      !organism.isPublishReadyIntent(phrase),
      `"${phrase}" does NOT force PrePublish (reaches Gemini)`
    );
  }
  check(
    organism.isPublishReadyIntent("publikuok"),
    `"publikuok" still opens PrePublish`
  );
  check(
    organism.isPublishReadyIntent("viskas tinka"),
    `"viskas tinka" still opens PrePublish`
  );

  console.log("\n== Vision ↔ text conflict ==");
  check(
    chaotic.hasVisionTextCategoryConflict(
      "Nike Air batai sneaker",
      "siūlau stogo remontą ir paslaugas"
    ),
    `shoe vision vs roofing text → conflict`
  );
  check(
    !chaotic.hasVisionTextCategoryConflict(
      "Volvo V70",
      "parduodu volvo v70 geras stovis"
    ),
    `aligned vehicle vision+text → no conflict`
  );
  const prompt = chaotic.buildVisionTextConflictPrompt("footwear", "services");
  check(
    /konflikt/i.test(prompt) && /batai/i.test(prompt),
    `conflict prompt mentions footwear`
  );

  console.log("\n== Negotiable / slang price note ==");
  check(
    sell.detectServerSellIntent("parduodu dvirati kaina sutarine geras stovys") ||
      chaotic.hasChaoticSellIntent(
        "parduodu dvirati kaina sutarine geras stovys"
      ),
    `slang sell + sutartinė kaina still sell intent`
  );

  console.log(
    failures === 0
      ? "\nChaotic-input stress test: OK"
      : `\nChaotic-input stress test: ${failures} failure(s)`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
