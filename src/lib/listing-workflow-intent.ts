/**
 * Listing seller-flow workflow commands — system intents, NOT listing field content.
 * Must never be appended to title/description or persisted to DB payload fields.
 */

function foldLt(raw: string): string {
  return raw
    .normalize("NFC")
    .toLowerCase()
    .replace(/[.!?,…]+$/g, "")
    .trim()
    .replace(/ą/g, "a")
    .replace(/č/g, "c")
    .replace(/ę/g, "e")
    .replace(/ė/g, "e")
    .replace(/į/g, "i")
    .replace(/š/g, "s")
    .replace(/ų/g, "u")
    .replace(/ū/g, "u")
    .replace(/ž/g, "z");
}

const PUBLISH_WORKFLOW_RE =
  /\b(viskas\s+tinka|viskas\s+gerai|viskas\s+ok|viskas\s+tikslu|viskas\s+tvarkoje|viskas\s+atitinka|taip,?\s*viskas|taip,?\s*publikuoti|publikuojam|publikuok|publikuoti|skelbti|skelbiam|taip,?\s*skelbti)\b/;

const EXACT_PUBLISH_COMMANDS = new Set([
  "taip",
  "gerai",
  "ok",
  "okay",
  "tinka",
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
  const folded = foldLt(raw);
  if (EXACT_PUBLISH_COMMANDS.has(folded)) return true;
  if (PUBLISH_WORKFLOW_RE.test(folded)) return true;
  if (WORKFLOW_CHIP_RE.test(folded)) return true;
  return false;
}

export function isPublishWorkflowCommand(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  const folded = foldLt(raw);
  if (PUBLISH_WORKFLOW_RE.test(folded)) return true;
  if (
    folded === "taip" ||
    folded === "gerai" ||
    folded === "ok" ||
    folded === "okay" ||
    folded === "tinka" ||
    folded === "patvirtinu"
  ) {
    return true;
  }
  if (folded === "publikuok" || folded === "publikuoti" || folded === "publikuojam") {
    return true;
  }
  if (folded === "taip tinka" || folded === "taip, tinka") return true;
  return false;
}

/** @deprecated Use isPublishWorkflowCommand */
export function isPublishConfirmationPhrase(text: string): boolean {
  return isPublishWorkflowCommand(text);
}
