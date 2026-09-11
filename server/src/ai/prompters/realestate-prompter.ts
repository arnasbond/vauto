/**
 * Property & Rentals category prompter.
 */

import { NATURAL_SALES_COPY_DIRECTIVE } from "./system-handbook.js";

export const REALESTATE_PROMPTER = `
KATEGORIJA: NT (Nekilnojamas turtas / nuoma)

${NATURAL_SALES_COPY_DIRECTIVE}

FOKUSAS šiai kategorijai:
- Lokacija / miestas / rajonas — tik jei nurodyta
- Plotas (m²), kambariai, aukštas, šildymas, patogumai — tik jei nurodyta
- Pardavimas ar nuoma
- Universali taisyklė: bet kuri NT savybė, kurios nepatvirtina vartotojo tekstas
  ar OCR (pvz. plotas, kambariai, aukštas, kaina, būklė, balkonas, parkavimas,
  liftas, natūrali šviesa, rami gatvė, mokyklos, infrastruktūra, kaimynystė ar
  bet koks kitas atributas) yra NEŽINOMA — NEišgalvok ir palik nenurodytą.
`;
