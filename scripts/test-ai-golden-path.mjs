#!/usr/bin/env node
/**
 * VAUTO AI golden-path offline harness (no Gemini / no network).
 *
 * Locks the "liberated assistant" invariants:
 *  1) Wheels/parts — price parse + fashion isolation
 *  2) Full auto — vehicle attrs kept; apparel sizes stripped
 *  3) Electronics — no clothing size tags
 *  4) Clothing — fashion sizes allowed
 *  5) Services — thin prompts, no product few-shot pollution
 *  + Prompt hygiene: warm Pass-2 directive present; Citroën/PEIKO/Kaunas few-shots absent
 *  + Session start: static welcome (no LLM greeting string)
 *
 * Requires: npm run server:build
 *   node scripts/test-ai-golden-path.mjs
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

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

const POLLUTION_RE =
  /citro[eë]n|grand\s+c4|picasso|peiko\s+x9|odinis\s+salonas|employee\s+handbook\s+—\s+pass\s+[12]\s+few-shot/i;

async function main() {
  console.log("\n== VAUTO AI golden path (offline) ==\n");

  const { parsePriceFromChatInput } = await distImport(
    "ai",
    "listing-chat-input.js"
  );
  const {
    isAutoPartsOrWheelsContext,
    stripFashionAttrsUnlessClothing,
    stripFullVehicleFieldsFromPartsDraft,
  } = await distImport("ai", "parts-isolation.js");
  const {
    getCategoryPrompter,
    NATURAL_SALES_COPY_DIRECTIVE,
    FACTUAL_EXTRACTION_DIRECTIVE,
    buildHandbookGenerationFewShots,
    VAUTO_SYSTEM_HANDBOOK,
  } = await distImport("ai", "prompters", "index.js");
  const { scrubSalesCopyMarkdown } = await distImport(
    "shared",
    "ensure-rich-sales-copy.js"
  );

  // --- Case 1: Wheels / parts ---
  console.log("1) Wheels / parts (R17)");
  check(
    isAutoPartsOrWheelsContext("Parduodu ratlankius R17"),
    "wheels context detected"
  );
  check(
    parsePriceFromChatInput("r17 150€") === 150,
    'price "r17 150€" → 150 (not 17150)'
  );
  check(
    parsePriceFromChatInput("2 250 €") === 2250,
    'price "2 250 €" → 2250'
  );
  const wheelsDraft = stripFullVehicleFieldsFromPartsDraft(
    stripFashionAttrsUnlessClothing({
      category: "other",
      title: "Ratlankiai R17",
      description: "Geros būklės ratlankiai R17.",
      attributes: {
        size: "L",
        fashionCategory: "apranga",
        engine: "2.0",
        rimSize: "R17",
      },
    }),
    "Parduodu ratlankius R17 150€"
  );
  check(!wheelsDraft.attributes?.size, "apparel size L stripped from wheels");
  check(
    !wheelsDraft.attributes?.fashionCategory,
    "fashionCategory stripped from wheels"
  );
  check(!wheelsDraft.attributes?.engine, "full-car engine stripped from wheels");
  check(wheelsDraft.attributes?.rimSize === "R17", "rimSize R17 kept");

  // --- Case 2: Full auto ---
  console.log("\n2) Full vehicle");
  check(
    !isAutoPartsOrWheelsContext("Parduodu BMW 320d 2015"),
    "full car is not parts context"
  );
  const autoDraft = stripFashionAttrsUnlessClothing({
    category: "vehicles",
    attributes: {
      make: "BMW",
      model: "320d",
      year: "2015",
      size: "M",
      powerKw: "140",
    },
  });
  check(autoDraft.attributes?.make === "BMW", "vehicle make kept");
  check(autoDraft.attributes?.powerKw === "140", "vehicle power kept");
  check(!autoDraft.attributes?.size, "apparel size M stripped from vehicles");
  const autoPrompt = getCategoryPrompter("AUTOMOBILIAI").prompt;
  check(
    /NATŪRALIA|turtingą|šiltą|engaginantį|Privalumai/i.test(autoPrompt),
    "auto Pass-2 prompt encourages warm structured copy"
  );
  check(!POLLUTION_RE.test(autoPrompt), "auto prompt has no product few-shot pollution");

  // --- Case 3: Electronics ---
  console.log("\n3) Electronics");
  const elecDraft = stripFashionAttrsUnlessClothing({
    category: "electronics",
    attributes: { brand: "JBL", model: "Flip", size: "XL" },
  });
  check(elecDraft.attributes?.brand === "JBL", "electronics brand kept");
  check(!elecDraft.attributes?.size, "apparel XL stripped from electronics");
  const elecPrompt = getCategoryPrompter("ELEKTRONIKA").prompt;
  check(!POLLUTION_RE.test(elecPrompt), "electronics prompt has no PEIKO/Citroën few-shots");

  // --- Case 4: Clothing ---
  console.log("\n4) Clothing");
  const clothDraft = stripFashionAttrsUnlessClothing({
    category: "clothing",
    attributes: { size: "M", fashionCategory: "suknelė", brand: "Zara" },
  });
  check(clothDraft.attributes?.size === "M", "clothing size M kept");
  check(
    clothDraft.attributes?.fashionCategory === "suknelė",
    "fashionCategory kept for clothing"
  );

  // --- Case 5: Services ---
  console.log("\n5) Services");
  const svc = getCategoryPrompter("PASLAUGOS");
  check(svc.id === "services", "services prompter routed");
  check(
    /PASLAUGOS|paslaug/i.test(svc.prompt),
    "services prompt mentions paslaugos"
  );
  check(!POLLUTION_RE.test(svc.prompt), "services prompt has no packaging few-shots");

  // --- Prompt hygiene ---
  console.log("\n6) Prompt hygiene / liberation locks");
  check(
    VAUTO_SYSTEM_HANDBOOK.length === 0,
    "handbook has zero product few-shot benchmarks"
  );
  check(
    /turtingą|šiltą|engaginantį/i.test(NATURAL_SALES_COPY_DIRECTIVE),
    "NATURAL_SALES_COPY_DIRECTIVE restores warm tone"
  );
  check(
    /ONLY the facts|Do not invent/i.test(FACTUAL_EXTRACTION_DIRECTIVE),
    "FACTUAL_EXTRACTION_DIRECTIVE stays thin and positive"
  );
  const genSlice = buildHandbookGenerationFewShots("general");
  check(!POLLUTION_RE.test(genSlice), "generation handbook slice has no few-shot pollution");
  check(
    /turtingą|šiltą|Privalumai/i.test(genSlice),
    "generation handbook slice includes warm structure"
  );

  // Post-process must not mangle natural LT cities/sentences.
  const rich =
    "Puikūs ratlankiai Kaune. Atnaujinkite garažą šiais R17 ratais.";
  const scrubbed = scrubSalesCopyMarkdown(rich);
  check(
    /Kaune/.test(scrubbed),
    "scrubSalesCopyMarkdown keeps grounded city text (no fragile city purge)"
  );
  check(
    scrubbed.includes("Puikūs ratlankiai"),
    "scrubSalesCopyMarkdown keeps natural sentences"
  );

  // Static welcome — first LLM must wait for user content.
  console.log("\n7) Instant session start (static welcome)");
  const startSrc = readFileSync(
    join(root, "src", "lib", "start-ai-seller-listing.ts"),
    "utf8"
  );
  check(
    /STATIC_SELLER_LISTING_WELCOME/.test(startSrc),
    "static seller welcome constant exists"
  );
  check(
    /kontaktai iš profilio jau paruošti/i.test(startSrc),
    "welcome copy matches instant client greeting"
  );
  const agentCtx = readFileSync(
    join(root, "src", "context", "VautoAgentContext.tsx"),
    "utf8"
  );
  check(
    /STATIC_SELLER_LISTING_WELCOME/.test(agentCtx) &&
      !/sendAgentMessage\(\s*aiSellerListingGreeting/.test(agentCtx),
    "openAiSellerListingChat uses static welcome (no LLM greeting call)"
  );

  console.log(
    failures
      ? `\n✖ ${failures} golden check(s) failed\n`
      : "\n✔ All golden-path checks passed\n"
  );
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
