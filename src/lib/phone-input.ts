/** Normalize LT phone input — single +370 prefix, no duplication. */
export function formatLtPhoneInput(raw: string): string {
  if (!raw.trim()) return "+370 ";

  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("370")) digits = digits.slice(3);
  else if (digits.startsWith("8") && digits.length <= 9) digits = digits.slice(1);

  return digits ? `+370 ${digits}` : "+370 ";
}

export function normalizeLtPhoneForApi(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("370")) return `+${digits}`;
  if (digits.startsWith("8") && digits.length === 9) return `+370${digits.slice(1)}`;
  return raw.trim();
}
