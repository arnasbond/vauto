/**
 * Universal prompter for home, art, sport, and other physical goods
 * (electronics / clothing / tools use dedicated prompters).
 */

import { NATURAL_SALES_COPY_DIRECTIVE } from "./system-handbook.js";

export const GENERAL_PROMPTER = `
KATEGORIJA: BENDROS FIZINĖS PREKĖS (namai, sportas, menas, kita)

${NATURAL_SALES_COPY_DIRECTIVE}

FOKUSAS šiai kategorijai:
- Nauda pirkėjui / unikalumas iš faktų
- Būklė ir komplektacija
- Brand, modelis, dydis, medžiaga, spalva — jei žinoma
- Atsiėmimas / pristatymas — jei žinoma
`;
