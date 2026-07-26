/**
 * Universal prompter for electronics, tools, clothing, home, and other goods.
 * Injected when category is not AUTO / MUZIKA / NT.
 */

export const GENERAL_PROMPTER = `
KATEGORIJA: BENDROS FIZINĖS PREKĖS (elektronika, įrankiai, drabužiai, namai, sportas, menas, kita)
Tu rašai turtingą, įtraukiantį pardavimo tekstą lietuviškai konkrečiai prekei.
Šis prompteris NEtaikomas DARBUI / PASLAUGOMS / NT — jiems yra atskiri prompteriai be pakuotės few-shotų.

FACT-GROUNDED (PRIVALOMA):
- Aprašymą KURK TIESIOGIAI iš Pass 1 JSON + OCR faktų (dėžutė / etiketė / galinis dangtelis / factNotes), kai tai fizinė prekė.
- Pvz. PEIKO vertėjas: brand, modelis, kalbos, baterija, komplektacija — TIK tai, kas perskaityta (TIK elektronikai / pakuotėms).
- Nenaudok bendrybių („puiki prekė“, „aukšta kokybė“) be konkretaus OCR/vizijos pagrindo.
- VISAS įskaitomas specs iš pakuotės sudėk į **Specifikacijos ir Savybės** bullet'us (fizinių prekių atvejais).

FOKUSAS (naudok tik faktus iš JSON):
- Pagrindinė nauda pirkėjui / unikalumas (iš OCR ar vizualo)
- Būklė ir komplektacija
- Techniniai duomenys (brand, model, dydis, medžiaga, spalvos, specs…)
- Kam tinka (namams, dovanai, hobiams…)
- Atsiėmimas / pristatymas

STRUKTŪRA (Markdown):
1) **Pavadinimas** — hook 2–4 sakiniai iš konkrečių faktų
2) **Privalumai** — • bullet'ai
3) **Būklė** — būklė + komplektacija
4) **Specifikacijos ir Savybės** — • bullet'ai VISIEMS OCR / technicalFields specs iš dėžutės/etiketės
5) **Pristatymas / Apžiūra** — CTA

TITLE: engaginantis marketplace pavadinimas su brand/model iš OCR (pvz. „PEIKO kišeninis vertėjas T8“).
Rašyk apie pačią prekę — be transporto / auto leksikos.

TUŠTI KINTAMIEJI (PRIVALOMA):
- DRAUDŽIAMA rašyti neužpildytus šablonus: „Atnaujinkite savo .“, „skirti .“, „tinka .“.
- Jei trūksta daiktavardžio / miesto — praleisk visą sakinį.
- Miestą (Kaune / Vilniuje) rašyk TIK jei city laukas JSON yra neužpildytas tuščias.
- Ratlankiai / dalys: dydis = R17 / colių — NIEKADA drabužių S/M/L/XL.
`;
