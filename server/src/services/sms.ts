import { logProductionError, logProductionWarn } from "../lib/production-log.js";
import { isE2eTestPhone } from "../auth/e2e-mock-auth.js";
import { isDemoBypassPhone } from "../auth/demo-phones.js";

export type SmsProvider = "mock" | "log" | "twilio" | "bulkgate";

function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
  );
}

function bulkgateConfigured(): boolean {
  return Boolean(
    process.env.BULKGATE_APPLICATION_ID && process.env.BULKGATE_APPLICATION_TOKEN
  );
}

function isNodeProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Live carrier delivery is allowed only in production.
 * Dev / E2E / browser probes / local always use mock (console OTP), even if
 * BulkGate or Twilio credentials are present in the environment.
 */
export function allowLiveSmsCarrier(): boolean {
  return isNodeProduction();
}

/**
 * Active SMS provider.
 *
 * - Non-production → always `mock` (never calls BulkGate/Twilio).
 * - Production + SMS_MODE=live|twilio|bulkgate (or auto with creds) → carrier.
 * - Production misconfig → `log` (no silent fake success as "live").
 */
export function getSmsProvider(): SmsProvider {
  if (!allowLiveSmsCarrier()) {
    return "mock";
  }

  const mode = process.env.SMS_MODE?.trim().toLowerCase();

  if (mode === "mock" || mode === "log") {
    return mode;
  }

  if (mode === "live") {
    if (twilioConfigured()) return "twilio";
    if (bulkgateConfigured()) return "bulkgate";
    // Live requested but credentials missing — fail closed (not silent mock).
    return "twilio";
  }

  if (mode === "twilio") return "twilio";
  if (mode === "bulkgate") return "bulkgate";

  // Production auto: prefer configured carriers.
  if (twilioConfigured()) return "twilio";
  if (bulkgateConfigured()) return "bulkgate";
  return "log";
}

/** True when OTP will be delivered via a real SMS carrier (not mock/log). */
export function isSmsLive(): boolean {
  if (!allowLiveSmsCarrier()) return false;
  const provider = getSmsProvider();
  if (provider === "twilio") return twilioConfigured();
  if (provider === "bulkgate") return bulkgateConfigured();
  return false;
}

/**
 * Test / QA numbers must never burn BulkGate credits — even against production API.
 */
export function shouldMockSmsForPhone(phone?: string | null): boolean {
  if (!allowLiveSmsCarrier()) return true;
  if (isE2eTestPhone(phone)) return true;
  if (isDemoBypassPhone(phone)) return true;
  return false;
}

function otpMessage(code: string): string {
  return `VAUTO patvirtinimo kodas: ${code}. Galioja 5 min.`;
}

async function sendViaTwilio(phone: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: phone, From: from, Body: body }),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logProductionError("sms", new Error(`Twilio HTTP ${res.status}`), {
        phoneSuffix: phone.slice(-4),
        response: text.slice(0, 200),
      });
      return false;
    }
    return true;
  } catch (err) {
    logProductionError("sms", err, { phoneSuffix: phone.slice(-4) });
    return false;
  }
}

/** BulkGate transactional SMS — production only (see allowLiveSmsCarrier). */
async function sendViaBulkGate(phone: string, body: string): Promise<boolean> {
  const appId = process.env.BULKGATE_APPLICATION_ID;
  const appToken = process.env.BULKGATE_APPLICATION_TOKEN;
  if (!appId || !appToken) return false;

  try {
    const res = await fetch("https://portal.bulkgate.com/api/1.0/simple/transactional", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        application_id: appId,
        application_token: appToken,
        number: phone.replace(/\s/g, ""),
        text: body,
        unicode: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logProductionError("sms", new Error(`BulkGate HTTP ${res.status}`), {
        phoneSuffix: phone.slice(-4),
        response: text.slice(0, 200),
      });
      return false;
    }
    return true;
  } catch (err) {
    logProductionError("sms", err, { phoneSuffix: phone.slice(-4) });
    return false;
  }
}

function logMockSms(phone: string, body: string, reason: string): void {
  console.log(`[VAUTO SMS:mock] (${reason}) to ${phone}: ${body}`);
}

/**
 * Send arbitrary SMS body via configured provider.
 * Mock/log modes write the body to the server console (includes OTP).
 */
export async function sendSms(phone: string, body: string): Promise<boolean> {
  if (shouldMockSmsForPhone(phone)) {
    const reason = !allowLiveSmsCarrier()
      ? "non-production"
      : isE2eTestPhone(phone)
        ? "e2e-phone"
        : "demo-phone";
    logMockSms(phone, body, reason);
    return true;
  }

  const provider = getSmsProvider();

  if (provider === "mock" || provider === "log") {
    console.log(`[VAUTO SMS:${provider}] to ${phone}: ${body}`);
    if (provider === "log" && isNodeProduction()) {
      logProductionWarn("sms", "SMS logged (no live carrier) — set SMS_MODE=live + BulkGate/Twilio", {
        phoneSuffix: phone.slice(-4),
      });
    }
    return true;
  }

  if (provider === "twilio") {
    if (!twilioConfigured()) {
      logProductionWarn("sms", "Twilio selected but env vars missing", {
        phoneSuffix: phone.slice(-4),
      });
      return false;
    }
    return sendViaTwilio(phone, body);
  }

  if (!bulkgateConfigured()) {
    logProductionWarn("sms", "BulkGate selected but env vars missing", {
      phoneSuffix: phone.slice(-4),
    });
    return false;
  }
  return sendViaBulkGate(phone, body);
}

/** Send OTP SMS via configured provider. Mock/log writes to server console. */
export async function sendOtpSms(phone: string, code: string): Promise<boolean> {
  return sendSms(phone, otpMessage(code));
}
