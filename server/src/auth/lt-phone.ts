/**
 * Lithuanian mobile phone (+370) validation & E.164 normalization for SMS OTP.
 */

/** True for LT mobiles: +370 6xx xxxxx, 86xxxxxxx, 06xxxxxxx, 6xxxxxxx. */
export function isValidLtMobilePhone(phone: string): boolean {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 11 && /^3706\d{7}$/.test(digits)) return true;
  if (digits.length === 9 && /^[08]6\d{7}$/.test(digits)) return true;
  if (digits.length === 8 && /^6\d{7}$/.test(digits)) return true;
  return false;
}

/** Normalize to E.164 (+3706xxxxxxx) or null if invalid. */
export function normalizeLtMobileE164(phone: string): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 11 && /^3706\d{7}$/.test(digits)) {
    return `+${digits}`;
  }
  if (digits.length === 9 && /^86\d{7}$/.test(digits)) {
    return `+370${digits.slice(1)}`;
  }
  if (digits.length === 9 && /^06\d{7}$/.test(digits)) {
    return `+370${digits.slice(1)}`;
  }
  if (digits.length === 8 && /^6\d{7}$/.test(digits)) {
    return `+370${digits}`;
  }
  return null;
}
