import { logProductionError, logProductionWarn } from "../lib/production-log.js";

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

/** Active SMS provider — mock/log for dev, twilio/bulkgate when configured. */
export function getSmsProvider(): SmsProvider {
  const mode = process.env.SMS_MODE?.trim().toLowerCase();
  if (mode === "mock" || mode === "log" || mode === "twilio" || mode === "bulkgate") {
    return mode;
  }
  if (twilioConfigured()) return "twilio";
  if (bulkgateConfigured()) return "bulkgate";
  return process.env.NODE_ENV === "production" ? "log" : "mock";
}

export function isSmsLive(): boolean {
  const provider = getSmsProvider();
  if (provider === "twilio") return twilioConfigured();
  if (provider === "bulkgate") return bulkgateConfigured();
  return false;
}

function otpMessage(code: string): string {
  return `VAUTO patvirtinimo kodas: ${code}. Galioja 5 min.`;
}

async function sendViaTwilio(phone: string, code: string): Promise<boolean> {
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
        body: new URLSearchParams({ To: phone, From: from, Body: otpMessage(code) }),
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

/** BulkGate transactional SMS — ready to wire when credentials are set. */
async function sendViaBulkGate(phone: string, code: string): Promise<boolean> {
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
        text: otpMessage(code),
        unicode: false,
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

/** Send OTP SMS via configured provider. Mock/log writes to server console. */
export async function sendOtpSms(phone: string, code: string): Promise<boolean> {
  const provider = getSmsProvider();

  if (provider === "mock" || provider === "log") {
    console.log(`[VAUTO SMS:${provider}] OTP for ${phone}: ${code}`);
    if (provider === "log" && process.env.NODE_ENV === "production") {
      logProductionWarn("sms", "OTP logged (SMS_MODE=log) — configure Twilio or BulkGate", {
        phoneSuffix: phone.slice(-4),
      });
    }
    return true;
  }

  if (provider === "twilio") {
    if (!twilioConfigured()) {
      logProductionWarn("sms", "SMS_MODE=twilio but Twilio env vars missing", {
        phoneSuffix: phone.slice(-4),
      });
      return false;
    }
    return sendViaTwilio(phone, code);
  }

  if (!bulkgateConfigured()) {
    logProductionWarn("sms", "SMS_MODE=bulkgate but BulkGate env vars missing", {
      phoneSuffix: phone.slice(-4),
    });
    return false;
  }
  return sendViaBulkGate(phone, code);
}
