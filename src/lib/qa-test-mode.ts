import { isAuthApiAvailable } from "@/lib/auth/api";
import { ADMIN_PHONE, PRO_DEMO_PHONE } from "@/lib/reports";

export const QA_DEMO_OTP = "123456";

/** True when internal testers should see mock OTP credentials on screen. */
export function isQaTestModeActive(): boolean {
  if (process.env.NEXT_PUBLIC_VAUTO_QA_MODE === "1") return true;
  if (process.env.NEXT_PUBLIC_SHOW_DEMO_CATALOG === "true") return true;
  if (process.env.NODE_ENV === "development") return true;
  return !isAuthApiAvailable();
}

export function qaTestCredentialsSummary(): string {
  return `Testavimo režimas: Tel: ${PRO_DEMO_PHONE} arba ${ADMIN_PHONE} | Kodas: ${QA_DEMO_OTP}`;
}
