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

/** ISBN-13 book prefix (978/979) or valid ISBN-13 EAN. */
export function isIsbnBarcode(raw: string): boolean {
  const code = normalizeBarcode(raw);
  if (code.length !== 13 || !isValidBarcode(code)) return false;
  return code.startsWith("978") || code.startsWith("979");
}

export type BarcodeKind = "isbn" | "ean" | "upc";

export function classifyBarcode(raw: string): BarcodeKind {
  if (isIsbnBarcode(raw)) return "isbn";
  const code = normalizeBarcode(raw);
  if (code.length === 12) return "upc";
  return "ean";
}

export function extractBarcodesFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.match(/\b\d{8,14}\b/g) ?? []) {
    if (isValidBarcode(match)) found.add(normalizeBarcode(match));
  }
  return [...found];
}
