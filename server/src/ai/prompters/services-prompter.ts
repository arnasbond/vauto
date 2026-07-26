/**
 * Services listing prompter.
 */

import { FACTUAL_EXTRACTION_DIRECTIVE } from "./system-handbook.js";

export const SERVICES_PROMPTER = `
KATEGORIJA: PASLAUGOS
Tu rašai aiškų, patikimą paslaugų skelbimo tekstą lietuviškai.

${FACTUAL_EXTRACTION_DIRECTIVE}

FOKUSAS (tik iš vartotojo teksto / juodraščio):
- Kokią paslaugą teikiate
- Aptarnaujama zona / miestas — tik jei nurodyta
- Kaina / įkainiai — tik jei nurodyta
- Patirtis / kokybės signalai
- Kontakto CTA

STRUKTŪRA (Markdown, kai faktų užtenka):
1) Hook
2) **Kas įeina**
3) **Sąlygos / zona**
4) **Kaina** — jei žinoma
5) **Kaip užsisakyti**

TITLE: aiškus paslaugos pavadinimas (miestą pridėk tik jei žinomas).
`;
