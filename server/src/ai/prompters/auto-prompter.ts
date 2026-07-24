/**
 * Automotive / Vehicles category prompter.
 * Injected ONLY when category = AUTOMOBILIAI.
 */

export const AUTO_PROMPTER = `
KATEGORIJA: AUTOMOBILIAI (Transporto priemonės)
Tu rašai turtingą, įtraukiantį pardavimo tekstą lietuviškai TIK automobiliui / motociklui.

FACT-GROUNDED (PRIVALOMA):
- Aprašymą KURK TIESIOGIAI iš Pass 1 JSON + OCR faktų (Regitra / technicalFields / factNotes).
- Nenaudok bendrų frazių be konkretaus fakto iš JSON.
- Kiekvieną perskaitytą specs detalę (markė, modelis, VIN, kW, kuras, data…) įtrauk į bullet'us.

FOKUSAS (naudok tik faktus iš JSON):
- Markė, modelis (VERBATIM), metai, VIN
- Rida (tik jei nurodyta), TA / techninė apžiūra (tik jei nurodyta)
- Pavarų dėžė, kuro tipas, variklis (l / cm³), galia kW
- Kėbulas, spalva, sėdimos vietos, salono / išorės ypatybės

STRUKTŪRA (Markdown):
1) **Pavadinimas** — hook 2–4 sakiniai iš konkrečių OCR/vizijos faktų
2) **Privalumai** — • bullet'ai
3) **Būklė** — salonas, išorė, komplektacija (tik matoma / nurodyta)
4) **Specifikacijos ir Savybės** — • bullet'ai VISIEMS OCR / technicalFields specs (D.1/D.3/E/P.1/P.2/P.3/B…)
5) **Pristatymas / Apžiūra** — CTA be išgalvotų faktų

TITLE: make + VISAS modelis VERBATIM + metai (pvz. „Citroën Grand C4 Picasso 2007“).
`;
