import { test, expect } from "@playwright/test";

const PROD_API =
  process.env.VAUTO_API_URL?.replace(/\/$/, "") ||
  "https://vauto-api.onrender.com";
const OPS_SECRET = process.env.VAUTO_OPS_SECRET?.trim();

function opsHeaders(): Record<string, string> {
  return OPS_SECRET ? { "X-Vauto-Ops-Secret": OPS_SECRET } : {};
}

test.describe("Auth ops guard", () => {
  test("auth-reset rejects without ops secret", async ({ request }) => {
    const res = await request.post(`${PROD_API}/api/ops/auth-reset`, {
      data: { dryRun: true },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).not.toBe(200);
  });

  test("auth-hygiene rejects without ops secret", async ({ request }) => {
    const res = await request.get(`${PROD_API}/api/ops/auth-hygiene`);
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).not.toBe(200);
  });

  test("auth-flow rejects without ops secret", async ({ request }) => {
    const res = await request.post(`${PROD_API}/api/test/auth-flow`);
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).not.toBe(200);
  });
});

test.describe("Auth E2E (live API)", () => {
  test.skip(!OPS_SECRET, "Requires VAUTO_OPS_SECRET");

  test("hygiene snapshot is reachable", async ({ request }) => {
    const res = await request.get(`${PROD_API}/api/ops/auth-hygiene`, {
      headers: opsHeaders(),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.hygiene).toHaveProperty("totalUsers");
    expect(body.hygiene).toHaveProperty("authUsers");
  });

  test("auth-reset dry-run returns plan", async ({ request }) => {
    const res = await request.post(`${PROD_API}/api/ops/auth-reset`, {
      headers: opsHeaders(),
      data: { dryRun: true, preserveCatalog: true },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(Array.isArray(body.deletedUserIds)).toBe(true);
  });

  test("auth-flow self-test (Google, Apple mock, SMS)", async ({ request }) => {
    const res = await request.post(`${PROD_API}/api/test/auth-flow`, {
      headers: opsHeaders(),
    });
    const body = await res.json();

    if (!body.enabled) {
      test.info().annotations.push({
        type: "note",
        description:
          "Set VAUTO_E2E_AUTH=1 on Render to enable full auth-flow self-test",
      });
      expect(body.enabled).toBe(false);
      return;
    }

    expect(res.ok()).toBeTruthy();
    expect(body.google?.ok).toBe(true);
    expect(body.apple?.ok).toBe(true);
    expect(body.sms?.ok).toBe(true);
    expect(body.cleanup?.ok).toBe(true);
    expect(body.hygiene?.staleTestUsers).toBe(0);
  });
});
