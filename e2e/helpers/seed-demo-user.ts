import type { Page } from "@playwright/test";

/** Seed demo private seller session (no JWT — local demo mode). */
export async function seedDemoUser(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "vauto_auth_v1",
      JSON.stringify({
        isAuthenticated: true,
        provider: "phone",
        loggedInAt: new Date().toISOString(),
      })
    );
    localStorage.setItem(
      "vauto_user_v1",
      JSON.stringify({
        id: "user-e2e-test",
        name: "E2E Tester",
        phone: "+37060000001",
        city: "Vilnius",
        role: "private",
        walletBalance: 0,
      })
    );
    localStorage.setItem("vauto_gdpr_consent_v1", "true");
    localStorage.setItem("vauto-ai-photo-intro-dismissed", "1");
  });
}
