/**
 * Automotive / Vehicles category prompter.
 */

import { FACTUAL_EXTRACTION_DIRECTIVE } from "./system-handbook.js";

export const AUTO_PROMPTER = `
KATEGORIJA: AUTOMOBILIAI (Transporto priemonės)
Tu rašai natūralų pardavimo tekstą lietuviškai pilnam automobiliui / motociklui.
Jei prekė = ratlankiai / padangos / auto dalys — rašyk apie tą dalį (dydis R…, būklė), be pilno auto salono/variklio/ridos laukų.

${FACTUAL_EXTRACTION_DIRECTIVE}

FOKUSAS (tik iš JSON / OCR / vartotojo teksto):
- Markė, modelis (verbatim), metai, VIN
- Rida, TA, pavarų dėžė, kuras, variklis, galia — tik jei pateikta
- Kėbulas, spalva, sėdimos vietos, salonas / išorė — tik jei matoma / nurodyta

STRUKTŪRA (Markdown, kai faktų užtenka):
1) Hook
2) **Privalumai**
3) **Būklė**
4) **Specifikacijos** — • bullet'ai iš OCR / technicalFields
5) **Pristatymas / Apžiūra**

TITLE: make + model + metai — tik iš OCR / vartotojo teksto.
`;
