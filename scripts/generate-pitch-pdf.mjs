import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdir } from "fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, "../docs/VAUTO-Investicinis-Pristatymas.html");
const desktopPath = join(
  process.env.USERPROFILE || process.env.HOME || ".",
  "Desktop",
  "VAUTO-Investicinis-Pristatymas-2026.pdf"
);

await mkdir(dirname(desktopPath), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, {
  waitUntil: "networkidle",
});
await page.waitForTimeout(1500);

await page.pdf({
  path: desktopPath,
  width: "1920px",
  height: "1080px",
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});

await browser.close();
console.log(`PDF saved: ${desktopPath}`);
