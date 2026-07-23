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

export const VISION_ANTI_HALLUCINATION_RULE = `
VIZUALUS SUPRATIMAS (PRIVALOMA — autonomija, ne blokas):
- Ištrauk viską, ką matai: produktą, auto, NT, elektroniką, drabužį ar paslaugos kontekstą.
- Jei keli objektai — detectedObjects + choiceChips; confidence gali būti žemesnis, BET VIS TIEK grąžink geriausią juodraščio pasiūlymą.
- DRAUDŽIAMA: visiškai tuščias atsakymas, „prekė neatpažinta“ kaip stop, automatinis PASLAUGOS priskyrimas be pagrindo.
- Jei vaizdas silpnas — documentReadable/confidence atspindėk, bet NESTABDYK juodraščio.
- NIEKADA neatmesk vartotojo nuotraukų kaip „stock“ / „neadekvatu“ — tai ne tavo sprendimas.
${VISION_ANTI_STALE_TITLE_RULE}`;

export const WARDROBE_ANTI_HALLUCINATION_RULE = `
SPINTOS VIZIJA (PRIVALOMA — autonomija):
- Aptik matomus drabužius ir grąžink items masyvą.
- Jei neaišku — items gali būti tuščias, BET voiceAnnouncement turi pasiūlyti kitą žingsnį (patikslinti / įkelti kitą kadrą), ne kietą atmetimą.
- DRAUDŽIAMA išsigalvoti neegzistuojančius drabužius be vizualinio pagrindo.
- DRAUDŽIAMA kartoti ankstesnių drabužių pavadinimus iš myListings, jei dabartinėse nuotraukose jų nesimato.`;
