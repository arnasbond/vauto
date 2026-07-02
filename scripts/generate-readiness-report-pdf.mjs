import { chromium } from "playwright";
import { stat, mkdir } from "fs/promises";
import { join } from "path";

const desktop = join(
  process.env.USERPROFILE || process.env.HOME || ".",
  "Desktop"
);
const outPath = join(desktop, "VAUTO-Finalinio-Etapo-Ataskaita.pdf");
await mkdir(desktop, { recursive: true });

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1a2b32; line-height: 1.5; }
  .page { padding: 22mm 20mm; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  h1 { font-size: 26px; color: #0f766e; margin-bottom: 6px; }
  h2 { font-size: 18px; color: #0f766e; margin: 18px 0 8px; border-bottom: 2px solid #0f766e33; padding-bottom: 4px; }
  h3 { font-size: 14px; color: #b45309; margin: 12px 0 4px; }
  p, li { font-size: 11.5px; margin-bottom: 4px; }
  ul { margin: 4px 0 8px 18px; }
  .muted { color: #64748b; font-size: 10.5px; }
  .hero { background: linear-gradient(135deg, #0f766e15, #b4530915); border: 1px solid #0f766e33; border-radius: 14px; padding: 18px 20px; margin-bottom: 14px; }
  .badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 9px; border-radius: 999px; margin-left: 6px; }
  .live { background: #10b98122; color: #047857; }
  .beta { background: #f59e0b22; color: #b45309; }
  .demo { background: #64748b22; color: #475569; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 8px; font-size: 10.5px; text-align: left; }
  th { background: #0f766e; color: #fff; }
  tr:nth-child(even) td { background: #f1f5f9; }
  .metric { display: inline-block; width: 23%; text-align: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 6px; margin: 4px 0.5%; }
  .metric .n { font-size: 20px; font-weight: 800; color: #0f766e; }
  .metric .l { font-size: 9px; color: #64748b; }
  .step { border-left: 3px solid #0f766e; padding: 4px 0 4px 12px; margin: 8px 0; }
  .step .t { font-weight: 700; font-size: 12px; }
  code { background: #0f172a; color: #e2e8f0; padding: 1px 5px; border-radius: 4px; font-size: 10px; }
  .foot { position: fixed; bottom: 8mm; left: 20mm; right: 20mm; font-size: 9px; color: #94a3b8; text-align: center; }
`;

const html = `<!DOCTYPE html><html lang="lt"><head><meta charset="utf-8"><style>${css}</style></head><body>

<div class="page">
  <div class="hero">
    <h1>VAUTO — Finalinio Funkcionalumo Ataskaita</h1>
    <p class="muted">Vyr. architekto auditas · promise hardening režimas · versija v1.6.62 · 2026-07-02</p>
  </div>
  <h2>Vyr. Architekto Išvada</h2>
  <p>VAUTO po <code>v1.6.55</code>–<code>v1.6.62</code> etapų nebėra dizaino ar demo prototipas. Pagrindinis AI, skelbimų kūrimo, photo search, barcode/QR, VIN/kodų ištraukimo, visual pipeline, statuso diagnostikos ir serverinio Gemini kelias jau realiai sujungtas. Didžiausia likusi problema nėra kodas, o skirtumas tarp deklaruojamų pažadų ir produkcinės infrastruktūros: OCR, Studio BG, Stripe/webhook, carrier shipping, portalų sinchronizacija, notification keys ir QA monitoringas.</p>
  <h2>Bendras Brandos Įvertinimas</h2>
  <div>
    <div class="metric"><div class="n">80–84%</div><div class="l">Kodo architektūros parengtis</div></div>
    <div class="metric"><div class="n">65–70%</div><div class="l">Pažadų išpildymas be tiekėjų</div></div>
    <div class="metric"><div class="n">90–94%</div><div class="l">Maks. su tiekėjais + QA</div></div>
    <div class="metric"><div class="n">6–10%</div><div class="l">Priklauso nuo išorės integracijų</div></div>
  </div>
  <h2>Ką Įgyvendino v1.6.62 (Promise Hardening)</h2>
  <ul>
    <li><b>Claim gating:</b> pažadų būsenos (veikia / beta / demo / neprijungta) rodomos <code>/apie</code>, onboarding ir <code>ConnectionStatusCard</code>.</li>
    <li><b>Visual pipeline QA:</b> regresiniai fixture testai (VIN, EAN, QR, mada, paslaugos) — <code>npm run test:visual-pipeline-qa</code>.</li>
    <li><b>Infra readiness:</b> <code>/api/health</code> grąžina <code>infra</code> bloką su perspėjimais + <code>verify:infra</code>.</li>
    <li><b>Shipping adapteris:</b> mock label pakeistas carrier adapteriu (Omniva live + simuliacija) su tracking endpointu.</li>
    <li><b>Portal sync adapteris:</b> import/refresh/publish/delete modelis, pirmas stabilus provideris.</li>
    <li><b>Derybininko sauga:</b> consent per pokalbį, min. kainos + maks. nuolaidos taisyklė, audit log, escalation.</li>
  </ul>
</div>

<div class="page">
  <h2>Deklaruojamų Pažadų Būsena</h2>
  <table>
    <tr><th>Pažadas</th><th>Būsena</th><th>Komentaras</th></tr>
    <tr><td>Nufotografuok — AI paruoš skelbimą</td><td>~80% <span class="badge live">veikia</span></td><td>Intent, visual pipeline, Gemini fallback, listing wizard sujungti.</td></tr>
    <tr><td>Universalus vaizdo atpažinimas</td><td>~75–80% <span class="badge beta">beta</span></td><td>Be Gemini rakto — demo/heuristic režimas.</td></tr>
    <tr><td>VIN / numeriai / barcode / QR</td><td>~75–88% <span class="badge beta">beta</span></td><td>Client-side + Gemini fallback; OCR gerina determinizmą.</td></tr>
    <tr><td>Studio BG / pro nuotraukos</td><td>~45–55% <span class="badge demo">tiekėjas</span></td><td>Architektūra paruošta; reikia PhotoRoom/Clipdrop/Remove.bg rakto.</td></tr>
    <tr><td>AI derybininkas 24/7</td><td>~60–65% <span class="badge beta">beta</span></td><td>Consent + taisyklės + audit įdiegti; 24/7 priklauso nuo uptime.</td></tr>
    <tr><td>Skelbimų sinchronizacija</td><td>~50–60% <span class="badge beta">import/stebėjimas</span></td><td>Ne pilnas autopublish; adapterių modelis paruoštas.</td></tr>
    <tr><td>Saugūs mokėjimai + siuntos</td><td>~50–55% <span class="badge beta">beta</span></td><td>Stripe escrow veikia; siuntos per carrier adapterį, live per env.</td></tr>
    <tr><td>Kainų patarėjas</td><td>~55–65% <span class="badge beta">rekomendacija</span></td><td>Ne garantuota rinkos kaina; reikia rinkos duomenų indekso.</td></tr>
    <tr><td>Verslo kabinetas / analitika</td><td>~60–70% <span class="badge beta">beta</span></td><td>UI yra; reikia realių KPI ir rolių.</td></tr>
    <tr><td>Mobile app / install</td><td>~85% <span class="badge live">veikia</span></td><td>APK/Capacitor/PWA; reikia store distribucijos proceso.</td></tr>
  </table>
  <p class="muted">Regitra sąmoningai palikta nuošalyje — oficialių LT registro duomenų pažadas lieka sąlyginis.</p>

  <h2>Rizikos</h2>
  <ul>
    <li>Be Gemini rakto AI krenta į demo režimą — būtina užtikrinti serverio raktą.</li>
    <li>Be cloud OCR tekstų ištraukimas priklauso nuo Gemini Vision fallback (mažiau deterministiška).</li>
    <li>Render free plan cold start gali sukelti pirmų užklausų vėlavimą.</li>
    <li>Stripe be webhook secret — mokėjimų būsenos nepilnos.</li>
  </ul>
</div>

<div class="page">
  <h2>Finalinio Etapo Vykdymo Planas</h2>

  <div class="step"><div class="t">0 · Merge ir Deploy</div>
    <p>Sujungti <code>feature/vauto-final-readiness</code> į <code>master</code> ir paleisti deploy (Vercel + Render).</p>
  </div>
  <div class="step"><div class="t">1 · Health ir Infra patikra</div>
    <p><code>npm run verify:health</code> ir <code>npm run verify:infra</code> — pamatyti, kas prijungta, o kas rodo warning.</p>
  </div>
  <div class="step"><div class="t">2 · Tiekėjų raktai po vieną</div>
    <p>OCR (Google Vision / Textract) → Studio BG (PhotoRoom/Clipdrop/Remove.bg) → Stripe live + webhook → Shipping (Omniva/DPD) → Push/Email (VAPID/FCM/Resend). Po kiekvieno rakto — <code>verify:infra</code>.</p>
  </div>
  <div class="step"><div class="t">3 · Realūs user flow testai</div>
    <p>Foto→skelbimas, VIN/QR/barcode, Studio BG, escrow checkout→webhook→paid, shipping label→tracking, portal import→refresh, AI deryba→consent→escalation.</p>
  </div>
  <div class="step"><div class="t">4 · Pilotinis paleidimas</div>
    <p>5–10 realių testuotojų, realios nuotraukos ir pokalbiai, klaidų logai bei UX pastabos.</p>
  </div>
  <div class="step"><div class="t">5 · Finalinis brandos įvertinimas</div>
    <p>Atnaujinti procentus po piloto: AI pipeline, OCR stabilumas, mokėjimai/siuntos, derybininko sauga, /apie tikslumas.</p>
  </div>

  <h2>Reikalingi Produkciniai Raktai</h2>
  <table>
    <tr><th>Sritis</th><th>Env kintamieji</th></tr>
    <tr><td>OCR</td><td>GOOGLE_CLOUD_VISION_CREDENTIALS_JSON arba AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY</td></tr>
    <tr><td>Studio BG</td><td>PHOTOROOM_API_KEY / CLIPDROP_API_KEY / REMOVEBG_API_KEY</td></tr>
    <tr><td>Mokėjimai</td><td>STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET</td></tr>
    <tr><td>Siuntos</td><td>OMNIVA_API_KEY + OMNIVA_API_URL arba DPD_API_KEY</td></tr>
    <tr><td>Push / Email</td><td>VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / FIREBASE_SERVICE_ACCOUNT_JSON / RESEND_API_KEY</td></tr>
    <tr><td>AI</td><td>GEMINI_API_KEY / AI_KEY</td></tr>
  </table>

  <h2>Finalinė Strateginė Rekomendacija</h2>
  <p>VAUTO turi pakankamai stiprią bazę finaliniam etapui. Reikia nustoti plėsti naujus pažadus ir likti „promise hardening“ režime: kiekvienas pažadas turi turėti vieną iš trijų būsenų — veikia, beta su aiškia riba, arba neprijungta. Didžiausią vertę dabar duos ne naujos funkcijos, o realių tiekėjų prijungimas, pipeline testai, monitoringas ir mock dalių pakeitimas produkciniais adapteriais.</p>
  <div class="foot">VAUTO Finalinio Etapo Ataskaita · v1.6.62 · Konfidencialu</div>
</div>

</body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.emulateMedia({ media: "print" });
await page.pdf({
  path: outPath,
  format: "A4",
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});
await browser.close();

const { size } = await stat(outPath);
console.log(`PDF paruoštas: ${outPath}`);
console.log(`Dydis: ${Math.round(size / 1024)} KB`);
