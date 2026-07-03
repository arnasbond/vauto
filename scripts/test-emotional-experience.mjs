#!/usr/bin/env node
/**
 * Offline empathy / emotional-experience guardrails — ensures no dry dead-end copy.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const FORBIDDEN_PATTERNS = [
  { re: /"Rezultatų nerasta"/, label: 'dry toast "Rezultatų nerasta"' },
  { re: /"Nerasta atitinkančių skelbimų\."/, label: 'dry tool summary' },
  { re: /Įveskite tekstą rankiniu būdu/, label: "robotic photo fallback" },
  { re: /Nepavyko automatiškai atpažinti nuotraukos"/, label: "cold vision failure" },
];

const REQUIRED_FILES = [
  "src/lib/empathy-copy.ts",
  "src/components/home/AgentTypingIndicator.tsx",
  "server/src/ai/gemini-intent-rules.ts",
  "server/src/ai/secretary-persona.ts",
  "server/src/offer-engine.ts",
];

const REQUIRED_SNIPPETS = [
  { file: "src/lib/empathy-copy.ts", includes: "buildEmptySearchBannerMessage" },
  { file: "server/src/offer-engine.ts", includes: "buildNoMatchLeadPrompt" },
  { file: "server/src/ai/vauto-agent.ts", includes: "isGenericEmptySearchReply" },
  { file: "server/src/ai/gemini-intent-rules.ts", includes: "GEMINI_EMPATHY_RULES" },
  { file: "src/lib/voice-graceful.ts", includes: "ai_rate_limit_exceeded" },
  { file: "server/src/ai/gemini-intent-rules.ts", includes: "GEMINI_ERROR_TOLERANCE_RULES" },
];

const SCAN_FILES = [
  "src/context/VautoAgentContext.tsx",
  "src/components/ListingGrid.tsx",
  "src/components/search/SearchEmptyAssistantBanner.tsx",
  "src/lib/photo-vision-search.ts",
  "src/lib/ai-safeguards.ts",
  "server/src/ai/agent-tools.ts",
];

let pass = 0;
let fail = 0;

function ok(msg) {
  pass++;
  console.log(`  ✓ ${msg}`);
}
function bad(msg) {
  fail++;
  console.error(`  ✗ ${msg}`);
}

console.log("\n=== VAUTO Emotional Experience (offline) ===\n");

for (const rel of REQUIRED_FILES) {
  const p = join(root, rel);
  if (existsSync(p)) ok(`exists ${rel}`);
  else bad(`missing ${rel}`);
}

for (const { file, includes } of REQUIRED_SNIPPETS) {
  const p = join(root, file);
  if (!existsSync(p)) {
    bad(`${file} missing for snippet check`);
    continue;
  }
  const text = readFileSync(p, "utf8");
  if (text.includes(includes)) ok(`${file} contains ${includes}`);
  else bad(`${file} missing ${includes}`);
}

for (const rel of SCAN_FILES) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    bad(`scan target missing: ${rel}`);
    continue;
  }
  const text = readFileSync(p, "utf8");
  for (const { re, label } of FORBIDDEN_PATTERNS) {
    if (re.test(text)) bad(`${rel}: found ${label}`);
    else ok(`${rel}: no ${label}`);
  }
}

console.log(`\n--- ${pass} passed, ${fail} failed ---\n`);
process.exit(fail > 0 ? 1 : 0);
