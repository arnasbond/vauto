#!/usr/bin/env node
/**
 * Offline guardrails for P1/P2 emotional upgrade infrastructure.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const REQUIRED = [
  "server/src/chat/chat-bus.ts",
  "server/src/ai/proactive-nudges.ts",
  "server/migrations/023_user_ai_preferences.sql",
  "src/lib/api/vauto-agent-stream.ts",
  "src/lib/api/chat-stream.ts",
  "src/lib/api/user-intelligence.ts",
  "src/components/auth/OnboardingConversation.tsx",
];

const SNIPPETS = [
  { file: "server/src/routes/vauto-agent.ts", includes: 'post("/stream"' },
  { file: "server/src/routes/api.ts", includes: '"/chats/stream"' },
  { file: "server/src/routes/api.ts", includes: '"/user/preferences"' },
  { file: "server/src/ai/vauto-agent.ts", includes: "VautoAgentStreamEvent" },
  { file: "server/src/ai/secretary-persona.ts", includes: "VOICE_SECRETARY_NOISE_REPLIES" },
  { file: "src/context/VautoAgentContext.tsx", includes: "apiVautoAgentStream" },
  { file: "src/context/ChatContext.tsx", includes: "connectChatStream" },
];

let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log(`  ✓ ${m}`); }
function bad(m) { fail++; console.error(`  ✗ ${m}`); }

console.log("\n=== VAUTO P1/P2 Emotional Upgrade (offline) ===\n");
for (const rel of REQUIRED) {
  existsSync(join(root, rel)) ? ok(`exists ${rel}`) : bad(`missing ${rel}`);
}
for (const { file, includes } of SNIPPETS) {
  const p = join(root, file);
  if (!existsSync(p)) { bad(`${file} missing`); continue; }
  readFileSync(p, "utf8").includes(includes)
    ? ok(`${file} contains ${includes}`)
    : bad(`${file} missing ${includes}`);
}
console.log(`\n--- ${pass} passed, ${fail} failed ---\n`);
process.exit(fail > 0 ? 1 : 0);
