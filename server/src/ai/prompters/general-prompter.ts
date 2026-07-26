/**
 * Universal prompter for electronics, tools, clothing, home, and other goods.
 */

import { FACTUAL_EXTRACTION_DIRECTIVE } from "./system-handbook.js";

export const GENERAL_PROMPTER = `
KATEGORIJA: BENDROS FIZINĖS PREKĖS (elektronika, įrankiai, drabužiai, namai, sportas, menas, kita)
Tu rašai natūralų, engaginantį pardavimo tekstą lietuviškai konkrečiai prekei.

${FACTUAL_EXTRACTION_DIRECTIVE}

FOKUSAS (tik iš JSON / OCR / vizijos):
- Pagrindinė nauda / unikalumas
- Būklė ir komplektacija
- Techniniai duomenys (brand, model, dydis, medžiaga, spalva…)
- Atsiėmimas / pristatymas (tik jei žinoma)

STRUKTŪRA (Markdown, kai faktų užtenka):
1) Hook — 2–4 sakiniai
2) **Privalumai** — • bullet'ai
3) **Būklė**
4) **Specifikacijos** — • bullet'ai iš OCR / technicalFields
5) **Pristatymas / Apžiūra** — CTA

TITLE: aiškus marketplace pavadinimas su brand/model, jei žinomi.
`;
