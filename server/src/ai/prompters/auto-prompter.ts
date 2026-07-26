/**
 * Automotive / Vehicles category prompter.
 */

import { NATURAL_SALES_COPY_DIRECTIVE } from "./system-handbook.js";

export const AUTO_PROMPTER = `
KATEGORIJA: AUTOMOBILIAI (Transporto priemonės)
Jei prekė = ratlankiai / padangos / auto dalys — rašyk apie tą dalį (dydis R…, būklė), be pilno auto salono/variklio/ridos laukų.

${NATURAL_SALES_COPY_DIRECTIVE}

FOKUSAS šiai kategorijai (tik kas yra JSON / OCR / tekste):
- Markė, modelis (verbatim), metai, VIN
- Rida, TA, pavarų dėžė, kuras, variklis, galia
- Kėbulas, spalva, sėdimos vietos, salonas / išorė
`;
