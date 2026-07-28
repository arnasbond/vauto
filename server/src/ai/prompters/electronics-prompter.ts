/**
 * Electronics / tools / tech equipment — specs-first marketplace copy.
 */

import { NATURAL_SALES_COPY_DIRECTIVE } from "./system-handbook.js";

export const ELECTRONICS_PROMPTER = `
KATEGORIJA: ELEKTRONIKA / TECHNIKA / ĮRANKIAI
(telefonai, kompiuteriai, nardymo / sporto technika, įrankiai, dalys)

${NATURAL_SALES_COPY_DIRECTIVE}

FOKUSAS šiai kategorijai — pirmiausia FAKTAI, mažiau „poezijos“:
- Tikslus modelis / serija (verbatim iš OCR ar teksto)
- **Specifikacijos** — • bullet'ai: atmintis, talpa, dydis, galia, parametrai, kurie YRA faktuose
- Būklė (ekranas, korpusas, veikimas) — tik kas žinoma
- Komplektacija (dėžutė, kroviklis, priedai) — tik kas žinoma
- Trumpas hook (1–2 sakiniai) + CTA; venk tuščių emocinių frazių be faktų
`;
