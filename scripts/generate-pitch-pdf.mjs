import { chromium } from "playwright";
import { readFile, stat } from "fs/promises";
import { mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, "../docs/VAUTO-Investicinis-Pristatymas.html");
const desktopPath = join(
  process.env.USERPROFILE || process.env.HOME || ".",
  "Desktop",
  "VAUTO-Investicinis-Pristatymas-2026.pdf"
);

await mkdir(dirname(desktopPath), { recursive: true });

const html = await readFile(htmlPath, "utf8");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// A4 landscape @ 96 DPI — atitinka CSS mm matmenis
await page.setViewportSize({ width: 1123, height: 794 });

// Įkelti lokaliai (be file:// ir Google Fonts — nebekimba)
await page.setContent(html, { waitUntil: "load" });
await page.emulateMedia({ media: "print" });

await page.pdf({
  path: desktopPath,
  format: "A4",
  landscape: true,
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  tagged: false,
  outline: false,
});

await browser.close();

const { size } = await stat(desktopPath);
const sizeKb = Math.round(size / 1024);
console.log(`PDF paruoštas spaudai: ${desktopPath}`);
console.log(`Puslapių: 5 · A4 horizontalus · ${sizeKb} KB`);
