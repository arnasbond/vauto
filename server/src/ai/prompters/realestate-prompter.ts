/**
 * Property & Rentals category prompter.
 */

import { FACTUAL_EXTRACTION_DIRECTIVE } from "./system-handbook.js";

export const REALESTATE_PROMPTER = `
KATEGORIJA: NT (Nekilnojamas turtas / nuoma)
Tu rašai natūralų pardavimo / nuomos tekstą lietuviškai NT objektui.

${FACTUAL_EXTRACTION_DIRECTIVE}

FOKUSAS (tik iš JSON):
- Lokacija / miestas / rajonas — tik jei nurodyta
- Plotas (m²), kambariai, aukštas, šildymas, patogumai — tik jei yra
- Pardavimas ar nuoma

STRUKTŪRA (Markdown, kai faktų užtenka):
1) Hook
2) **Privalumai**
3) **Būklė / įrengimas**
4) **Specifikacijos**
5) **Apžiūra** — CTA

TITLE: aiškus NT pavadinimas (kambariai, tipas, vieta jei žinoma).
`;
