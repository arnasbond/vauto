/**
 * Gemini semantic intent — replaces programmed stop-word / regex routing on the agent path.
 * Gemini MUST extract the core object and category; never pass filler verbs to searchListings.
 */

import { extractProductSearchTokens } from "../search-filter.js";

export const GEMINI_STOP_WORDS_RULE = `STOP-ŽODŽIAI (GRIEŽTAI IGNORUOTI):
- NIEKADA neperduok šių žodžių į searchListings.query, postNewListing.title ar create_listing_draft.title:
  „parduodu", „parduosiu", „parduoti", „ieškau", „ieskau", „noriu", „norėčiau", „noreciau", „padėk", „padek",
  „surask", „rask", „parodyk", „rodyti", „skelbimą", „skelbima", „man", „reikia", „reikėtų",
  „kelti", „įdėti", „ideti", „paskelbti", „help", „find", „search", „porą" (matuoklis, ne objektas).
- Šie žodžiai yra tik kalbos priedai — tavo užduotis semantinė: nustatyti PAGRINDINĮ OBJEKTĄ ir KETINIMĄ.`;

export const GEMINI_OBJECT_CATEGORY_MAP = `OBJEKTAS → KATEGORIJA (semantika, ne regex):
- kedai, batai, suknelė, striukė, marškiniai, kelnės, džinsai, paltas → clothing
- automobilis, BMW, Audi, Toyota, Volvo, Mercedes, VW, Ford → vehicles
- dviratis, motociklas → vehicles
- butas, namas, sklypas, žemė, miškas, arsas, nuoma → real_estate
- iPhone, telefonas, kompiuteris, televizorius → electronics
- meistras, remontas, valymas, kirpimas → services
- darbas, etatas, CV → jobs
- sofa, stalas, įrankiai → home
- neaišku → other`;

export const GEMINI_INTENT_ROUTING = `KETINIMO MARŠRUTIZAVIMAS (function calling — PRIVALOMA):
1. PIRKIMAS / PAIEŠKA — vartotojas nori RASTI, PIRKTI, PERŽIŪRĖTI:
   → searchListings(query=TikObjektas, category=…) + showZeroUiScreen(marketplace)
   → query PRIVALOMAS ir negali būti tuščias. Pvz. „ieškau Volvo" → searchListings({ query: "Volvo", category: "vehicles" })
   → „ieškau namą" → searchListings({ query: "namas", category: "real_estate" })
   → DRAUDŽIAMAS searchListings be query — kitaip grąžins netinkamus drabužius!

2. PARDAVIMAS / NAUJAS SKELBIMAS — vartotojas nori PARDUOTI, ĮKELTI, PASKELBTI:
   → create_listing_draft(category, title=TikObjektas) — PIRMAS žingsnis. NIEKADA searchListings!
   → „Noriu parduoti porą kedų" → create_listing_draft({ category: "clothing", title: "Kedai" })
   → „norėčiau parduoti namą" → create_listing_draft({ category: "real_estate", title: "Namas" })
   → Atsakymas: „Supratau, pradedam … skelbimo kūrimą!" + klausimas apie trūkstamus laukus
   → NIEKADA neatsakyk „Rezultatų nerasta" / „nieko tinkamo neradau" pardavimo intencijai!

3. Pardavimas vs paieška:
   - „noriu parduoti / parduoti / parduodu" + objektas → create_listing_draft
   - „ieškau / surask / noriu pirkti" + objektas → searchListings

4. Jei abu ketinimai neaiškūs — paklausk: „Norite parduoti ar ieškoti?"`;

export const GEMINI_INTENT_RULES = `${GEMINI_STOP_WORDS_RULE}

${GEMINI_OBJECT_CATEGORY_MAP}

${GEMINI_INTENT_ROUTING}`;

const SELL_INTENT_RE =
  /\b(noriu|norėčiau|noreciau|padėk|padek|ketinu|help\s+me)\s+(parduot|parduoti|įdėti|ideti|kelti|paskelbt)/i;

const SELL_DECLARATION_RE = /\b(parduodu|parduosiu|parduoti\s+nam|parduoti\s+ked|parduoti\s+auto)\b/i;

const BUY_INTENT_RE =
  /\b(ieškau|ieskau|surask|rask|noriu\s+pirkti|norėčiau\s+pirkti|noreciau\s+pirkti|where\s+can\s+i\s+buy)\b/i;

/** Runtime hint injected before Gemini turn — steers function calling without client regex search. */
export function buildRuntimeIntentHint(userText: string): string | null {
  const t = userText.trim();
  if (!t) return null;

  const lower = t.toLowerCase();
  const isBuy = BUY_INTENT_RE.test(lower);
  const isSell =
    (SELL_INTENT_RE.test(lower) || SELL_DECLARATION_RE.test(lower)) && !isBuy;

  if (isSell) {
    const tokens = extractProductSearchTokens(t);
    const objectHint = tokens.length ? tokens.join(" ") : "objektą iš vartotojo frazės";
    return `[Intent hint PRIVALOMA: PARDAVIMAS — iškviesk create_listing_draft su teisinga category ir title="${objectHint}". Nenaudok searchListings. Neatsakyk „Rezultatų nerasta".]`;
  }

  if (isBuy || /\bieškau\b|\bieskau\b/i.test(lower)) {
    const tokens = extractProductSearchTokens(t);
    if (tokens.length) {
      return `[Intent hint PRIVALOMA: PAIEŠKA — searchListings(query: "${tokens.join(" ")}", category pagal objektą, pvz. Volvo→vehicles, namas→real_estate, kedai→clothing). Tuščios query draudžiamos.]`;
    }
  }

  return null;
}
