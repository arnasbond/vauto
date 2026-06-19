/** Optional Twilio SMS — falls back to console log in dev when not configured. */
export async function sendSmsOtp(phone: string, code: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Vauto SMS] OTP for ${phone}: ${code} (Twilio not configured)`);
    }
    return false;
  }

  const body = `Vauto patvirtinimo kodas: ${code}. Galioja 10 min.`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
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
    console.error(`[Vauto SMS] Twilio error ${res.status}: ${text}`);
    return false;
  }
  return true;
}
