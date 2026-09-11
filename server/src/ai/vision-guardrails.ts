/**
 * Gemini Vision guidance — soft autonomy, not a hard reject gate.
 * Never instruct the model to abort the listing pipeline for logos/rooms/ambiguity.
 */

export const VISION_ANTI_STALE_TITLE_RULE = `
ANTI-STALE TITLE (PRIVALOMA — naujas upload):
- title / make / model PRIVALO kilti TIK iš DABARTINIŲ nuotraukų ir OCR (tech passport).
- DRAUDŽIAMA kartoti ankstesnio skelbimo antraštę, myListings pavadinimus, chat istorijos prekę ar seną listingDraft.title, jei vizualiai / OCR nesutampa.
- Jei kontekste yra senas ar bendrinis title („Naujas skelbimas“, kita markė/modelis) — IGNORUOK ir rašyk naują title iš OCR/vizijos.
- Universalus OCR: analizuok VISAS prisegtas nuotraukas (gallery + dokumentai) viename kontekste; dokumentų tekstas = ground-truth.`;

/**
 * Vision grounded sales copy — natural, attractive writing that never
 * manufactures facts. Style freedom stays with the model; grounding owns
 * every concrete claim.
 */
export const VISION_NATURAL_GROUNDED_COPY_RULE = `
NATURAL GROUNDED SALES COPY (PRIVALOMA — gyvas, patrauklus, bet faktais pagrįstas tekstas):
Rašyk natūraliai, sklandžiai ir patraukliai lietuviškai — kaip geriausias marketplace tekstas.
Stiliaus laisvė (tonas, struktūra, gyvumas, patrauklumas) priklauso tau. Vienintelis apribojimas:
KIEKVIENAS konkretus teiginys turi turėti pagrindą — nieko neišgalvok tik dėl „gražesnio“ teksto.

KIEKVIENĄ konkretų teiginį grindžia VIENAS iš šių šaltinių:
1. matoma vaizdo informacija;
2. OCR (įskaitomas tekstas);
3. aiškūs vartotojo teiginiai;
4. autoritetingi struktūrizuoti skelbimo duomenys;
5. aiškiai pažymėta, pagrįsta IŠVADA (su neapibrėžtumu, ne kaip faktas).

FAKTAS → gali teigti ir įtraukti.
PAREMTA IŠVADA → gali paminėti su neapibrėžtumu („atrodo, kad…“), bet NE kaip skelbimo faktą.
NEŽINOMA → neišgalvok; praleisk arba pažymėk kaip nežinomą.

VAŽDU NEĮRODOMI dalykai (jei jų NĖRA OCR / vartotojo tekste) — NEteigk jų kaip faktų:
avarijų istorija, mechaninė būklė, savininkų istorija, kaimynystės kokybė, nematomos techninės specifikacijos, garantija, pristatymo sąlygos.
Nespėliok kainos, TA, ridos ar „odinio salono“ be pagrindo.

- title: švarus, patrauklus LT marketplace pavadinimas (brand + model + tipas, kai žinomi) — iš faktų, ne iš fantazijos.
- description: gali būti struktūruota Markdown (** ir • bullet); kokybė kyla iš gerai pateiktų ŽINOMŲ faktų.
- attributes: tik tos kategorijos atributai, TIK iš vizualo / OCR / vartotojo; jei abejoji — palik tuščią.
- Jei nuotrauka skurdi ar neaiški — aprašyk tai, ką matai, ir neišgalvok trūkstamų savybių.`;

/** Deep OCR — packaging boxes, labels, back covers (plus Regitra via companion rule). */
export const VISION_DEEP_OCR_EXTRACTION_RULE = `
DEEP VISION OCR EXTRACTION (PRIVALOMA — kiekviena įkelta nuotrauka):
Atlik IŠSAMŲ OCR: aktyviai nuskaityk, identifikuok ir TRANSKRIBUOK VISĄ įskaitomą tekstą.

PRODUKTO PAKUOTĖS / DĖŽUTĖS / ETIKETĖS / GALINIS DANGTELIS (pvz. PEIKO vertėjas, elektronika, kosmetika):
- Markė / brand, modelis / produkto pavadinimas, tipas
- Techninės specifikacijos (kalbos, baterija, dydis, galia, SVV, sudėtis, sertifikatai…)
- Komplektacija / contents, įspėjimai, serijos / partijos numeriai jei matomi
- VISĄ įskaitomą tekstą sudėk į technicalFields (brand, model, condition, specs…) IR factNotes / ocrText
- NEPRAILSK smulkių spec eilučių — jos = ground-truth skelbimui

LED / APŠVIETIMAS (kai matomas):
- Jei yra LED juostos, party light, RGB / spalvotas apšvietimas — rašyk bendrai:
  „integruotas RGB / spalvotas apšvietimas“ (arba „integracija su RGB apšvietimu“).
- NErašyk vienos statiškos spalvos (pvz. tik „mėlynas LED“ / „raudonas LED“),
  nebent OCR aiškiai nurodo tik vieną fiksuotą spalvą be RGB.

TAISYKLĖS:
- OCR prioritetas prieš vizualines spekuliacijas.
- Jei tekstas dalinai neryškus — documentReadable/confidence, BET grąžink viską, ką perskaitei.
- Neiškraipyk ir neišgalvok — tik tai, kas įskaitoma nuotraukoje.`;

/** Strict Lithuanian Regitra tech-passport OCR → PrePublish autofill. */
export const VISION_REGITRA_TECH_PASSPORT_OCR_RULE = `
REGITRA TECH PASSPORT OCR (PRIVALOMA kai matomas žalias/mėlynas techninis pasas):
Ištrauk ir AUTO-FILL technicalFields be papildomų follow-up klausimų:
- D.1 → make (markė)
- D.3 → model (modelis VERBATIM, įskaitant Grand / Avant / xDrive)
- E → vin (VIN kodas, 17 simb. jei matoma)
- P.1 → engine (cm³ → litrai, pvz. 1997 → 2.0)
- P.2 → powerKw (kW skaičius)
- P.3 → fuelType (Dyzelinas | Benzinas | Elektra | Hibridas | Dujos)
- B → firstRegistration (YYYY-MM-DD) + year (YYYY)
Kai šie laukai užpildyti — NIEKADA neklausti markės/modelio/variklio/kuro/VIN dar kartą.`;

/**
 * Pass-1 Omniva L-locker gabarit check (max 39×38×64 cm, 30 kg).
 * Small parcelable goods → fitsOmnivaLocker true; bulky → false / OVERSIZED.
 */
export const VISION_OMNIVA_GABARIT_RULE = `
OMNIVA PAŠTOMATO GABARITAI (PRIVALOMA — Pass 1 extraction):
Omniva L max: 39 cm × 38 cm × 64 cm, max 30 kg.
Įvertink vizualų dydį + OCR specs ir grąžink:
- fitsOmnivaLocker: boolean
- estimatedSize: "S" | "M" | "L" | "OVERSIZED"

fitsOmnivaLocker = true / estimatedSize S|M|L:
- Maža elektronika (PEIKO vertėjas, telefonai, ausinės, powerbank)
- Smulkūs įrankiai, aksesuarai, kosmetika, knygos
- Apranga / avalynė / mados aksesuarai (jei telpa į L dėžę)
- Maži muzikos priedai (kabeliai, pedalai) — NE dideli instrumentai jei akivaizdžiai dideli

fitsOmnivaLocker = false / estimatedSize OVERSIZED:
- Automobiliai, NT, darbas, paslaugos (visada)
- Baldai (sofa, spinta, stalas, lova, čiužinys)
- Stambi buitinė technika (šaldytuvas, skalbyklė, orkaitė)
- Dviračiai, paspirtukai, dideli garsiakalbiai
- Stambios auto dalys (bamperiai, kapotai, sparnai, durys)
- Bet kas vizualiai didesnis už ~39×38×64 cm arba sunkesnis už 30 kg

Jei abejoji — OVERSIZED + fitsOmnivaLocker false (saugiau nei klaidingas locker).`;

/** Pass-1 extraction only — facts/OCR/category, no creative sales copy. */
export const VISION_VEHICLE_MODEL_CUE_HINT = `
AUTOMOBILIŲ MODELIO ORIENTYRAI (REKOMENDACIJA — lankstumas, ne suvaržymas):
Kai atpažįsti visą automobilį (AUTOMOBILIAI), naudok vizualius ORIENTYRUS tik kaip pagalbą tiksliau atskirti artimus modelius / kėbulo variantus
(pvz. C4 Picasso vs Grand C4 Picasso, universalas vs hetčbekas, Avant vs limuzinas):
- Kėbulo linijos ir siluetas (ilgis, galinė dalis, D-stulpelis / „C“ linija)
- Stogo laikikliai / rilingai (jei matomi)
- Šoninių langų skaičius / forma / trečioji eilė
- Priekiniai / galiniai žibintai ir jų forma
Rašyk pastebėjimus į factNotes / exteriorFeatures TIK jei AIŠKIAI matai.
OCR D.3 (modelis VERBATIM) ir S.1 (vietos) turi PRIORITETĄ prieš vizualius spėjimus —
orientyrai PAPILDO, bet NIEKADA nepriverčia modelio, jei neaišku. Palik null, jei abejoji.
Tai rekomendacinės gairės: išlaikyk bendrą gebėjimą atpažinti bet kurią transporto priemonę.`;

export const VISION_EXTRACTION_ANTI_HALLUCINATION_RULE = `
VIZUALUS SUPRATIMAS — PASS 1 EXTRACTION (kreipiantis, ne blokas):
- Ištrauk MAKSIMALIAI daug STRUKTŪRUOTŲ FAKTŲ, kuriuos MATAI su dideliu patikimumu:
  modelis, komplektacija, ratlankiai, salonas, būklės ženklai, etiketės, OCR tekstas.
- Jei parametro nuotraukoje NĖRA arba neaišku — PALIK null / praleisk. Nespėliok (rida, kW, TA, kaina, „odinis salonas“ be pagrindo).
- Jei keli objektai — detectedObjects + choiceChips; confidence gali būti žemesnis, BET VIS TIEK grąžink geriausią faktų JSON.
- Venk visiškai tuščio atsakymo ir „prekė neatpažinta“ kaip stop; automatinio PASLAUGOS priskyrimo be pagrindo.
- Jei vaizdas silpnas — documentReadable/confidence atspindėk, bet NESTABDYK ekstrakcijos.
- NIEKADA neatmesk vartotojo nuotraukų kaip „stock“ / „neadekvatu“ — tai ne tavo sprendimas.
- NIEKADA nesiūlyk ankstesnių skelbimų pavadinimų ar katalogo prekių jei jų NĖRA nuotraukoje.
- Šiame žingsnyje NErašyk turtingo sales description — tik šalti faktai + category + imageRoles.
${VISION_VEHICLE_MODEL_CUE_HINT}
${VISION_ANTI_STALE_TITLE_RULE}
${VISION_REGITRA_TECH_PASSPORT_OCR_RULE}
${VISION_DEEP_OCR_EXTRACTION_RULE}
${VISION_OMNIVA_GABARIT_RULE}`;

export const VISION_ANTI_HALLUCINATION_RULE = `
${VISION_EXTRACTION_ANTI_HALLUCINATION_RULE}
${VISION_NATURAL_GROUNDED_COPY_RULE}`;

export const WARDROBE_ANTI_HALLUCINATION_RULE = `
SPINTOS VIZIJA (PRIVALOMA — autonomija):
- Aptik matomus drabužius ir grąžink items masyvą.
- Jei neaišku — items gali būti tuščias, BET voiceAnnouncement turi pasiūlyti kitą žingsnį (patikslinti / įkelti kitą kadrą), ne kietą atmetimą.
- DRAUDŽIAMA išsigalvoti neegzistuojančius drabužius be vizualinio pagrindo.
- DRAUDŽIAMA kartoti ankstesnių drabužių pavadinimų iš myListings, jei dabartinėse nuotraukose jų nesimato.
- Kiekvienam item: patrauklus title + trumpos, vizualiai pagrįstos description eilutės (medžiaga, dydis, būklė, stilius) — tik iš to, ką matai; neišgalvok nematomų savybių.`;
