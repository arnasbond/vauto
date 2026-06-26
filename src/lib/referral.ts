import { SITE_URL } from "@/lib/social-share";
import {
  canUseCapacitorShare,
  shareViaCapacitor,
  type NativeSharePayload,
} from "@/lib/native-share";
import type { UserProfile } from "@/lib/types";

const REFERRAL_STORAGE_KEY = "vauto_pending_referral_v1";
const REFERRAL_CREDITS_KEY = "vauto_referral_credits_v1";

/** Vieša registracijos nuoroda su ref parametru (nacionalinis domenas). */
export const REFERRAL_SIGNUP_BASE =
  process.env.NEXT_PUBLIC_REFERRAL_BASE?.replace(/\/$/, "") ||
  "https://vauto.lt/registracija";

export function buildReferralUrl(userId: string): string {
  const base = REFERRAL_SIGNUP_BASE.includes("://")
    ? REFERRAL_SIGNUP_BASE
    : `${SITE_URL}/registracija`;
  const url = new URL(base.endsWith("/") ? base : `${base}/`);
  url.searchParams.set("ref", userId);
  return url.toString();
}

export function storePendingReferral(ref: string): void {
  if (typeof window === "undefined" || !ref.trim()) return;
  try {
    localStorage.setItem(REFERRAL_STORAGE_KEY, ref.trim());
  } catch {
    /* ignore */
  }
}

export function consumePendingReferral(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const ref = localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (ref) localStorage.removeItem(REFERRAL_STORAGE_KEY);
    return ref;
  } catch {
    return null;
  }
}

export function getReferralCredits(userId: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(REFERRAL_CREDITS_KEY);
    if (!raw) return 0;
    const map = JSON.parse(raw) as Record<string, number>;
    return map[userId] ?? 0;
  } catch {
    return 0;
  }
}

export function grantReferralCredit(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(REFERRAL_CREDITS_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    map[userId] = (map[userId] ?? 0) + 1;
    localStorage.setItem(REFERRAL_CREDITS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function referralSharePayload(user: UserProfile): NativeSharePayload {
  const url = buildReferralUrl(user.id);
  return {
    title: "Vauto — skelbimai visoje Lietuvoje",
    text: `Prisijunk prie VAUTO ir gauk TOP iškėlimą! Naudok mano pakvietimo nuorodą:`,
    url,
    dialogTitle: "Pakviesti draugą",
  };
}

export async function shareReferralInvite(user: UserProfile): Promise<boolean> {
  const payload = referralSharePayload(user);

  if (canUseCapacitorShare()) {
    const ok = await shareViaCapacitor(payload);
    if (ok) return true;
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(payload);
      return true;
    } catch {
      /* dismissed */
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(`${payload.text}\n${payload.url}`);
    return true;
  }

  return false;
}
