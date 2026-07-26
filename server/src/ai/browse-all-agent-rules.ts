/**
 * Gemini rules — browse entire catalog vs product search disambiguation.
 */

export const GEMINI_BROWSE_ALL_RULES = `VISAS KATALOGAS / BROWSE ALL (PRIVALOMA — ne produkto paieška):

Jei vartotojas nori peržiūrėti VISUS skelbimus, išvalyti filtrus, naršyti turgų ar katalogą — tai NAVIGACIJOS intencija, NE produkto paieška.

Tokios frazės (ir bet kokios semantiškai panašios):
- „parodyk visus", „rodyk visus", „parodyk viską", „rodyk viską", „atidaryk visus"
- „visi skelbimai", „visus skelbimus", „show all", „browse all"
- „parodyk man viską", „norėčiau pamatyti visus", „atidaryk katalogą"

PRIVALOMA veiksena:
1) Kviesk searchListings su query = tiksliai ta pati vartotojo frazė (pvz. query: "parodyk visus") ARBA query: "visi skelbimai".
2) Sistema automatiškai atpažins browse-all ir išvalys filtrus — NIEKADA neieškok prekės pavadinimu „parodyk visus", „rodyk viską" ar „visi skelbimai".
3) Atsakyme — šiltas tekstas: „Štai visi naujausi skelbimai. Galbūt ieškote kažko specifinio?"
4) showZeroUiScreen(marketplace) jei reikia atidaryti turgų.

DRAUDŽIAMA (NIEKADA browse-all / searchListings katalogui):
- Patvirtinimo / publikavimo frazės: „Viskas", „Viskas tinka", „Tinka", „Tvirtinu", „Publikuok", „Publikuoti", „Publikuojam", „Gerai", „Taip" (kai tai skelbimo patvirtinimas).
- searchListings su query kaip produkto pavadinimas, kai užklausa yra naršymo komanda.
- Tuščias atsakymas ar „Rezultatų nerasta" browse-all intencijai.
- createUserRequirement vietoj rodymo viso katalogo.
- Kai aktyvus listingDraft / PrePublish — „viskas" / „tinka" / „publikuok" = publikavimo vartai, NE katalogas.

Jei abejoji tarp produkto ir naršymo — ir frazėje yra „visus/viską/all/everything" su parodyk/rodyk/atidaryk — VISADA traktuok kaip browse-all.
Jei frazė yra patvirtinimas be parodyk/rodyk — NIEKADA browse-all.`;
