// MASTER Wave 1 — deterministic visual evidence capture.
// Not a test: a standalone Playwright-driven screenshot harness used to
// produce BEFORE/AFTER evidence for independent ChatGPT review. Run once
// against the BASE checkout (MODE=BEFORE) and once against the Wave 1
// checkout (MODE=AFTER), both served locally on http://127.0.0.1:4173.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MODE = process.env.WAVE1_MODE === "BEFORE" ? "BEFORE" : "AFTER";
const BASE_URL = process.env.WAVE1_BASE_URL || "http://127.0.0.1:4173";
const OUT_ROOT = path.resolve(process.cwd(), "evidence-capture", MODE);

const VIEWPORTS = [
  { width: 390, height: 844, label: "390" },
  { width: 768, height: 1024, label: "768" },
  { width: 1440, height: 900, label: "1440" },
  { width: 1920, height: 1080, label: "1920" },
];

async function dismissGdpr(page) {
  const accept = page.getByRole("button", { name: "Sutinku" });
  if (await accept.isVisible({ timeout: 2000 }).catch(() => false)) {
    await accept.click().catch(() => undefined);
  }
}

async function shoot(page, filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage: true });
}

async function setPersisted(page, value) {
  await page.addInitScript((v) => {
    try {
      if (v === null) window.localStorage.removeItem("vauto_app_theme_v1");
      else window.localStorage.setItem("vauto_app_theme_v1", v);
    } catch {
      /* ignore */
    }
  }, value);
}

async function seedAuth(page) {
  await page.addInitScript(() => {
    try {
      const user = {
        id: "wave1-evidence-user",
        name: "Wave1 Evidence",
        nickname: "Wave1 Evidence",
        avatar:
          "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop",
        phone: "+37060000001",
        city: "Vilnius",
        role: "private",
        profileType: "private",
        walletBalance: 0,
      };
      window.localStorage.setItem(
        "vauto_auth_v1",
        JSON.stringify({
          isAuthenticated: true,
          provider: "phone",
          loggedInAt: new Date().toISOString(),
          accessToken: "e2e-wave1-evidence-user",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
      );
      window.localStorage.setItem("vauto_user_v1", JSON.stringify(user));
      window.localStorage.setItem("vauto_gdpr_consent_v1", "true");
    } catch {
      /* ignore */
    }
  });
}

async function main() {
  const browser = await chromium.launch();
  const manifest = [];

  async function newPage(colorScheme) {
    const context = await browser.newContext({ colorScheme });
    const page = await context.newPage();
    return { context, page };
  }

  // A + B: Global/home shell + /profile/settings across viewports x themes.
  for (const theme of ["light", "dark"]) {
    for (const vp of VIEWPORTS) {
      const { context, page } = await newPage(theme);
      await setPersisted(page, theme);
      await page.setViewportSize({ width: vp.width, height: vp.height });

      await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
      await dismissGdpr(page);
      await page.waitForTimeout(400);
      const homeFile = path.join(
        OUT_ROOT,
        theme.toUpperCase(),
        vp.label,
        "A-global-home-shell.png"
      );
      await shoot(page, homeFile);
      manifest.push({ theme, viewport: vp.label, scenario: "A-global-home-shell", file: homeFile });

      await seedAuth(page);
      await page.goto(`${BASE_URL}/profile/settings`, { waitUntil: "load" });
      await dismissGdpr(page);
      await page
        .getByRole("heading", { name: /Programėlės tema/i })
        .waitFor({ timeout: 8000 })
        .catch(() => undefined);
      await page.waitForTimeout(400);
      const settingsFile = path.join(
        OUT_ROOT,
        theme.toUpperCase(),
        vp.label,
        "B-profile-settings.png"
      );
      await shoot(page, settingsFile);
      manifest.push({ theme, viewport: vp.label, scenario: "B-profile-settings", file: settingsFile });

      // C: representative modal/sheet (Vision AI photo-source sheet on home).
      await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
      await dismissGdpr(page);
      const photoBtn = page.getByRole("button", { name: /Vision AI paieška pagal nuotrauką/i });
      if (await photoBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await photoBtn.click().catch(() => undefined);
        await page.waitForTimeout(400);
        const sheetFile = path.join(
          OUT_ROOT,
          theme.toUpperCase(),
          vp.label,
          "C-representative-sheet.png"
        );
        await shoot(page, sheetFile);
        manifest.push({ theme, viewport: vp.label, scenario: "C-representative-sheet", file: sheetFile });
      }

      await context.close();
    }
  }

  // Dedicated theme-semantics evidence (desktop viewport, 1440x900).
  const semanticsVp = { width: 1440, height: 900 };

  async function semanticsShot(name, colorScheme, persisted, route = "/") {
    const { context, page } = await newPage(colorScheme);
    await setPersisted(page, persisted);
    await page.setViewportSize(semanticsVp);
    if (route === "/profile/settings") await seedAuth(page);
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "load" });
    await dismissGdpr(page);
    if (route === "/profile/settings") {
      await page
        .getByRole("heading", { name: /Programėlės tema/i })
        .waitFor({ timeout: 8000 })
        .catch(() => undefined);
    }
    await page.waitForTimeout(400);
    const file = path.join(OUT_ROOT, "THEME-SEMANTICS", `${name}.png`);
    await shoot(page, file);
    manifest.push({ scenario: name, file });
    await context.close();
  }

  await semanticsShot("01-first-visit-OS-DARK", "dark", null);
  await semanticsShot("02-first-visit-OS-LIGHT", "light", null);
  await semanticsShot("03-persisted-DARK-with-OS-LIGHT", "light", "dark");
  await semanticsShot("04-persisted-LIGHT-with-OS-DARK", "dark", "light");
  await semanticsShot("05-direct-profile-settings-DARK", "light", "dark", "/profile/settings");

  // 06: reload persistence — capture pre- and post-reload in the same context.
  {
    const { context, page } = await newPage("light");
    await setPersisted(page, "dark");
    await page.setViewportSize(semanticsVp);
    await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
    await dismissGdpr(page);
    await page.waitForTimeout(400);
    await shoot(page, path.join(OUT_ROOT, "THEME-SEMANTICS", "06a-before-reload.png"));
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(400);
    await shoot(page, path.join(OUT_ROOT, "THEME-SEMANTICS", "06b-after-reload.png"));
    manifest.push({ scenario: "06-reload-persistence", file: "06a/06b" });
    await context.close();
  }

  await browser.close();

  await mkdir(OUT_ROOT, { recursive: true });
  await writeFile(
    path.join(OUT_ROOT, "manifest.json"),
    JSON.stringify({ mode: MODE, baseUrl: BASE_URL, capturedAt: new Date().toISOString(), manifest }, null, 2)
  );
  console.log(`[wave1-visual-evidence] ${MODE}: captured ${manifest.length} screenshots into ${OUT_ROOT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
