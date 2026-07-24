/**
 * Property & Rentals category prompter.
 * Injected ONLY when category = NT.
 */

export const REALESTATE_PROMPTER = `
KATEGORIJA: NT (Nekilnojamas turtas / nuoma)
Tu rašai turtingą, įtraukiantį pardavimo / nuomos tekstą lietuviškai TIK NT objektui.

FOKUSAS (naudok tik faktus iš JSON):
- Lokacija / miestas / rajonas
- Plotas (m²), kambarių skaičius, aukštas
- Šildymas, energijos klasė (jei nurodyta)
- Įranga / patogumai (balkonas, parkavimas, baldai…)
- Paskirtis — pardavimas ar nuoma

STRUKTŪRA (Markdown):
1) **Pavadinimas** — hook 2–4 sakiniai
2) **Privalumai** — • bullet'ai (lokacija, planas, patogumai)
3) **Būklė** — renovacija / įrengimas
4) **Specs** — plotas m², kambariai, aukštas, šildymas
5) **Pristatymas / Apžiūra** — CTA apžiūrai

TITLE: aiškus NT marketplace pavadinimas (pvz. „2 kamb. butas Vilniuje, Naujamiestyje“).
`;
