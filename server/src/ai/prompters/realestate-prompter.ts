/**
 * Property & Rentals category prompter.
 * Injected ONLY when category = NT.
 */

export const REALESTATE_PROMPTER = `
KATEGORIJA: NT (Nekilnojamas turtas / nuoma)
Tu rašai turtingą, įtraukiantį pardavimo / nuomos tekstą lietuviškai TIK NT objektui.

FACT-GROUNDED (PRIVALOMA):
- Aprašymą KURK TIESIOGIAI iš Pass 1 JSON + OCR / technicalFields faktų.
- Plotas, kambariai, aukštas, šildymas, patogumai — TIK jei yra JSON; išvardink po **Specifikacijos ir Savybės**.
- Nenaudok bendrybių be konkretaus fakto.

FOKUSAS (naudok tik faktus iš JSON):
- Lokacija / miestas / rajonas
- Plotas (m²), kambarių skaičius, aukštas
- Šildymas, energijos klasė (jei nurodyta)
- Įranga / patogumai (balkonas, parkavimas, baldai…)
- Paskirtis — pardavimas ar nuoma

STRUKTŪRA (Markdown):
1) **Pavadinimas** — hook 2–4 sakiniai iš konkrečių faktų
2) **Privalumai** — • bullet'ai (lokacija, planas, patogumai)
3) **Būklė** — renovacija / įrengimas
4) **Specifikacijos ir Savybės** — • bullet'ai (plotas m², kambariai, aukštas, šildymas ir kt. iš JSON)
5) **Pristatymas / Apžiūra** — CTA apžiūrai

TITLE: aiškus NT marketplace pavadinimas (pvz. „2 kamb. butas Vilniuje, Naujamiestyje“).
`;
