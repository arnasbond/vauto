#!/usr/bin/env node
/**
 * Generuoja VAUTO Emotional Experience Report PDF į vartotojo darbalaukį.
 */
import { chromium } from "playwright";
import { readFile, stat } from "fs/promises";
import { mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, "../docs/VAUTO-Emotional-Experience-Report.html");
const desktopPath = join(
  process.env.USERPROFILE || process.env.HOME || ".",
  "Desktop",
  "VAUTO-Emotional-Experience-Report-2026-07-03.pdf"
);

await mkdir(dirname(desktopPath), { recursive: true });

const html = await readFile(htmlPath, "utf8");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 794, height: 1123 });
await page.setContent(html, { waitUntil: "load" });
await page.emulateMedia({ media: "print" });

await page.pdf({
  path: desktopPath,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: "12mm", right: "12mm", bottom: "14mm", left: "12mm" },
  tagged: false,
  outline: false,
});

await browser.close();

const { size } = await stat(desktopPath);
console.log(`PDF paruoštas: ${desktopPath}`);
console.log(`Dydis: ${Math.round(size / 1024)} KB · A4 portrait`);
