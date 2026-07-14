/** Strip workflow/UI phrases from user-facing listing title and description. */

const SYSTEM_PHRASE_PATTERNS: RegExp[] = [
  /📷\s*/gi,
  /➕\s*/gi,
  /🔍\s*/gi,
  /įkelti?\s*nuotrauk[aąų]?/gi,
  /ikelti?\s*nuotrauk[aąų]?/gi,
  /įkelti?\s*skelbim[aą]/gi,
  /ikelti?\s*skelbim[aą]/gi,
  /publikuok(?:ti)?/gi,
  /viskas\s+tinka/gi,
  /suvesti\s+tr[uū]kstamus\s+duomenis/gi,
  /telefono\s+numeris/gi,
  /^miestas$/gi,
  /reikia\s+pataisyti/gi,
  /redaguoti\s+duomenis/gi,
];

export function sanitizeListingUserText(raw: string | undefined | null): string {
  let t = String(raw ?? "").trim();
  if (!t) return "";
  for (const re of SYSTEM_PHRASE_PATTERNS) {
    t = t.replace(re, " ");
  }
  return t.replace(/\s+/g, " ").trim();
}

export function sanitizeListingTitle(raw: string | undefined | null): string {
  const cleaned = sanitizeListingUserText(raw);
  if (!cleaned) return "Naujas skelbimas";
  return cleaned.slice(0, 96);
}

export function sanitizeListingDescription(raw: string | undefined | null): string {
  return sanitizeListingUserText(raw).slice(0, 4000);
}

/** True when user text mentions uploading a photo but draft has no image yet. */
export function textClaimsPhotoUpload(text: string | undefined | null): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  return /įkelti?\s*nuotrauk|ikelti?\s*nuotrauk|📷/i.test(t);
}

export function draftTextImpliesMissingPhoto(input: {
  title?: string;
  description?: string;
  hasPhoto: boolean;
}): boolean {
  if (input.hasPhoto) return false;
  return (
    textClaimsPhotoUpload(input.title) ||
    textClaimsPhotoUpload(input.description)
  );
}
