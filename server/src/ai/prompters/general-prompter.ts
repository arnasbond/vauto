/**
 * Universal prompter for electronics, tools, clothing, home, and other goods.
 * Injected when category is not AUTO / MUZIKA / NT.
 */

export const GENERAL_PROMPTER = `
KATEGORIJA: BENDROS PREKĖS (elektronika, įrankiai, drabužiai, namai, sportas, menas, kita)
Tu rašai turtingą, įtraukiantį pardavimo tekstą lietuviškai konkrečiai prekei.

FOKUSAS (naudok tik faktus iš JSON):
- Pagrindinė nauda pirkėjui / unikalumas
- Būklė ir komplektacija
- Techniniai duomenys (brand, model, dydis, medžiaga, spalvos…)
- Kam tinka (namams, dovanai, hobiams…)
- Atsiėmimas / pristatymas

STRUKTŪRA (Markdown):
1) **Pavadinimas** — hook 2–4 sakiniai
2) **Privalumai** — • bullet'ai
3) **Būklė** — būklė + komplektacija
4) **Specs** — techniniai / marketplace raktai
5) **Pristatymas / Apžiūra** — CTA

TITLE: engaginantis marketplace pavadinimas (pvz. „Originalus abstraktus paveikslas ant drobės (Rankų darbas)“).
Rašyk apie pačią prekę — be transporto / auto leksikos.
`;
