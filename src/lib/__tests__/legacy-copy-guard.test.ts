/**
 * Legacy-copy guard — RED harness: user-visible copy must NOT contain the
 * legacy "dvynys/dvynio/dvynį" terminology (the certified wording is
 * "AI Derybininkas"). Scans the user-facing copy surfaces; expected to FAIL
 * against the current implementation (fail-first).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..");

/** User-visible copy surfaces (components + copy modules, client & server). */
const USER_VISIBLE_FILES = [
  "src/components/auth/SmartOnboardingCarousel.tsx",
  "src/components/chat/NegotiationTwinPanel.tsx",
  "src/components/dashboard/ManoSkelbimaiDashboard.tsx",
  "src/lib/agent-quick-reply-router.ts",
  "src/lib/wardrobe-value-share.ts",
  "src/lib/twin-templates.ts",
  "src/context/VautoAgentContext.tsx",
  "server/src/ai/twin-templates.ts",
];

const LEGACY_TWIN_RE = /\bdvyn(?:ys|io|į|iui|iu)\b/iu;

describe("legacy copy guard — RED harness (fail-first)", () => {
  it("vartotojui matomoje kopijoje nelieka „dvynys/dvynio/dvynį“", () => {
    const offenders: string[] = [];
    for (const rel of USER_VISIBLE_FILES) {
      const full = path.join(ROOT, rel);
      const content = readFileSync(full, "utf8");
      const lines = content.split(/\r?\n/);
      lines.forEach((line, i) => {
        if (LEGACY_TWIN_RE.test(line)) {
          offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      });
    }
    assert.deepEqual(
      offenders,
      [],
      `legacy "dvynys" terminology found in user-visible copy:\n${offenders.join("\n")}`
    );
  });
});
