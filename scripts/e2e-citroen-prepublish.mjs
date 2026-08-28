/**
 * Visible (non-headless) Arnold Citroën E2E — Microsoft Edge on screen.
 * 6 car photos + tech pasas → PrePublish → Patvirtinti ir publikuoti.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "tmp", "e2e-citroen-run");
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const API = process.env.NEXT_PUBLIC_API_URL || "https://vauto-api.onrender.com";
const PHONE = process.env.E2E_PHONE || "+37060000002";
const OTP = process.env.E2E_OTP || "123456";

const PHOTO_DIR = path.join(ROOT, "public", "e2e-citroen");
const PHOTO_NAMES = [
  "c1.png", // tech pasas
  "c2.png",
  "c5.png",
  "c6.png",
  "c7.png",
  "c8.png",
  "c9.png",
];

fs.mkdirSync(OUT, { recursive: true });

function log(...args) {
  console.log("[e2e-citroen]", ...args);
}

async function loginViaApi() {
  const req = await fetch(`${API}/api/auth/otp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: PHONE }),
  });
  const reqBody = await req.json().catch(() => ({}));
  if (!req.ok) throw new Error(`OTP send failed: ${req.status} ${JSON.stringify(reqBody)}`);

  const ver = await fetch(`${API}/api/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: PHONE, code: OTP }),
  });
  const verBody = await ver.json().catch(() => ({}));
  const accessToken = verBody.accessToken || verBody.token;
  if (!ver.ok || !accessToken) {
    throw new Error(`OTP verify failed: ${ver.status} ${JSON.stringify(verBody)}`);
  }
  return { ...verBody, accessToken };
}

async function acceptOverlays(page) {
  for (const name of ["Sutinku", "Uždaryti", "Supratau", "Leisti"]) {
    const btn = page.getByRole("button", { name, exact: true });
    if (await btn.isVisible({ timeout: 700 }).catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

async function main() {
  const payloads = PHOTO_NAMES.map((name) => {
    const filePath = path.join(PHOTO_DIR, name);
    if (!fs.existsSync(filePath)) throw new Error(`Missing photo: ${filePath}`);
    return {
      name,
      base64: fs.readFileSync(filePath).toString("base64"),
    };
  });

  const auth = await loginViaApi();
  log("logged in as", auth.user?.id || PHONE, "— opening VISIBLE Edge window");

  const browser = await chromium.launch({
    channel: "msedge",
    headless: false,
    slowMo: 350,
    args: ["--start-maximized"],
  });
  const context = await browser.newContext({
    viewport: null,
    locale: "lt-LT",
  });
  const page = await context.newPage();

  // Inject photos when the app creates a transient <input type=file>.
  await page.addInitScript((photoPayloads) => {
    window.__E2E_PHOTO_PAYLOADS = photoPayloads;
    const origClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function (...args) {
      if (this.type === "file" && window.__E2E_PHOTO_PAYLOADS?.length) {
        const dt = new DataTransfer();
        for (const p of window.__E2E_PHOTO_PAYLOADS) {
          const bin = atob(p.base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          dt.items.add(new File([bytes], p.name, { type: "image/png" }));
        }
        try {
          Object.defineProperty(this, "files", {
            configurable: true,
            value: dt.files,
          });
        } catch {
          /* ignore */
        }
        this.dispatchEvent(new Event("input", { bubbles: true }));
        this.dispatchEvent(new Event("change", { bubbles: true }));
        return undefined;
      }
      return origClick.apply(this, args);
    };
  }, payloads);

  await page.addInitScript(
    ({ token, user, expiresAt }) => {
      localStorage.setItem("vauto_access_token_v1", token);
      localStorage.setItem(
        "vauto_auth_v1",
        JSON.stringify({
          isAuthenticated: true,
          provider: "phone",
          loggedInAt: new Date().toISOString(),
          accessToken: token,
          expiresAt: expiresAt || new Date(Date.now() + 7 * 864e5).toISOString(),
        })
      );
      if (user) localStorage.setItem("vauto_user_v1", JSON.stringify(user));
      localStorage.setItem("vauto_gdpr_consent_v1", "true");
      localStorage.setItem("vauto-ai-photo-intro-dismissed", "1");
    },
    {
      token: auth.accessToken,
      user: auth.user,
      expiresAt: auth.expiresAt,
    }
  );

  await page.goto(`${BASE}/add/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.bringToFront();
  await acceptOverlays(page);
  await page.waitForTimeout(2500);
  await acceptOverlays(page);
  await page.screenshot({ path: path.join(OUT, "00-add-ready.png") });

  const uploadCta = page.getByRole("button", { name: /Įkelti nuotraukas/i }).first();
  if (!(await uploadCta.isVisible({ timeout: 15_000 }).catch(() => false))) {
    await page.screenshot({ path: path.join(OUT, "00-no-upload-btn.png") });
    const html = await page.content();
    fs.writeFileSync(path.join(OUT, "00-page.html"), html.slice(0, 50_000));
    throw new Error("Įkelti nuotraukas not visible — check 00-*.png");
  }

  log("clicking Įkelti nuotraukas — watch Edge: photos inject without OS dialog");
  await uploadCta.click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(OUT, "01-photos-attached.png") });
  log("photos stage done");

  // After photo send, app navigates to /. Wait for agent composer.
  await page.waitForTimeout(2000);
  if (!(await page.getByRole("button", { name: /^Siųsti$/i }).isVisible({ timeout: 10_000 }).catch(() => false))) {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
  }

  const message =
    "Naujas skelbimas: parduodu Citroën C4 Picasso, 2.0 HDi, 2007 m., 7 vietų, Prienai. Kaina 2250€.";
  const box = page.getByRole("textbox", { name: /Rašykite|Prisegti|asistent/i }).first();
  await box.waitFor({ state: "visible", timeout: 45_000 });
  await box.click();
  await box.fill(message);
  await page.getByRole("button", { name: /^Siųsti$/i }).click();
  log("sent listing message — watch Vision + PrePublish in Edge…");

  const publishBtn = page.getByRole("button", { name: /Patvirtinti ir publikuoti/i });
  await publishBtn.waitFor({ state: "visible", timeout: 240_000 });
  log("PrePublish card visible");
  await publishBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, "02-prepublish-card.png") });

  const description = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll("div,section,article")).find((el) =>
      (el.textContent || "").includes("Patvirtinti ir publikuoti")
    );
    return card?.innerText?.slice(0, 5000) || "";
  });
  fs.writeFileSync(path.join(OUT, "prepublish-text.txt"), description, "utf8");

  await publishBtn.click();
  log("clicked Patvirtinti ir publikuoti");
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, "03-after-publish.png") });

  const mineRes = await fetch(`${API}/api/listings/mine`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  const mine = await mineRes.json().catch(() => []);
  const listings = Array.isArray(mine) ? mine : mine.listings || [];
  const latest = listings
    .filter((l) => /citroen|c4|picasso/i.test(`${l.title || ""} ${l.description || ""}`))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];

  if (!latest) {
    fs.writeFileSync(
      path.join(OUT, "result.json"),
      JSON.stringify({ ok: false, mineCount: listings.length }, null, 2)
    );
    log("No listing found — leaving Edge open 25s");
    await page.waitForTimeout(25_000);
    await browser.close();
    process.exit(2);
  }

  const publicRes = await fetch(`${API}/api/listings?q=Citroen+C4+Picasso&limit=50`);
  const publicBody = await publicRes.json().catch(() => []);
  const publicList = Array.isArray(publicBody) ? publicBody : publicBody.listings || [];
  const inPublic = publicList.some((l) => l.id === latest.id);

  await page.goto(`${BASE}/listing/?id=${encodeURIComponent(latest.id)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "04-live-listing.png") });

  await page.goto(`${BASE}/mano-skelbimai`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "05-mano-skelbimai.png") });

  const result = {
    ok: !latest.requiresReview && latest.status === "active" && inPublic,
    listingId: latest.id,
    slug: latest.slug,
    title: latest.title,
    price: latest.price,
    status: latest.status,
    requiresReview: latest.requiresReview,
    imageCount: Array.isArray(latest.images)
      ? latest.images.length
      : latest.image
        ? 1
        : 0,
    image: latest.image || latest.images?.[0],
    galleryAttr: latest.attributes?.galleryImages,
    description: latest.description,
    inPublicCatalog: inPublic,
  };
  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify(result, null, 2));
  log("RESULT", JSON.stringify(result, null, 2));
  log("Leaving visible Edge open 25s so you can inspect…");
  await page.waitForTimeout(25_000);
  await browser.close();
  process.exit(result.ok ? 0 : 2);
}

main().catch((err) => {
  console.error("[e2e-citroen] FAILED", err);
  process.exit(1);
});
