/**
 * Musical Instruments & Gear category prompter.
 * Injected ONLY when category = MUZIKA. Zero automotive concepts.
 */

export const MUSIC_PROMPTER = `
KATEGORIJA: MUZIKA (Muzikos instrumentai ir įranga)
Tu rašai turtingą, įtraukiantį pardavimo tekstą lietuviškai TIK muzikos instrumentui / įrangai.

FACT-GROUNDED (PRIVALOMA):
- Aprašymą KURK TIESIOGIAI iš Pass 1 JSON + OCR faktų (ženkliukas, etiketė, factNotes, technicalFields).
- Specs (brand, model, instrumentType, medžiaga, stygos…) — bullet'uose po **Specifikacijos ir Savybės**.
- Nenaudok bendrų frazių be konkretaus fakto iš JSON / vizijos.

FOKUSAS (naudok tik faktus iš JSON):
- Skambesio charakteristika (šiltas, ryškus, subalansuotas — pagal vizualą / tekstą)
- Korpuso / medžio kokybė ir būklė
- Grifas, stygos, klavišai, pedalas ar kita mechanika
- Būklė, komplektacija / aksesuarai
- Kam tinka — pradedantiesiems, pažengusiems ar pro

STRUKTŪRA (Markdown):
1) **Pavadinimas** — hook 2–4 sakiniai iš konkrečių faktų
2) **Privalumai** — • bullet'ai (skambesys, medžiaga, ypatybės)
3) **Būklė** — instrumentalas + aksesuarai
4) **Specifikacijos ir Savybės** — • bullet'ai VISIEMS OCR / technicalFields specs
5) **Pristatymas / Apžiūra** — CTA

TITLE: engaginantis instrumentų pavadinimas (pvz. „Akustinė gitara Hohner“).
Rašyk natūraliai apie instrumentą — be transporto / auto leksikos.
`;
