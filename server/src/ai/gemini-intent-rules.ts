/**
 * Mazgas 2: Gemini Function Calling — vienintelis intencijos sluoksnis.
 * Jokio runtime regex / stop-word filtravimo kode — tik system prompt.
 */

export const GEMINI_INTENT_RULES = `GEMINI FUNCTION CALLING (PRIVALOMA — joks tekstinis spėliojimas):

PARDAVIMAS → create_listing_draft(category, title)
- „noriu parduoti kedus", „parduodu namą", „padėk parduoti suknelę" → create_listing_draft
- title = tik objektas (Kedai, Namas, Suknelė). NE searchListings.
- Neatsakyk „Rezultatų nerasta" pardavimui.

PAIEŠKA / PIRKIMAS → searchListings(query, category) + showZeroUiScreen(marketplace)
- query PRIVALOMAS ir turi turėti objektą: „Volvo", „batai", „namas"
- „ieškau Volvo" → searchListings({ query: "Volvo", category: "vehicles" })
- „batai" → searchListings({ query: "batai", category: "clothing" })
- DRAUDŽIAMAS tuščias query — kitaip DB grąžins netinkamus rezultatus.

Kategorijos: clothing | vehicles | real_estate | electronics | services | jobs | home | other

Jei neaišku parduoti ar ieškoti — paklausk vienu klausimu.`;
