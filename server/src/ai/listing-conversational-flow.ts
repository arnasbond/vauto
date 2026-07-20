export const LISTING_CONFIRM_CHIP = "✅ Viskas tinka";
export const LISTING_EDIT_CHIP = "✏️ Dar pataisysiu";

export const PRE_PUBLISH_CARD_INTRO =
  "Puiku! Žemiau — galutinė skelbimo peržiūra. Jei viskas teisinga, spauskite „Patvirtinti ir publikuoti“.";

export function buildConversationalMissingPrompt(input: {
  missingAuth?: boolean;
  missingPhoto?: boolean;
  missingCity?: boolean;
  missingPrice?: boolean;
  missingPhone?: boolean;
}): string {
  if (input.missingAuth) {
    return "Norint publikuoti skelbimą, reikia prisijungti — prisijunkite ir tęsime pokalbį.";
  }
  if (input.missingPhoto) {
    return "Puiku! Dabar reikia nuotraukos — įkelkite ją čia pokalbyje (fotoaparato piktograma arba nutempkite failą), kad pirkėjai pamatytų prekę.";
  }
  if (input.missingCity) {
    return 'Kuriame mieste ar rajone yra prekė? Parašykite, pvz. Kaišiadorys, Kaunas arba prie Kaišiadorių.';
  }
  if (input.missingPrice) {
    return "Kokią kainą nustatome? Parašykite sumą eurais, pvz. 8500 €.";
  }
  if (input.missingPhone) {
    return "Kokiu telefono numeriu susisieks pirkėjai? Parašykite, pvz. +370 612 34567.";
  }
  return "Papildykime dar kelias detales — parašykite, ką norėtumėte patikslinti.";
}

export function buildDraftConfirmationBubble(draft: {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
}): string {
  const title = draft.title?.trim() || "Naujas skelbimas";
  const desc = draft.description?.trim() ?? "";
  const price =
    draft.price != null && draft.price > 0 ? `${draft.price} €` : "";
  const loc = draft.location?.trim() || "";

  const lines = ["Štai jūsų skelbimo variantas:", "", title];
  if (desc) lines.push("", desc.length > 280 ? `${desc.slice(0, 279).trim()}…` : desc);
  if (price) lines.push("", `Kaina: ${price}`);
  if (loc) lines.push(`Vieta: ${loc}`);
  lines.push(
    "",
    "Jei viskas tinka, parašykite viskas tinka arba spauskite mygtuką žemiau."
  );
  return lines.join("\n");
}

export function listingConfirmationQuickReplies(): string[] {
  return [LISTING_CONFIRM_CHIP, LISTING_EDIT_CHIP];
}
