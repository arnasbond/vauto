/** Normalize LT phone input — single +370 prefix, no duplication. */
export function formatLtPhoneInput(raw: string): string {
  if (!raw.trim()) return "+370 ";

  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("370")) digits = digits.slice(3);
  else if (digits.startsWith("8") && digits.length <= 9) digits = digits.slice(1);
  else if (digits.startsWith("0") && digits.length <= 9) digits = digits.slice(1);

  return digits ? `+370 ${digits}` : "+370 ";
}

/** E.164-ish form for API OTP send/verify (+3706xxxxxxx). */
export function normalizeLtPhoneForApi(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && /^3706\d{7}$/.test(digits)) return `+${digits}`;
  if (digits.length === 9 && /^86\d{7}$/.test(digits)) {
    return `+370${digits.slice(1)}`;
  }
  if (digits.length === 9 && /^06\d{7}$/.test(digits)) {
    return `+370${digits.slice(1)}`;
  }
  if (digits.length === 8 && /^6\d{7}$/.test(digits)) {
    return `+370${digits}`;
  }
  if (digits.startsWith("370")) return `+${digits}`;
  if (digits.startsWith("8") && digits.length === 9) return `+370${digits.slice(1)}`;
  return raw.trim();
}

/** True for LT mobiles used by live SMS OTP. */
export function isValidLtMobilePhoneInput(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return (
    (digits.length === 11 && /^3706\d{7}$/.test(digits)) ||
    (digits.length === 9 && /^[08]6\d{7}$/.test(digits)) ||
    (digits.length === 8 && /^6\d{7}$/.test(digits))
  );
}
