import type { Page } from "@playwright/test";

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

export async function seedAuthSession(page: Page, profile: SeedAuthProfile) {
  await page.addInitScript((user) => {
    localStorage.setItem(
      "vauto_auth_v1",
      JSON.stringify({
        isAuthenticated: true,
        provider: "phone",
        loggedInAt: new Date().toISOString(),
      })
    );
    localStorage.setItem("vauto_user_v1", JSON.stringify(user));
    localStorage.setItem("vauto_gdpr_consent_v1", "true");
    localStorage.setItem("vauto-ai-photo-intro-dismissed", "1");
  }, profile);
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

/** Seed demo private seller session (no JWT — local demo mode). */
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
