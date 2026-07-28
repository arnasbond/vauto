import { Router } from "express";
import {
  demoOtpCode,
  isDemoBypassPhone,
  verifyDemoBypassOtp,
} from "../auth/demo-phones.js";
import { getTokenTtlMs, signAccessToken } from "../auth/tokens.js";
import { verifyAppleIdToken, isAppleOAuthConfigured, isApplePrivateRelayEmail, getAppleOAuthConfigStatus } from "../auth/apple-verify.js";
import { verifyGoogleIdToken, isGoogleOAuthConfigured } from "../auth/google-verify.js";
import {
  getOtpCodeLength,
  issueOtp,
  purgeExpiredOtps,
  usesDemoOtp,
  verifyOtp,
} from "../services/otp.js";
import { isSmsLive, sendOtpSms } from "../services/sms.js";
import { getUser, getUserByEmail, getUserByPhoneDigits, upsertUser } from "../repository.js";
import {
  applyReferralOnSignup,
  attachReferralFields,
} from "../referral/referral-service.js";
import type { ApiUser } from "../types.js";
import { exposeOtpDevHint } from "../demo-guards.js";
import { requireAuth, sendAdminNotFound, type AuthedRequest } from "../middleware/auth.js";
import {
  isValidLtMobilePhone,
  normalizeLtMobileE164,
} from "../auth/lt-phone.js";
import {
  isLaunchPromoActive,
  LAUNCH_PROMO_BADGE,
} from "../shared/launch-promo.js";
import {
  isAllowlistedAdminEmail,
  resolveAdminEmail,
  shouldElevateToSuperAdmin,
  shouldUseCanonicalAdminId,
} from "../lib/admin-allowlist.js";

export const authRouter = Router();

/** Public OAuth client ids for the frontend (not secrets). */
authRouter.get("/public-config", (_req, res) => {
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || undefined;
  const appleClientId =
    process.env.APPLE_CLIENT_ID?.trim() ||
    process.env.APPLE_SERVICE_ID?.trim() ||
    undefined;
  const appleStatus = getAppleOAuthConfigStatus();
  const appOrigin = (process.env.APP_ORIGIN ?? "https://www.vauto.lt").replace(
    /\/+$/,
    ""
  );
  res.json({
    googleClientId,
    appleClientId,
    googleEnabled: isGoogleOAuthConfigured(),
    appleEnabled: isAppleOAuthConfigured(),
    appleConfig: appleStatus,
    appleRedirectUris: [
      `${appOrigin}/auth/callback/`,
      `${appOrigin}/auth/callback`,
      "com.vauto.app://auth/callback",
    ],
    smsLive: isSmsLive(),
    smsMode: process.env.SMS_MODE?.trim().toLowerCase() || "auto",
    launchPromo: isLaunchPromoActive(),
    launchPromoBadge: LAUNCH_PROMO_BADGE,
  });
});

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

/** Prefer an existing DB account (phone/email) over a freshly hashed provider id. */
async function resolveLinkedUserId(
  providerSeed: string,
  linkEmail?: string | null
): Promise<string> {
  if (linkEmail?.trim()) {
    const byEmail = await getUserByEmail(linkEmail);
    if (byEmail?.id) return byEmail.id;
  }
  return stableUserId(providerSeed);
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

function isProviderPlaceholderName(
  name: string | undefined | null,
  provider: string
): boolean {
  if (!name?.trim()) return true;
  const n = name.trim().toLowerCase();
  return (
    n === providerName(provider).toLowerCase() ||
    n === "apple vartotojas" ||
    n === "google vartotojas" ||
    n === "mobilus vartotojas"
  );
}

function resolveDisplayName(
  incoming: string | undefined,
  existing: string | undefined,
  provider: string
): string {
  const cleaned = incoming?.trim();
  if (cleaned && !isProviderPlaceholderName(cleaned, provider)) return cleaned;
  if (existing?.trim() && !isProviderPlaceholderName(existing, provider)) {
    return existing.trim();
  }
  return cleaned || existing?.trim() || providerName(provider);
}

function resolveRole(
  metaRole: string,
  email?: string | null,
  phone?: string | null,
  name?: string | null,
  nickname?: string | null,
  firstName?: string | null
): string {
  if (
    shouldElevateToSuperAdmin({
      email,
      phone,
      name,
      nickname,
      firstName,
      metaRole,
    })
  ) {
    return "super_admin";
  }
  return metaRole;
}

const CANONICAL_ADMIN_ID = "admin-1";
const CANONICAL_ADMIN_NAME = "VAUTO Admin";
const CANONICAL_ADMIN_AVATAR =
  "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&h=100&fit=crop";

/** Stable Control Center account — admin-1 only for primary ADMIN_EMAIL / admin phone. */
function resolveSessionUserId(
  candidateId: string,
  metaRole: string,
  email?: string | null,
  phone?: string | null
): string {
  if (shouldUseCanonicalAdminId({ email, phone, metaRole })) {
    return CANONICAL_ADMIN_ID;
  }
  return candidateId;
}

/** Login must never downgrade an established account or re-prompt for account type. */
function resolveLoginRole(
  metaRole: string,
  existing: ApiUser | null,
  email?: string | null,
  phone?: string | null,
  name?: string | null,
  nickname?: string | null,
  firstName?: string | null
): string {
  const adminRole = resolveRole(
    metaRole,
    email,
    phone,
    name ?? existing?.name,
    nickname ?? existing?.nickname,
    firstName ?? existing?.firstName
  );
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
  const displayNameHint =
    profile.name?.trim() ||
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
    existing?.name ||
    null;
  const nicknameHint = profile.nickname?.trim() || existing?.nickname || null;
  const firstNameHint = profile.firstName?.trim() || existing?.firstName || null;
  const role = resolveLoginRole(
    meta.role,
    existing,
    email,
    phone,
    displayNameHint,
    nicknameHint,
    firstNameHint
  );
  const isCanonicalAdmin = role === "super_admin" && userId === CANONICAL_ADMIN_ID;
  const adminEmail = resolveAdminEmail();
  const firstName =
    profile.firstName?.trim() || existing?.firstName || undefined;
  const lastName = profile.lastName?.trim() || existing?.lastName || undefined;
  const composedFromParts = [firstName, lastName].filter(Boolean).join(" ").trim();
  const name = isCanonicalAdmin
    ? CANONICAL_ADMIN_NAME
    : resolveDisplayName(
        profile.name || composedFromParts || undefined,
        existing?.name,
        meta.provider
      );
  const user: ApiUser = {
    id: userId,
    name,
    firstName: isCanonicalAdmin ? undefined : firstName,
    lastName: isCanonicalAdmin ? undefined : lastName,
    phone: profile.phone ?? existing?.phone ?? "+370",
    city: profile.city ?? existing?.city ?? "Vilnius",
    avatar:
      profile.avatar ??
      existing?.avatar ??
      (isCanonicalAdmin ? CANONICAL_ADMIN_AVATAR : defaultAvatar(meta.provider)),
    email: isCanonicalAdmin ? adminEmail : email,
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

authRouter.post("/otp/send", async (req, res) => {
  const rawPhone = String(req.body?.phone ?? "").trim();
  const phone = normalizeLtMobileE164(rawPhone);
  if (!phone || !isValidLtMobilePhone(rawPhone)) {
    res.status(400).json({
      error:
        "Neteisingas Lietuvos mobilusis. Naudokite formatą +3706xxxxxxx (arba 86xxxxxxx).",
    });
    return;
  }
  if (otpSendRateLimited(phone)) {
    res.status(429).json({ error: "Per daug OTP užklausų. Bandykite vėliau." });
    return;
  }
  purgeExpiredOtps();
  const { code, expiresAt } = issueOtp(phone);
  const sent = await sendOtpSms(phone, code);
  if (!sent) {
    res.status(503).json({
      error: isSmsLive()
        ? "Nepavyko išsiųsti SMS. Bandykite dar kartą po minutės."
        : "SMS pristatymas nepasiekiamas — sukonfigūruokite SMS_MODE=live (Twilio/BulkGate).",
    });
    return;
  }
  if (usesDemoOtp() && exposeOtpDevHint()) {
    console.log(`[VAUTO Auth] Demo OTP for ${phone}: ${demoOtpCode()}`);
  }
  res.json({
    ok: true,
    expiresAt: new Date(expiresAt).toISOString(),
    codeLength: getOtpCodeLength(),
    smsLive: isSmsLive(),
    ...(usesDemoOtp() && exposeOtpDevHint()
      ? { devHint: `Demo OTP: ${demoOtpCode()}` }
      : {}),
  });
});

authRouter.post("/otp/verify", async (req, res) => {
  try {
    const rawPhone = String(req.body?.phone ?? "").trim();
    const phone = normalizeLtMobileE164(rawPhone) ?? rawPhone;
    if (!isValidLtMobilePhone(rawPhone) && !normalizeLtMobileE164(rawPhone)) {
      res.status(400).json({
        error:
          "Neteisingas Lietuvos mobilusis. Naudokite formatą +3706xxxxxxx.",
      });
      return;
    }
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
    const existingByPhone = await getUserByPhoneDigits(phoneDigits);
    const isRegistration = req.body?.isRegistration === true;

    if (isRegistration && existingByPhone) {
      res.status(409).json({ error: "Toks vartotojas jau egzistuoja" });
      return;
    }

    const candidateId =
      existingByPhone?.id ?? stableUserId(`phone:${phoneDigits}`);
    const userId = resolveSessionUserId(
      candidateId,
      role,
      existingByPhone?.email,
      phone
    );

    const session = await buildSession(
      userId,
      {
        id: userId,
        phone,
        city,
        name:
          userId === CANONICAL_ADMIN_ID
            ? CANONICAL_ADMIN_NAME
            : providerName("phone"),
        email:
          userId === CANONICAL_ADMIN_ID
            ? resolveAdminEmail()
            : existingByPhone?.email,
      },
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
    const adminEmail = resolveAdminEmail();
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
        !isAllowlistedAdminEmail(google.email)
      ) {
        sendAdminNotFound(res);
        return;
      }
      const candidateId = await resolveLinkedUserId(
        `google:${google.sub}`,
        google.email
      );
      const userId = resolveSessionUserId(
        candidateId,
        role,
        google.email,
        undefined
      );
      const session = await buildSession(
        userId,
        {
          id: userId,
          email:
            userId === CANONICAL_ADMIN_ID
              ? adminEmail
              : google.email,
          name:
            userId === CANONICAL_ADMIN_ID
              ? CANONICAL_ADMIN_NAME
              : google.name ?? providerName("google"),
          avatar:
            userId === CANONICAL_ADMIN_ID
              ? CANONICAL_ADMIN_AVATAR
              : google.picture ?? defaultAvatar("google"),
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
      if (!isAppleOAuthConfigured()) {
        res.status(503).json({
          error:
            "Apple Sign-In neaktyvus — nustatykite APPLE_CLIENT_ID (Services ID) serveryje.",
        });
        return;
      }
      if (!idToken) {
        res.status(401).json({ error: "Apple patvirtinimas privalomas" });
        return;
      }
      const apple = await verifyAppleIdToken(idToken);
      if (!apple) {
        res.status(401).json({ error: "Netinkamas Apple token" });
        return;
      }
      const firstName = req.body?.firstName
        ? String(req.body.firstName).trim()
        : undefined;
      const lastName = req.body?.lastName
        ? String(req.body.lastName).trim()
        : undefined;
      const rawName = req.body?.name ? String(req.body.name).trim() : undefined;
      const displayName =
        rawName ||
        [firstName, lastName].filter(Boolean).join(" ").trim() ||
        undefined;
      // Prefer verified token email (incl. @privaterelay.appleid.com) over client hint.
      const resolvedEmail = apple.email ?? email;
      if (resolvedEmail && isApplePrivateRelayEmail(resolvedEmail)) {
        // Relay is a valid deliverable Apple Hide My Email address — store as-is.
      }
      const userId = await resolveLinkedUserId(
        `apple:${apple.sub}`,
        resolvedEmail
      );
      const session = await buildSession(
        userId,
        {
          id: userId,
          email: resolvedEmail,
          name: displayName || providerName("apple"),
          firstName,
          lastName,
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
        sendAdminNotFound(res);
        return;
      }
      if (email?.toLowerCase() !== adminEmail.toLowerCase()) {
        sendAdminNotFound(res);
        return;
      }
      const session = await buildSession(
        CANONICAL_ADMIN_ID,
        {
          id: CANONICAL_ADMIN_ID,
          name: CANONICAL_ADMIN_NAME,
          phone: "+370 600 00001",
          city: "Vilnius",
          email: adminEmail,
          avatar: CANONICAL_ADMIN_AVATAR,
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
      res.json(
        await finalizeSessionWithReferral(CANONICAL_ADMIN_ID, session, referralCode)
      );
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
    let role = req.authRole ?? user.role ?? "private";
    if (
      shouldElevateToSuperAdmin({
        email: user.email,
        phone: user.phone,
        name: user.name,
        nickname: user.nickname,
        firstName: user.firstName,
      })
    ) {
      role = "super_admin";
      if (user.role !== "super_admin") {
        await upsertUser({ ...user, role: "super_admin" });
        user.role = "super_admin";
      }
    }
    res.json({
      user,
      role,
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
    let role = req.authRole ?? user.role ?? "private";
    if (
      shouldElevateToSuperAdmin({
        email: user.email,
        phone: user.phone,
        name: user.name,
        nickname: user.nickname,
        firstName: user.firstName,
      })
    ) {
      role = "super_admin";
      if (user.role !== "super_admin") {
        await upsertUser({ ...user, role: "super_admin" });
      }
    }
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

    if (businessType === "services" && !serviceBaseCity) {
      res.status(400).json({ error: "Nurodykite bazinį miestą paslaugoms." });
      return;
    }

    // Company name/code are optional — freelancers, IV, private Pro sellers OK.
    const resolvedCompanyName =
      companyName ||
      String(existing.name ?? "").trim() ||
      String(existing.nickname ?? "").trim() ||
      "VAUTO Pro";

    const user: ApiUser = {
      ...existing,
      role: "pro",
      businessType,
      companyName: resolvedCompanyName,
      companyCode: companyCode || undefined,
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
