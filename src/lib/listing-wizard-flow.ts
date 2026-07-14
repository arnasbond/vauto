/** Listing wizard — gap chips, edit mode, and workflow command helpers. */

export const GAP_CHIP_PHOTO = "📷 Įkelti nuotrauką";
export const GAP_CHIP_PHONE = "📞 Įvesti telefoną";
export const GAP_CHIP_CITY = "📍 Įvesti miestą";
export const GAP_CHIP_PRICE = "💰 Įvesti kainą";

export const EDIT_CHIP_PRICE = "Pataisyti kainą";
export const EDIT_CHIP_CATEGORY = "Pataisyti kategoriją";
export const EDIT_CHIP_DESCRIPTION = "Pataisyti aprašymą";
export const EDIT_CHIP_CONFIRM = "Viskas tinka";

export const LISTING_EDIT_INTRO =
  "Ką norite pataisyti? Pasirinkite arba parašykite pokalbyje.";

export type ListingWizardGapField = "photo" | "phone" | "city" | "price";
export type ListingWizardEditField = "price" | "category" | "description";

const GAP_CHIP_MAP: Record<string, ListingWizardGapField> = {
  [GAP_CHIP_PHOTO.toLowerCase()]: "photo",
  [GAP_CHIP_PHONE.toLowerCase()]: "phone",
  [GAP_CHIP_CITY.toLowerCase()]: "city",
  [GAP_CHIP_PRICE.toLowerCase()]: "price",
};

const EDIT_CHIP_MAP: Record<string, ListingWizardEditField> = {
  [EDIT_CHIP_PRICE.toLowerCase()]: "price",
  [EDIT_CHIP_CATEGORY.toLowerCase()]: "category",
  [EDIT_CHIP_DESCRIPTION.toLowerCase()]: "description",
};

let awaitingEditField: ListingWizardEditField | null = null;

export function readAwaitingListingEditField(): ListingWizardEditField | null {
  return awaitingEditField;
}

export function setAwaitingListingEditField(
  field: ListingWizardEditField | null
): void {
  awaitingEditField = field;
}

export function buildListingEditQuickReplies(): string[] {
  return [EDIT_CHIP_PRICE, EDIT_CHIP_CATEGORY, EDIT_CHIP_DESCRIPTION, EDIT_CHIP_CONFIRM];
}

export function isGapActionChip(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t in GAP_CHIP_MAP) return true;
  if (/^📷\s*įkelti nuotrauk/i.test(text)) return true;
  if (/^📞\s*įvesti telefon/i.test(text)) return true;
  if (/^📍\s*įvesti miest/i.test(text)) return true;
  if (/^💰\s*įvesti kain/i.test(text)) return true;
  if (/^įkelti nuotrauk/i.test(t)) return true;
  if (/^telefono numer/i.test(t)) return true;
  if (/^miestas$/i.test(t)) return true;
  return false;
}

export function gapFieldFromChip(text: string): ListingWizardGapField | null {
  const t = text.trim().toLowerCase();
  if (GAP_CHIP_MAP[t]) return GAP_CHIP_MAP[t];
  if (/^📷\s*įkelti nuotrauk/i.test(text) || /^įkelti nuotrauk/i.test(t)) return "photo";
  if (/^📞\s*įvesti telefon/i.test(text) || /^telefono numer/i.test(t)) return "phone";
  if (/^📍\s*įvesti miest/i.test(text) || /^miestas$/i.test(t)) return "city";
  if (/^💰\s*įvesti kain/i.test(t)) return "price";
  return null;
}

export function isEditActionChip(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t in EDIT_CHIP_MAP || /^redaguoti duomenis$/i.test(t);
}

export function editFieldFromChip(text: string): ListingWizardEditField | null {
  const t = text.trim().toLowerCase();
  return EDIT_CHIP_MAP[t] ?? null;
}

export function buildListingEditPrompt(field: ListingWizardEditField): string {
  switch (field) {
    case "price":
      return "Kokia turėtų būti kaina? Parašykite sumą eurais, pvz. 1200 €.";
    case "category":
      return "Kokia kategorija? Parašykite, pvz. Automobiliai, Būstas, Drabužiai.";
    case "description":
      return "Parašykite naują aprašymą — pakeisiu esamą tekstą.";
    default:
      return LISTING_EDIT_INTRO;
  }
}
