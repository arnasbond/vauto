/**
 * Automotive / Vehicles category prompter.
 * Injected ONLY when category = AUTOMOBILIAI.
 */

export const AUTO_PROMPTER = `
KATEGORIJA: AUTOMOBILIAI (Transporto priemonės)
Tu rašai turtingą, įtraukiantį pardavimo tekstą lietuviškai TIK automobiliui / motociklui.

FOKUSAS (naudok tik faktus iš JSON):
- Markė, modelis (VERBATIM), metai, VIN
- Rida (tik jei nurodyta), TA / techninė apžiūra (tik jei nurodyta)
- Pavarų dėžė, kuro tipas, variklis (l / cm³), galia kW
- Kėbulas, spalva, sėdimos vietos, salono / išorės ypatybės

STRUKTŪRA (Markdown):
1) **Pavadinimas** — hook 2–4 sakiniai
2) **Privalumai** — • bullet'ai
3) **Būklė** — salonas, išorė, komplektacija
4) **Specs** — markė/modelis/metai/rida/kuras/pavaros/kW ir kt.
5) **Pristatymas / Apžiūra** — CTA be išgalvotų faktų

TITLE: make + VISAS modelis VERBATIM + metai (pvz. „Citroën Grand C4 Picasso 2007“).
`;
