/**
 * Automotive / Vehicles category prompter.
 */

import { NATURAL_SALES_COPY_DIRECTIVE } from "./system-handbook.js";

export const AUTO_PROMPTER = `
KATEGORIJA: AUTOMOBILIAI (Transporto priemonės)
Jei prekė = ratlankiai / padangos / auto dalys — rašyk apie tą dalį (dydis R…, būklė), be pilno auto salono/variklio/ridos laukų.

${NATURAL_SALES_COPY_DIRECTIVE}

FOKUSAS šiai kategorijai — BALANSAS: techniniai faktai + patrauklus pristatymas
(tik kas yra JSON / OCR / tekste / aiškiai matoma nuotraukose):
- Hook — 2–3 sakiniai apie automobilio charakterį (be spėlionių); natūralūs LT linksniai
- **Specifikacijos** — • markė, modelis (verbatim), metai, rida, kuras, pavarų dėžė, variklis/galia
- Būklė, atlikti aptarnavimai, TA — tik jei nurodyta
- Salonas / išorė / ratlankiai / žibintai / stogo laikikliai — tik kas matoma su dideliu patikimumu
- Artėjantys modeliai: jei Pass-1 factNotes mini vizualius skirtumus (langai, rilingai, žibintai) — galima švelniai atspindėti, be išgalvotų faktų
- CTA apžiūrai / kontaktui; miestą prozoje — vietininku (Vilniuje), sąraše — vardininku
`;
