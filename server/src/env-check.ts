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

  if (isProd) {
    if (process.env.VAUTO_E2E_AUTH === "1") {
      errors.push(
        "VAUTO_E2E_AUTH=1 is forbidden in production (mock OAuth / E2E phones)"
      );
    }
    if (process.env.ALLOW_LEGACY_USER_HEADER === "true") {
      errors.push(
        "ALLOW_LEGACY_USER_HEADER=true is forbidden in production (x-user-id auth bypass)"
      );
    }
    if (process.env.SEED_DEMO_CATALOG === "1" || process.env.SEED_DEMO_CATALOG === "true") {
      errors.push("SEED_DEMO_CATALOG must not be enabled in production");
    }
    if (process.env.VAUTO_DEMO_CATALOG === "true") {
      errors.push("VAUTO_DEMO_CATALOG=true must not be enabled in production");
    }

    const smsMode = process.env.SMS_MODE?.trim().toLowerCase() ?? "";
    if (smsMode === "log" || smsMode === "mock") {
      if (process.env.VAUTO_ALLOW_DEMO_OTP === "true") {
        warnings.push(
          `SMS_MODE=${smsMode} with VAUTO_ALLOW_DEMO_OTP — QA demo OTP only; switch to bulkgate/twilio for public launch`
        );
      } else {
        errors.push(
          `SMS_MODE=${smsMode} in production without VAUTO_ALLOW_DEMO_OTP — OTP delivery will fail for real users. Set SMS_MODE=bulkgate|twilio|live`
        );
      }
    }

    if (process.env.VAUTO_ALLOW_DEMO_OTP === "true") {
      errors.push(
        "VAUTO_ALLOW_DEMO_OTP=true is forbidden in open LT production — use live BulkGate/Twilio SMS only"
      );
    }

    if (process.env.VAUTO_ALLOW_DEMO_WALLET === "true") {
      warnings.push(
        "VAUTO_ALLOW_DEMO_WALLET=true — free wallet top-ups enabled (disable for public launch)"
      );
    }

    if (
      !process.env.BULKGATE_APPLICATION_ID?.trim() &&
      !process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.VAUTO_ALLOW_DEMO_OTP !== "true"
    ) {
      warnings.push("SMS OTP carrier credentials missing (BulkGate / Twilio)");
    }
  } else if (!process.env.TWILIO_ACCOUNT_SID && !process.env.BULKGATE_APPLICATION_ID) {
    warnings.push("SMS OTP disabled (Twilio/BulkGate not configured) — using demo OTP in non-prod");
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    warnings.push("Google OAuth verification disabled (GOOGLE_CLIENT_ID missing)");
  }

  if (!process.env.APPLE_CLIENT_ID?.trim() && !process.env.APPLE_SERVICE_ID?.trim()) {
    warnings.push(
      "Apple Sign-In disabled (APPLE_CLIENT_ID / APPLE_SERVICE_ID missing — required for iOS Safari testers)"
    );
  } else if (
    !process.env.APPLE_TEAM_ID?.trim() ||
    !process.env.APPLE_KEY_ID?.trim() ||
    !(process.env.APPLE_PRIVATE_KEY?.trim() || process.env.APPLE_CLIENT_SECRET?.trim())
  ) {
    warnings.push(
      "Apple Sign-In ID-token verify OK, but Team ID / Key ID / private key incomplete (needed for authorization-code exchange)"
    );
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
