import type { Page } from "@playwright/test";
import crypto from "node:crypto";

export interface SeedAuthProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  role?: "private" | "pro" | "admin" | "super_admin";
  profileType?: "private" | "business";
  businessType?: "dealer" | "services" | "general";
  companyName?: string;
  companyCode?: string;
  walletBalance?: number;
  billingPlan?: "free" | "starter" | "pro";
}

/**
 * Mirror server/src/auth/tokens.ts.
 * Use only when the target API shares JWT_SECRET (set E2E_MINT_REAL_JWT=1).
 * Static Playwright against Render must NOT use this — AuthContext clears
 * non-e2e tokens on /session 401.
 */
function mintE2eAccessToken(profile: SeedAuthProfile): {
  token: string;
  expiresAt: string;
} {
  const secret =
    process.env.JWT_SECRET?.trim() || "vauto-dev-secret-change-in-production";
  const ttlMs = Number(process.env.JWT_TTL_MS ?? 7 * 24 * 60 * 60 * 1000);
  const exp = Date.now() + ttlMs;
  const b64url = (input: Buffer | string) => {
    const buf = typeof input === "string" ? Buffer.from(input) : input;
    return buf.toString("base64url");
  };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      sub: profile.id,
      role: profile.role ?? "private",
      provider: "phone",
      exp,
    })
  );
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return {
    token: `${header}.${body}.${sig}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

function resolveSeedToken(profile: SeedAuthProfile): {
  token: string;
  expiresAt: string;
} {
  if (process.env.E2E_MINT_REAL_JWT === "1") {
    return mintE2eAccessToken(profile);
  }
  // AuthContext keeps e2e-* tokens on remote /session 401 (static e2e).
  return {
    token: `e2e-${profile.id}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function seedAuthSession(page: Page, profile: SeedAuthProfile) {
  const { token, expiresAt } = resolveSeedToken(profile);
  await page.addInitScript(
    ({ user, token: accessToken, expiresAt: exp }) => {
      localStorage.setItem(
        "vauto_auth_v1",
        JSON.stringify({
          isAuthenticated: true,
          provider: "phone",
          loggedInAt: new Date().toISOString(),
          accessToken,
          expiresAt: exp,
        })
      );
      localStorage.setItem("vauto_user_v1", JSON.stringify(user));
      localStorage.setItem("vauto_access_token_v1", accessToken);
      localStorage.setItem("vauto_gdpr_consent_v1", "true");
      localStorage.setItem("vauto-ai-photo-intro-dismissed", "1");
    },
    { user: profile, token, expiresAt }
  );
}

/** Skip onboarding carousel when data API is enabled in static e2e builds. */
export async function stubOnboardingComplete(page: Page) {
  await page.route("**/api/user/onboarding**", async (route) => {
    const body = JSON.stringify({
      onboarding: {
        step: 3,
        completedAt: new Date().toISOString(),
        answers: {},
      },
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body,
    });
  });
}

/** GDPR consent hydrates after async catalog init — accept modal if it blocks media flows. */
export async function acceptGdprConsentIfPrompted(page: Page) {
  const accept = page.getByRole("button", { name: "Sutinku" });
  if (await accept.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await accept.click();
  }
}

/** Close transient error/info toasts that can block e2e assertions. */
export async function dismissTransientOverlays(page: Page) {
  const closeToast = page.getByRole("button", { name: "Uždaryti" });
  if (await closeToast.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await closeToast.click();
  }
}

/** Seed private seller session (e2e-* token by default; real JWT with E2E_MINT_REAL_JWT=1). */
export async function seedDemoUser(page: Page, opts?: { stubOnboarding?: boolean }) {
  if (opts?.stubOnboarding !== false) {
    await stubOnboardingComplete(page);
  }
  await seedAuthSession(page, {
    id: "user-e2e-test",
    name: "E2E Tester",
    phone: "+37060000001",
    city: "Vilnius",
    role: "private",
    profileType: "private",
    walletBalance: 0,
  });
}

/** Seed demo admin session for Control Center smoke tests. */
export async function seedAdminUser(page: Page, opts?: { stubOnboarding?: boolean }) {
  if (opts?.stubOnboarding !== false) {
    await stubOnboardingComplete(page);
  }
  await seedAuthSession(page, {
    id: "admin-1",
    name: "VAUTO Admin",
    email: "admin@vauto.com",
    phone: "+37060000099",
    city: "Vilnius",
    role: "super_admin",
    walletBalance: 0,
  });
}

/** Seed demo pro business session for dashboard smoke tests. */
export async function seedProUser(page: Page, opts?: { stubOnboarding?: boolean }) {
  if (opts?.stubOnboarding !== false) {
    await stubOnboardingComplete(page);
  }
  await seedAuthSession(page, {
    id: "user-e2e-pro",
    name: "E2E Pro Verslas",
    phone: "+37060000002",
    city: "Vilnius",
    role: "pro",
    profileType: "business",
    businessType: "dealer",
    companyName: "E2E Autocentras UAB",
    companyCode: "123456789",
    walletBalance: 25,
    billingPlan: "starter",
  });
}
