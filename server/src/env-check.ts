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

  if (!process.env.GEMINI_API_KEY?.trim() && !process.env.AI_KEY?.trim() && !process.env.GOOGLE_AI_API_KEY?.trim()) {
    warnings.push("Gemini agent disabled (GEMINI_API_KEY / AI_KEY / GOOGLE_AI_API_KEY missing)");
  }

  if (
    !process.env.GOOGLE_CLOUD_VISION_CREDENTIALS_JSON?.trim() &&
    !process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() &&
    !(
      process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim()
    ) &&
    process.env.TESSERACT_OCR_ENABLED !== "1"
  ) {
    warnings.push("Visual OCR disabled (set Google Vision, AWS Textract, or TESSERACT_OCR_ENABLED=1)");
  }

  if (
    !process.env.PHOTOROOM_API_KEY?.trim() &&
    !process.env.CLIPDROP_API_KEY?.trim() &&
    !process.env.REMOVEBG_API_KEY?.trim()
  ) {
    warnings.push("Studio background removal disabled (PhotoRoom / Clipdrop / Remove.bg key missing)");
  }

  for (const w of warnings) {
    console.warn(`[VAUTO Env] ${w}`);
  }

  for (const e of errors) {
    console.error(`[VAUTO Env] FATAL: ${e}`);
  }

  return { ok: errors.length === 0, warnings, errors };
}

export function assertProductionEnv(): void {
  const result = validateProductionEnv();
  if (!result.ok && process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}
