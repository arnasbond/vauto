/**
 * Mazgas 2: Gemini Function Calling — vienintelis intencijos sluoksnis.
 * Jokio runtime regex / stop-word filtravimo kode — tik system prompt.
 */

export const GEMINI_INTENT_RULES = `GEMINI FUNCTION CALLING (PRIVALOMA — joks tekstinis spėliojimas):

PARDAVIMAS → create_listing_draft(category, title)
- „noriu parduoti kedus", „parduodu namą", „noreciau parduoti volvo v70", „padėk parduoti suknelę" → create_listing_draft
- title = prekės pavadinimas (Volvo V70, Kedai, Namas, Suknelė). NE searchListings.
- Pardavimo frazės (parduoti, įkelti, paskelbti, norėčiau parduoti) VISADA → create_listing_draft, net jei minimas automobilio modelis.
- Neatsakyk „Rezultatų nerasta" pardavimui.

PAIEŠKA / PIRKIMAS → searchListings(query, category) + showZeroUiScreen(marketplace)
- query PRIVALOMAS su raktiniais žodžiais: „Volvo", „suknelės", „batai", „namas"
- „ieškau Volvo" → searchListings({ query: "Volvo", category: "vehicles" })
- „rask kas parduoda sukneles" → searchListings({ query: "suknelės", category: "clothing" })
- „batai" → searchListings({ query: "batai", category: "clothing" })
- DRAUDŽIAMAS tuščias query.

Kategorijos: clothing | vehicles | real_estate | electronics | services | jobs | home | other

INTENCijos PIVOTAS (kai aktyvus listingDraft / laukiami anketos laukai):
- PRIEŠ updateListingDraft ar anketos laukų interpretavimą — patikrink, ar nauja žinutė yra NAUJA PAIEŠKA, ne atsakymas į klausimą.
- Paieškos požymiai: ieškau, rask, parodyk, kas parduoda, noriu nusipirkti, noriu pirkti, kitas objektas nei esamas juodraštis.
- Jei vartotojas pakeitė temą → NENUTRAUKINĘS atsakymo „ne viską išgirdau". Nutrauk anketos būseną ir IŠKART kviesk searchListings + showZeroUiScreen(marketplace).
- Jei tai atsakymas į klausimą (metai, spalva, kaina, miestas, markė) → updateListingDraft arba postNewListing.
- Pavyzdys: klausėte metų → vartotojas „ieškau suknelės" → searchListings({ query: "suknelės", category: "clothing" }), NE updateListingDraft.

PAGRINDINĖ PAIEŠKA (SearchBar):
- Pirmoji žinutė iš viršutinio paieškos lauko — ta pati logika: pardavimas → create_listing_draft; paieška → searchListings. Niekada neprielaidauk, kad tai tik tinklelio filtras.

Jei neaišku parduoti ar ieškoti — paklausk vienu klausimu.`;
