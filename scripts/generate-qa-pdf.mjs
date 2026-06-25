import { chromium } from "playwright";
import { readFile, stat } from "fs/promises";
import { mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, "../docs/VAUTO-Testavimo-Scenarijus.html");
const desktopPath = join(
  process.env.USERPROFILE || process.env.HOME || ".",
  "Desktop",
  "VAUTO-Testavimo-Scenarijus.pdf"
);

await mkdir(dirname(desktopPath), { recursive: true });

const html = await readFile(htmlPath, "utf8");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.emulateMedia({ media: "print" });

await page.pdf({
  path: desktopPath,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: "12mm", right: "14mm", bottom: "14mm", left: "14mm" },
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `
    <div style="width:100%;font-size:8px;color:#64748b;padding:0 14mm;font-family:Segoe UI,sans-serif;display:flex;justify-content:space-between;">
      <span>VAUTO · Pre-Release QA · 2026-06-24</span>
      <span>Puslapis <span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`,
});

await browser.close();

const { size } = await stat(desktopPath);
console.log(`PDF paruoštas spaudai: ${desktopPath}`);
console.log(`Dydis: ${Math.round(size / 1024)} KB · A4 vertikalus`);
