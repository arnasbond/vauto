export function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidBarcode(raw: string): boolean {
  const code = normalizeBarcode(raw);
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  if (code.length === 13 || code.length === 8 || code.length === 12) {
    return checkEanChecksum(code);
  }
  return code.length >= 8;
}

function checkEanChecksum(code: string): boolean {
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    const weight = (len - i) % 2 === 0 ? 3 : 1;
    sum += digits[i]! * weight;
  }
  const expected = (10 - (sum % 10)) % 10;
  return check === expected;
}

export function extractBarcodesFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.match(/\b\d{8,14}\b/g) ?? []) {
    if (isValidBarcode(match)) found.add(normalizeBarcode(match));
  }
  return [...found];
}

export function extractBarcodeFromQrPayload(payload: string): string | undefined {
  const trimmed = payload.trim();
  if (!trimmed) return undefined;
  if (isValidBarcode(trimmed)) return normalizeBarcode(trimmed);
  const fromText = extractBarcodesFromText(trimmed);
  if (fromText[0]) return fromText[0];
  try {
    const url = new URL(trimmed);
    const pathCode = url.pathname.match(/(\d{8,14})/)?.[1];
    if (pathCode && isValidBarcode(pathCode)) return normalizeBarcode(pathCode);
    for (const key of ["ean", "gtin", "upc", "barcode"]) {
      const v = url.searchParams.get(key);
      if (v && isValidBarcode(v)) return normalizeBarcode(v);
    }
  } catch {
    /* not a URL */
  }
  return undefined;
}
