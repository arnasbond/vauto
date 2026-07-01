/** Optional Twilio SMS — falls back to console log in dev when not configured. */
import { logProductionError, logProductionWarn } from "../lib/production-log.js";

export async function sendSmsOtp(phone: string, code: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[VAUTO SMS] OTP for ${phone}: ${code} (Twilio not configured)`);
    } else {
      logProductionWarn("sms", "Twilio not configured — OTP not sent", {
        phoneSuffix: phone.slice(-4),
      });
    }
    return false;
  }

  const body = `VAUTO patvirtinimo kodas: ${code}. Galioja 10 min.`;
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
