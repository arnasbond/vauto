/** Normalize LT phone input — single +370 prefix, no duplication. */
export function formatLtPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^370/, "").replace(/^8(?=\d{8}$)/, "");
  if (!digits) return "+370 ";
  return `+370 ${digits}`;
}

export function normalizeLtPhoneForApi(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("370")) return `+${digits}`;
  if (digits.startsWith("8") && digits.length === 9) return `+370${digits.slice(1)}`;
  return raw.trim();
}
