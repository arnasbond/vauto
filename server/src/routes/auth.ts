import { Router } from "express";
import {
  demoOtpCode,
  isDemoBypassPhone,
  verifyDemoBypassOtp,
} from "../auth/demo-phones.js";
import { getTokenTtlMs, signAccessToken } from "../auth/tokens.js";
import { verifyAppleIdToken } from "../auth/apple-verify.js";
import { verifyGoogleIdToken } from "../auth/google-verify.js";
import {
  getOtpCodeLength,
  issueOtp,
  purgeExpiredOtps,
  usesDemoOtp,
  verifyOtp,
} from "../services/otp.js";
import { sendOtpSms } from "../services/sms.js";
import { getUser, getUserByPhoneDigits, upsertUser } from "../repository.js";
import {
  applyReferralOnSignup,
  attachReferralFields,
} from "../referral/referral-service.js";
import type { ApiUser } from "../types.js";
import { exposeOtpDevHint } from "../demo-guards.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const authRouter = Router();

const OTP_SEND_WINDOW_MS = 60_000;
const OTP_SEND_MAX_PER_WINDOW = 5;
const otpSendBuckets = new Map<string, { count: number; resetAt: number }>();

function otpSendRateLimited(phone: string): boolean {
  const key = phone.replace(/\D/g, "");
  if (isDemoBypassPhone(key)) return false;
  const now = Date.now();
  const bucket = otpSendBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    otpSendBuckets.set(key, { count: 1, resetAt: now + OTP_SEND_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > OTP_SEND_MAX_PER_WINDOW;
}

function stableUserId(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `user-${Math.abs(hash)}`;
}

function defaultAvatar(provider: string): string {
  return provider === "apple"
    ? "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop"
    : "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop";
}

function providerName(provider: string): string {
  if (provider === "google") return "Google vartotojas";
  if (provider === "apple") return "Apple vartotojas";
  return "Mobilus vartotojas";
}

function resolveAdminEmail(): string {
  return (process.env.ADMIN_EMAIL ?? "admin@vauto.com").toLowerCase();
}

function normalizePhoneDigits(phone?: string | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

function resolveAdminPhone(): string {
  return normalizePhoneDigits(process.env.ADMIN_PHONE ?? "+37060000099");
}

function resolveRole(
  metaRole: string,
  email?: string | null,
  phone?: string | null
): string {
  if (email?.toLowerCase() === resolveAdminEmail()) return "super_admin";
  if (
    metaRole === "admin" &&
    normalizePhoneDigits(phone) === resolveAdminPhone()
  ) {
    return "super_admin";
  }
  return metaRole;
}

/** Login must never downgrade an established account or re-prompt for account type. */
function resolveLoginRole(
  metaRole: string,
  existing: ApiUser | null,
  email?: string | null,
  phone?: string | null
): string {
  const adminRole = resolveRole(metaRole, email, phone);
  if (adminRole === "super_admin") return "super_admin";
  if (existing?.role === "pro" || existing?.role === "super_admin") {
    return existing.role;
  }
  if (existing?.role) return existing.role;
  return "private";
}

async function buildSession(
  userId: string,
  profile: Partial<ApiUser> & { id: string },
  meta: {
    role: string;
    provider: string;
    businessType?: string;
    companyName?: string;
    companyCode?: string;
    vatCode?: string;
    serviceBaseCity?: string;
    serviceRadiusKm?: number;
    serviceNationwide?: boolean;
    serviceSpecialties?: string[];
  }
) {
  const existing = await getUser(userId);
  const email = profile.email ?? existing?.email;
  const phone = profile.phone ?? existing?.phone;
  const role = resolveLoginRole(meta.role, existing, email, phone);
  const user: ApiUser = {
    id: userId,
    name: profile.name ?? existing?.name ?? providerName(meta.provider),
    phone: profile.phone ?? existing?.phone ?? "+370",
    city: profile.city ?? existing?.city ?? "Vilnius",
    avatar: profile.avatar ?? existing?.avatar ?? defaultAvatar(meta.provider),
    email,
    warned: existing?.warned ?? false,
    role,
    businessType: existing?.businessType ?? meta.businessType,
    authProvider: meta.provider,
    companyName: existing?.companyName ?? meta.companyName,
    companyCode: existing?.companyCode ?? meta.companyCode,
    vatCode: existing?.vatCode ?? meta.vatCode,
    billingPlan: existing?.billingPlan ?? (role === "pro" ? "starter" : "free"),
    billingModel: existing?.billingModel ?? (role === "pro" ? "ppc" : undefined),
    serviceBaseCity: meta.serviceBaseCity ?? existing?.serviceBaseCity,
    serviceRadiusKm: meta.serviceRadiusKm ?? existing?.serviceRadiusKm,
    serviceNationwide: meta.serviceNationwide ?? existing?.serviceNationwide,
    serviceSpecialties: meta.serviceSpecialties ?? existing?.serviceSpecialties,
    averageResponseMinutes: existing?.averageResponseMinutes ?? (meta.businessType === "services" ? 12 : undefined),
    soldCount: existing?.soldCount ?? 0,
    walletBalance:
      existing?.walletBalance ??
      (role === "pro" ? 25 : role === "admin" ? 0 : 0),
    profileType: existing?.profileType,
  };
  await upsertUser(user);
  const enriched = await attachReferralFields(user);
  const token = signAccessToken({
    sub: userId,
    role,
    provider: meta.provider,
  });
  return {
    token,
    expiresAt: new Date(Date.now() + getTokenTtlMs()).toISOString(),
    user: enriched,
    role,
    provider: meta.provider,
  };
}

async function finalizeSessionWithReferral(
  userId: string,
  session: Awaited<ReturnType<typeof buildSession>>,
  referralCode?: string
) {
  if (!referralCode) return session;
  await applyReferralOnSignup(userId, referralCode);
  const refreshed = await getUser(userId);
  if (refreshed) {
    session.user = await attachReferralFields(refreshed);
  }
  return session;
}

authRouter.post("/otp/send", (req, res) => {
  const phone = String(req.body?.phone ?? "").trim();
  if (phone.replace(/\D/g, "").length < 8) {
    res.status(400).json({ error: "Invalid phone number" });
    return;
  }
  if (otpSendRateLimited(phone)) {
    res.status(429).json({ error: "Per daug OTP užklausų. Bandykite vėliau." });
    return;
  }
  purgeExpiredOtps();
  const { code, expiresAt } = issueOtp(phone);
  void sendOtpSms(phone, code);
  if (usesDemoOtp() && exposeOtpDevHint()) {
    console.log(`[VAUTO Auth] Demo OTP for ${phone}: ${demoOtpCode()}`);
  }
  res.json({
    ok: true,
    expiresAt: new Date(expiresAt).toISOString(),
    codeLength: getOtpCodeLength(),
    ...(usesDemoOtp() && exposeOtpDevHint()
      ? { devHint: `Demo OTP: ${demoOtpCode()}` }
      : {}),
  });
});

authRouter.post("/otp/verify", async (req, res) => {
  try {
    const phone = String(req.body?.phone ?? "").trim();
    const code = String(req.body?.code ?? "").trim();
    const role = String(req.body?.role ?? "private");
    const city = String(req.body?.city ?? "Vilnius");
    const businessType = req.body?.businessType
      ? String(req.body.businessType)
      : undefined;
    const companyName = req.body?.companyName ? String(req.body.companyName) : undefined;
    const companyCode = req.body?.companyCode ? String(req.body.companyCode) : undefined;
    const vatCode = req.body?.vatCode ? String(req.body.vatCode) : undefined;
    const serviceBaseCity = req.body?.serviceBaseCity ? String(req.body.serviceBaseCity) : undefined;
    const serviceRadiusKm = req.body?.serviceRadiusKm ? Number(req.body.serviceRadiusKm) : undefined;
    const serviceNationwide = req.body?.serviceNationwide === true;
    const serviceSpecialties = Array.isArray(req.body?.serviceSpecialties)
      ? (req.body.serviceSpecialties as unknown[]).map(String)
      : undefined;
    const referralCode = req.body?.referralCode
      ? String(req.body.referralCode).trim()
      : undefined;

    if (!verifyOtp(phone, code) && !verifyDemoBypassOtp(phone, code)) {
      res.status(401).json({ error: "Neteisingas arba pasibaigęs kodas" });
      return;
    }

    const phoneDigits = phone.replace(/\D/g, "");
    const userId = stableUserId(`phone:${phoneDigits}`);
    const existingByPhone = await getUserByPhoneDigits(phoneDigits);
    const isRegistration = req.body?.isRegistration === true;

    if (existingByPhone && existingByPhone.id !== userId) {
      res.status(409).json({ error: "Toks vartotojas jau egzistuoja" });
      return;
    }

    if (isRegistration && existingByPhone) {
      res.status(409).json({ error: "Toks vartotojas jau egzistuoja" });
      return;
    }

    const session = await buildSession(
      userId,
      { id: userId, phone, city, name: providerName("phone") },
      {
        role,
        provider: "phone",
        businessType,
        companyName,
        companyCode,
        vatCode,
        serviceBaseCity,
        serviceRadiusKm,
        serviceNationwide,
        serviceSpecialties,
      }
    );
    res.json(await finalizeSessionWithReferral(userId, session, referralCode));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

authRouter.post("/social", async (req, res) => {
  try {
    const provider = String(req.body?.provider ?? "google");
    const role = String(req.body?.role ?? "private");
    const email = req.body?.email ? String(req.body.email) : undefined;
    const city = String(req.body?.city ?? "Vilnius");
    const businessType = req.body?.businessType
      ? String(req.body.businessType)
      : undefined;
    const idToken = req.body?.idToken ? String(req.body.idToken) : undefined;
    const adminEmail = process.env.ADMIN_EMAIL ?? "admin@vauto.com";
    const companyName = req.body?.companyName ? String(req.body.companyName) : undefined;
    const companyCode = req.body?.companyCode ? String(req.body.companyCode) : undefined;
    const vatCode = req.body?.vatCode ? String(req.body.vatCode) : undefined;
    const serviceBaseCity = req.body?.serviceBaseCity ? String(req.body.serviceBaseCity) : undefined;
    const serviceRadiusKm = req.body?.serviceRadiusKm ? Number(req.body.serviceRadiusKm) : undefined;
    const serviceNationwide = req.body?.serviceNationwide === true;
    const serviceSpecialties = Array.isArray(req.body?.serviceSpecialties)
      ? (req.body.serviceSpecialties as unknown[]).map(String)
      : undefined;
    const referralCode = req.body?.referralCode
      ? String(req.body.referralCode).trim()
      : undefined;

    if (provider === "google") {
      if (!idToken) {
        res.status(401).json({ error: "Google patvirtinimas privalomas" });
        return;
      }
      const google = await verifyGoogleIdToken(idToken);
      if (!google) {
        res.status(401).json({ error: "Netinkamas Google token" });
        return;
      }
      if (
        role === "admin" &&
        google.email?.toLowerCase() !== adminEmail.toLowerCase()
      ) {
        res.status(403).json({ error: "Admin access denied" });
        return;
      }
      const userId = stableUserId(`google:${google.sub}`);
      const session = await buildSession(
        userId,
        {
          id: userId,
          email: google.email,
          name: google.name ?? providerName("google"),
          avatar: google.picture ?? defaultAvatar("google"),
          city,
        },
        {
          role,
          provider: "google",
          businessType,
          companyName,
          companyCode,
          vatCode,
          serviceBaseCity,
          serviceRadiusKm,
          serviceNationwide,
          serviceSpecialties,
        }
      );
      res.json(await finalizeSessionWithReferral(userId, session, referralCode));
      return;
    }

    if (provider === "apple") {
      if (!idToken) {
        res.status(401).json({ error: "Apple patvirtinimas privalomas" });
        return;
      }
      const apple = await verifyAppleIdToken(idToken);
      if (!apple) {
        res.status(401).json({ error: "Netinkamas Apple token" });
        return;
      }
      const displayName =
        req.body?.name ? String(req.body.name).trim() : undefined;
      const userId = stableUserId(`apple:${apple.sub}`);
      const session = await buildSession(
        userId,
        {
          id: userId,
          email: apple.email ?? email,
          name: displayName || providerName("apple"),
          avatar: defaultAvatar("apple"),
          city,
        },
        {
          role,
          provider: "apple",
          businessType,
          companyName,
          companyCode,
          vatCode,
          serviceBaseCity,
          serviceRadiusKm,
          serviceNationwide,
          serviceSpecialties,
        }
      );
      res.json(await finalizeSessionWithReferral(userId, session, referralCode));
      return;
    }

    if (role === "admin") {
      if (process.env.NODE_ENV === "production") {
        res.status(401).json({ error: "Admin Google verification required" });
        return;
      }
      if (email?.toLowerCase() !== adminEmail.toLowerCase()) {
        res.status(403).json({ error: "Admin access denied" });
        return;
      }
      const session = await buildSession(
        "admin-1",
        {
          id: "admin-1",
          name: "VAUTO Admin",
          phone: "+370 600 00001",
          city: "Vilnius",
          email: adminEmail,
          avatar:
            "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&h=100&fit=crop",
        },
        {
          role: "super_admin",
          provider,
          businessType,
          companyName,
          companyCode,
          vatCode,
          serviceBaseCity,
          serviceRadiusKm,
          serviceNationwide,
          serviceSpecialties,
        }
      );
      res.json(await finalizeSessionWithReferral("admin-1", session, referralCode));
      return;
    }

    if (process.env.NODE_ENV === "production") {
      res.status(401).json({ error: "OAuth patvirtinimas privalomas" });
      return;
    }

    const seed = email
      ? `${provider}:${email.trim().toLowerCase()}`
      : `${provider}:${String(req.body?.deviceId ?? "dev-fallback")}`;
    const userId = stableUserId(seed);
    const session = await buildSession(
      userId,
      {
        id: userId,
        email,
        city,
        name: providerName(provider),
      },
      {
        role,
        provider,
        businessType,
        companyName,
        companyCode,
        vatCode,
        serviceBaseCity,
        serviceRadiusKm,
        serviceNationwide,
        serviceSpecialties,
      }
    );
    res.json(await finalizeSessionWithReferral(userId, session, referralCode));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

authRouter.get("/session", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = await getUser(req.authUserId!);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      user,
      role: req.authRole ?? "private",
      userId: req.authUserId,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

authRouter.post("/refresh", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = req.authUserId!;
    const user = await getUser(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const role = req.authRole ?? user.role ?? "private";
    const token = signAccessToken({
      sub: userId,
      role,
      provider: user.authProvider ?? "phone",
    });
    res.json({
      token,
      expiresAt: new Date(Date.now() + getTokenTtlMs()).toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

authRouter.post("/logout", (_req, res) => {
  res.json({ ok: true });
});

authRouter.post("/upgrade", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = req.authUserId!;
    const existing = await getUser(userId);
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (existing.role === "pro" || existing.role === "super_admin") {
      res.status(400).json({ error: "Jūs jau turite Pro paskyrą." });
      return;
    }

    const businessType = String(req.body?.businessType ?? "general");
    const companyName = String(req.body?.companyName ?? "").trim();
    const companyCode = String(req.body?.companyCode ?? "").trim();
    const vatCode = req.body?.vatCode ? String(req.body.vatCode).trim() : undefined;
    const serviceBaseCity = req.body?.serviceBaseCity
      ? String(req.body.serviceBaseCity).trim()
      : undefined;
    const serviceRadiusKm = req.body?.serviceRadiusKm
      ? Number(req.body.serviceRadiusKm)
      : undefined;
    const serviceNationwide = req.body?.serviceNationwide === true;
    const serviceSpecialties = Array.isArray(req.body?.serviceSpecialties)
      ? (req.body.serviceSpecialties as unknown[]).map(String)
      : undefined;

    if (companyName.length < 2) {
      res.status(400).json({ error: "Įveskite įmonės pavadinimą." });
      return;
    }
    if (companyCode.length < 2) {
      res.status(400).json({ error: "Įveskite įmonės kodą." });
      return;
    }
    if (businessType === "services" && !serviceBaseCity) {
      res.status(400).json({ error: "Nurodykite bazinį miestą paslaugoms." });
      return;
    }

    const user: ApiUser = {
      ...existing,
      role: "pro",
      businessType,
      companyName,
      companyCode,
      vatCode,
      serviceBaseCity,
      serviceRadiusKm,
      serviceNationwide,
      serviceSpecialties,
      billingPlan: existing.billingPlan ?? "starter",
      billingModel: existing.billingModel ?? "ppc",
      walletBalance: existing.walletBalance ?? 25,
      averageResponseMinutes:
        existing.averageResponseMinutes ??
        (businessType === "services" ? 12 : undefined),
    };
    await upsertUser(user);
    const token = signAccessToken({
      sub: userId,
      role: "pro",
      provider: existing.authProvider ?? "phone",
    });
    res.json({
      token,
      expiresAt: new Date(Date.now() + getTokenTtlMs()).toISOString(),
      user,
      role: "pro",
      provider: existing.authProvider ?? "phone",
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
