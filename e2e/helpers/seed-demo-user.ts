import type { Page } from "@playwright/test";

export interface SeedAuthProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  role?: "private" | "pro" | "admin" | "super_admin";
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

/** Seed demo private seller session (no JWT — local demo mode). */
export async function seedDemoUser(page: Page) {
  await seedAuthSession(page, {
    id: "user-e2e-test",
    name: "E2E Tester",
    phone: "+37060000001",
    city: "Vilnius",
    role: "private",
    walletBalance: 0,
  });
}

/** Seed demo admin session for Control Center smoke tests. */
export async function seedAdminUser(page: Page) {
  await seedAuthSession(page, {
    id: "admin-1",
    name: "Vauto Admin",
    email: "admin@vauto.com",
    phone: "+37060000099",
    city: "Vilnius",
    role: "super_admin",
    walletBalance: 0,
  });
}

/** Seed demo pro business session for dashboard smoke tests. */
export async function seedProUser(page: Page) {
  await seedAuthSession(page, {
    id: "user-e2e-pro",
    name: "E2E Pro Verslas",
    phone: "+37060000002",
    city: "Vilnius",
    role: "pro",
    businessType: "dealer",
    companyName: "E2E Autocentras UAB",
    companyCode: "123456789",
    walletBalance: 25,
    billingPlan: "starter",
  });
}
