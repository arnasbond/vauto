/** Shared ChatGPT-style copy — warm, proactive, never dry dead-ends. */

function humanizeSearchItem(searchQuery: string): string {
  const q = searchQuery.trim().toLowerCase();
  if (/bat|aul|bas/.test(q)) return "tokių batelių";
  if (/sukn|dress/.test(q)) return "tokių suknelių";
  if (/ked|bat/.test(q)) return "tokių batų ar kedų";
  if (/džins|keln|jean/.test(q)) return "tokių džinsų";
  if (/pal|stri|megz/.test(q)) return "tokių drabužių";
  const first = q.split(/\s+/).find((w) => w.length >= 3);
  return first ? `tokių „${first}"` : "tokių prekių";
}

export function buildEmptySearchBannerMessage(searchQuery?: string): string {
  const item = humanizeSearchItem(searchQuery ?? "");
  return `Šiuo metu ${item} turguje neradau — bet galiu užfiksuoti jūsų norą ir pranešti, kai kas nors įkels. Parašykite AI asistentui žemiau arba pabandykite kitą frazę.`;
}

export function buildEmptySearchToastMessage(searchQuery?: string): string {
  const q = searchQuery?.trim();
  if (!q) {
    return "Kol kas nieko neradau — padėsiu patikslinti ar užregistruoti norą.";
  }
  return `Kol kas „${q}" neradau — padėsiu patikslinti ar užregistruoti norą.`;
}

export function buildPhotoVisionFallbackMessage(qualityHint?: string): string {
  if (qualityHint?.trim()) {
    return `Nuotrauka ne visai aiški — ${qualityHint.trim()} Tuo tarpu galite parašyti, ką ieškote, ir padėsiu toliau.`;
  }
  return "Nuotrauka ne visai aiški — pabandykite geresnį apšvietimą arba tiesiog parašykite, ką ieškote, ir padėsiu toliau.";
}

export const CHAT_MESSAGE_SENT_CONFIRMATION =
  "Puiku — žinutė jau pakeliui pas pardavėją! Atsakymą matysite čia.";
