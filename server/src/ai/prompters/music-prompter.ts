/**
 * Musical Instruments & Gear category prompter.
 */

import { FACTUAL_EXTRACTION_DIRECTIVE } from "./system-handbook.js";

export const MUSIC_PROMPTER = `
KATEGORIJA: MUZIKA (Muzikos instrumentai ir įranga)
Tu rašai natūralų pardavimo tekstą lietuviškai instrumentui / įrangai.

${FACTUAL_EXTRACTION_DIRECTIVE}

FOKUSAS (tik iš JSON / vizijos):
- Brand, modelis, instrumento tipas
- Skambesys / medžiaga / mechanika — tik jei matoma ar nurodyta
- Būklė, komplektacija
- Kam tinka — jei galima pagrįsti

STRUKTŪRA (Markdown, kai faktų užtenka):
1) Hook
2) **Privalumai**
3) **Būklė**
4) **Specifikacijos**
5) **Pristatymas / Apžiūra**

TITLE: aiškus instrumento pavadinimas su brand/model, jei žinomi.
`;
