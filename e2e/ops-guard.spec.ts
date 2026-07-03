import { test, expect } from "@playwright/test";

const PROD_API = "https://vauto-api.onrender.com";

test.describe("Production ops guard", () => {
  test("bootstrap rejects without ops secret", async ({ request }) => {
    const res = await request.post(`${PROD_API}/api/bootstrap`);
    expect(res.status()).toBe(403);
  });

  test("e2e-simulation rejects without ops secret", async ({ request }) => {
    const res = await request.get(`${PROD_API}/api/test/e2e-simulation`);
    expect(res.status()).toBe(403);
  });

  test("public listings remain accessible", async ({ request }) => {
    const res = await request.get(`${PROD_API}/api/listings?limit=1`);
    expect(res.ok()).toBeTruthy();
  });
});
