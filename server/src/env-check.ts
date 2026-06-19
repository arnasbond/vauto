const DEV_JWT_SECRET = "vauto-dev-secret-change-in-production";

export interface EnvCheckResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
}

export function validateProductionEnv(): EnvCheckResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.JWT_SECRET;

  if (isProd && (!secret || secret === DEV_JWT_SECRET)) {
    errors.push("JWT_SECRET must be set to a strong random value in production");
  }

  if (!process.env.DATABASE_URL) {
    warnings.push("DATABASE_URL not set — PostgreSQL required for live API");
  }

  if (!process.env.TWILIO_ACCOUNT_SID) {
    warnings.push("SMS OTP disabled (Twilio not configured)");
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    warnings.push("Google OAuth verification disabled (GOOGLE_CLIENT_ID missing)");
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    warnings.push("Web Push disabled (VAPID keys missing)");
  }

  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    warnings.push("FCM Android push disabled (Firebase service account missing)");
  }

  for (const w of warnings) {
    console.warn(`[Vauto Env] ${w}`);
  }

  for (const e of errors) {
    console.error(`[Vauto Env] FATAL: ${e}`);
  }

  return { ok: errors.length === 0, warnings, errors };
}

export function assertProductionEnv(): void {
  const result = validateProductionEnv();
  if (!result.ok && process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}
