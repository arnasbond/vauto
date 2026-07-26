/**
 * Canonical listing seller-flow workflow commands — system intents, NOT field content.
 * Union of former client + server copies (zero drift).
 */

import { foldLtIntent } from "./lt-fold";

const PUBLISH_WORKFLOW_RE =
  /\b(viskas\s+tinka|viskas\s+gerai|viskas\s+ok|viskas\s+tikslu|viskas\s+tvarkoje|viskas\s+atitinka|taip,?\s*viskas|taip,?\s*publikuoti|publikuojam|publikuok|publikuoti|skelbti|skelbiam|taip,?\s*skelbti|keliam|keliame|ne,?\s*nereikia|nebereikia|nereikia,?\s*publiku)\b/;

const EXACT_PUBLISH_COMMANDS = new Set([
  "taip",
  "gerai",
  "ok",
  "okay",
  "okej",
  "nu",
  "jo",
  "yep",
  "yes",
  "да",
  "ок",
  "👍",
  "👌",
  "✅",
  "tinka",
  "keliam",
  "keliame",
  "patvirtinu",
  "taip tinka",
  "taip, tinka",
  "ne, be reklamos",
  "be reklamos",
  "nenoriu reklamos",
  "taip, publikuoti",
  "publikuok",
  "publikuoti",
  "publikuojam",
  "viskas tinka",
  "viskas gerai",
  "viskas ok",
  "viskas tikslu",
  "taip, viskas tikslu",
  "suvesti trukstamus duomenis",
  "suvesti trūkstamus duomenis",
  "ikelti nuotraukas",
  "įkelti nuotraukas",
  "reikia pataisyti",
  "telefono numeris",
  "miestas",
  "ieškoti šio daikto",
  "įkelti skelbimą",
]);

const WORKFLOW_CHIP_RE =
  /\b(pataisyti\s+kain[aą]|pataisyti\s+kategorij[aą]|pataisyti\s+aprašym[aą]|pataisyti\s+aprasym[aą]|iskelti\s+i\s+virsu|iškelti\s+į\s+viršų|paryskinti|paryškinti|aktyvuoti\s+ai|ne,?\s*dar\s+pataisysiu)\b/;

export function isListingWorkflowCommand(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  if (/^(👍|👌|✅)([\uFE0F\uFE0E]|[\u{1F3FB}-\u{1F3FF}])?$/u.test(raw)) {
    return true;
  }
  const folded = foldLtIntent(raw);
  if (EXACT_PUBLISH_COMMANDS.has(folded)) return true;
  if (PUBLISH_WORKFLOW_RE.test(folded)) return true;
  if (WORKFLOW_CHIP_RE.test(folded)) return true;
  return false;
}

export function isPublishWorkflowCommand(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  const folded = foldLtIntent(raw);
  if (PUBLISH_WORKFLOW_RE.test(folded)) return true;
  if (
    folded === "taip" ||
    folded === "gerai" ||
    folded === "ok" ||
    folded === "okay" ||
    folded === "okej" ||
    folded === "nu" ||
    folded === "jo" ||
    folded === "yep" ||
    folded === "yes" ||
    folded === "да" ||
    folded === "ок" ||
    folded === "tinka" ||
    folded === "patvirtinu"
  ) {
    return true;
  }
  if (/^(👍|👌|✅)/u.test(raw.trim())) return true;
  if (
    folded === "publikuok" ||
    folded === "publikuoti" ||
    folded === "publikuojam" ||
    folded === "keliam" ||
    folded === "keliame"
  ) {
    return true;
  }
  if (folded === "taip tinka" || folded === "taip, tinka") return true;
  return false;
}

/** @deprecated Use isPublishWorkflowCommand */
export function isPublishConfirmationPhrase(text: string): boolean {
  return isPublishWorkflowCommand(text);
}
