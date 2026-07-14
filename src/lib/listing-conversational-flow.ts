import type { PrePublishReadiness } from "@/lib/pre-publish-validation";

export const LISTING_CONFIRM_CHIP = "✅ Viskas tinka";
export const LISTING_EDIT_CHIP = "✏️ Dar pataisysiu";

export const PRE_PUBLISH_CARD_INTRO =
  "Puiku! Peržiūrėkite skelbimą ir spauskite publikuoti 👇";

/** One friendly question at a time — no warning walls or form widgets. */
export function buildConversationalMissingPrompt(
  readiness: Pick<
    PrePublishReadiness,
    | "missingAuth"
    | "missingPhoto"
    | "missingCity"
    | "missingPrice"
    | "missingPhone"
  >
): string {
  if (readiness.missingAuth) {
    return "Norint publikuoti skelbimą, reikia prisijungti — prisijunkite ir tęsime pokalbį.";
  }
  if (readiness.missingPhoto) {
    return "Puiku! Dabar reikia nuotraukos — įkelkite ją čia pokalbyje (fotoaparato piktograma arba nutempkite failą), kad pirkėjai pamatytų prekę.";
  }
  if (readiness.missingCity) {
    return 'Kuriame mieste ar rajone yra prekė? Parašykite, pvz. Kaišiadorys, Kaunas arba prie Kaišiadorių.';
  }
  if (readiness.missingPrice) {
    return "Kokią kainą nustatome? Parašykite sumą eurais, pvz. 8500 €.";
  }
  if (readiness.missingPhone) {
    return "Kokiu telefono numeriu susisieks pirkėjai? Parašykite, pvz. +370 612 34567.";
  }
  return "Papildykime dar kelias detales — parašykite, ką norėtumėte patikslinti.";
}

export interface DraftConfirmationInput {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
}

function truncate(text: string, max = 280): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

/** Stage 2: polished draft preview inside a chat bubble before the card. */
export function buildDraftConfirmationBubble(draft: DraftConfirmationInput): string {
  const title = draft.title?.trim() || "Naujas skelbimas";
  const desc = draft.description?.trim() ? truncate(draft.description) : "";
  const price =
    draft.price != null && draft.price > 0 ? `${draft.price} €` : "";
  const loc = draft.location?.trim() || "";

  const lines = ["Štai jūsų skelbimo variantas:", "", title];
  if (desc) lines.push("", desc);
  if (price) lines.push("", `Kaina: ${price}`);
  if (loc) lines.push(`Vieta: ${loc}`);
  lines.push(
    "",
    'Jei viskas tinka, parašykite viskas tinka arba spauskite mygtuką žemiau.'
  );
  return lines.join("\n");
}

export function listingConfirmationQuickReplies(): string[] {
  return [LISTING_CONFIRM_CHIP, LISTING_EDIT_CHIP];
}
