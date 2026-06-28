/**
 * Gemini semantic intent — replaces programmed stop-word / regex routing on the agent path.
 * Gemini MUST extract the core object and category; never pass filler verbs to searchListings.
 */

export const GEMINI_STOP_WORDS_RULE = `STOP-ŽODŽIAI (GRIEŽTAI IGNORUOTI):
- NIEKADA neperduok šių žodžių į searchListings.query, postNewListing.title ar create_listing_draft.title:
  „parduodu", „parduosiu", „ieškau", „ieskau", „noriu", „norėčiau", „noreciau", „padėk", „padek",
  „surask", „rask", „parodyk", „rodyti", „skelbimą", „skelbima", „man", „reikia", „reikėtų",
  „kelti", „įdėti", „ideti", „paskelbti", „help", „find", „search".
- Šie žodžiai yra tik kalbos priedai — tavo užduotis semantinė: nustatyti PAGRINDINĮ OBJEKTĄ ir KETINIMĄ.`;

export const GEMINI_OBJECT_CATEGORY_MAP = `OBJEKTAS → KATEGORIJA (semantika, ne regex):
- kedai, batai, suknelė, striukė, marškiniai, kelnės, džinsai → clothing
- automobilis, BMW, Audi, Toyota, dviratis, motociklas → vehicles (dviratis/motociklas → vehicles arba home pagal kontekstą)
- butas, namas, sklypas, žemė, miškas, arsas, nuoma → real_estate
- iPhone, telefonas, kompiuteris, televizorius → electronics
- meistras, remontas, valymas, kirpimas → services
- darbas, etatas, CV → jobs
- sofa, stalas, įrankiai → home
- neaišku → other`;

export const GEMINI_INTENT_ROUTING = `KETINIMO MARŠRUTIZAVIMAS (function calling — PRIVALOMA):
1. PIRKIMAS / PAIEŠKA — vartotojas nori RASTI, PIRKTI, PERŽIŪRĖTI skelbimus:
   → searchListings(query=TikObjektas, category=…) + showZeroUiScreen(marketplace)
   → query: TIK objektas lietuviškai (pvz. „kedai", „suknelė", „sklypas"), be stop-žodžių
   → NIEKADA neatsakyk „Rezultatų nerasta" jei vartotojas aiškiai nori PARDUOTI

2. PARDAVIMAS / NAUJAS SKELBIMAS — vartotojas nori PARDUOTI, ĮKELTI, PASKELBTI:
   → create_listing_draft(category, title=TikObjektas) — PIRMAS žingsnis, kai dar trūksta kainos/miesto
   → Kai žinomi visi laukai → postNewListing
   → showZeroUiScreen(listing_preview) kai juodraštis paruoštas
   Pvz. „Padėk man parduoti suknelę" → create_listing_draft({ category: "clothing", title: "Suknelė" })
   Atsakymas vartotojui: „Supratau, pradedam suknelės skelbimo kūrimą! Kokios spalvos ar dydžio ji yra?"

3. NEIMK „parduodu" kaip paieškos raktažodžio — „parduodu kedus" pardavimo kontekste = create_listing_draft(title: „Kedai").
   Pirkimo kontekste („ieškau kedų", „surask kedus") = searchListings(query: „kedai").

4. Jei abu ketinimai neaiškūs — paklausk VIENU trumpu klausimu: „Norite parduoti ar ieškoti?"`;

export const GEMINI_INTENT_RULES = `${GEMINI_STOP_WORDS_RULE}

${GEMINI_OBJECT_CATEGORY_MAP}

${GEMINI_INTENT_ROUTING}`;
