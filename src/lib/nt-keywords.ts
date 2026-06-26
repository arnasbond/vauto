/** Shared Lithuanian real-estate (NT) keyword detection and title inference. */

export const NT_KEYWORD_PATTERN =
  /\b(butas?|butą|butu|butai|namas?|namą|namu|namai|žem[eė]|zeme|sklyp|sodyb|kotedž|kotedz|patalp|garaž|garaz|nekilnojam|nt\b|gyvenam|būst|bust)\b/i;

export function isRealEstateQuery(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return NT_KEYWORD_PATTERN.test(t);
}

export function inferRealEstateTitle(text: string): string {
  const t = text.toLowerCase();
  const renting = /\bnuom/i.test(t);

  if (/\bbut/i.test(t)) {
    return renting ? "Nuomojamas butas" : "Parduodamas butas";
  }
  if (/\bnam|sodyb/i.test(t)) {
    return renting
      ? "Nuomojamas gyvenamasis namas"
      : "Parduodamas gyvenamasis namas";
  }
  if (/\bžem|zem|sklyp/i.test(t)) {
    return renting ? "Nuomojamas sklypas" : "Parduodamas sklypas / žemės plotas";
  }
  if (/\bkotedž|kotedz/i.test(t)) {
    return renting ? "Nuomojamas kotedžas" : "Parduodamas kotedžas";
  }
  if (/\bpatalp/i.test(t)) {
    return renting ? "Nuomojamos patalpos" : "Parduodamos komercinės patalpos";
  }
  if (/\bgaraž|garaz/i.test(t)) {
    return renting ? "Nuomojamas garažas" : "Parduodamas garažas";
  }
  if (renting) return "Nuomojamas nekilnojamasis turtas";
  return "Parduodamas nekilnojamasis turtas";
}

/** Never emit generic placeholder titles when text hints at an object. */
export function inferListingTitleFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (isRealEstateQuery(trimmed)) return inferRealEstateTitle(trimmed);

  const vehicleGeneric =
    /\b(auto|automob|automobil|mašin|masin|noriu parduot.*auto|parduod.*auto|parduod.*masin|parduod.*automobil)\b/i;
  if (vehicleGeneric.test(trimmed)) return "Parduodamas automobilis";

  if (trimmed.length > 8 && trimmed.length <= 80) {
    const first = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    if (!/universalus daiktas/i.test(first)) return first;
  }

  return null;
}
