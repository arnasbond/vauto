/**
 * Jobs / employment listing prompter.
 */

import { FACTUAL_EXTRACTION_DIRECTIVE } from "./system-handbook.js";

export const JOBS_PROMPTER = `
KATEGORIJA: DARBAS
Tu rašai aiškų, profesionalų darbo skelbimo tekstą lietuviškai.

${FACTUAL_EXTRACTION_DIRECTIVE}

FOKUSAS (tik iš vartotojo teksto / juodraščio):
- Pareigos / specialybė
- Vieta / miestas — tik jei nurodyta
- Atlygis / sąlygos — tik jei nurodyta
- Reikalavimai ir pasiūlymas
- Kontakto CTA

STRUKTŪRA (Markdown, kai faktų užtenka):
1) Hook
2) **Pareigos / užduotys**
3) **Reikalavimai**
4) **Siūlome / Atlygis**
5) **Kaip kandidatuoti**

TITLE: aiškus darbo skelbimo pavadinimas.
`;
