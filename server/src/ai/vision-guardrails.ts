/**
 * Gemini Vision guidance — soft autonomy, not a hard reject gate.
 * Never instruct the model to abort the listing pipeline for logos/rooms/ambiguity.
 */

export const VISION_ANTI_HALLUCINATION_RULE = `
VIZUALUS SUPRATIMAS (PRIVALOMA — autonomija, ne blokas):
- Ištrauk viską, ką matai: produktą, auto, NT, elektroniką, drabužį ar paslaugos kontekstą.
- Jei keli objektai — detectedObjects + choiceChips; confidence gali būti žemesnis, BET VIS TIEK grąžink geriausią juodraščio pasiūlymą.
- DRAUDŽIAMA: visiškai tuščias atsakymas, „prekė neatpažinta“ kaip stop, automatinis PASLAUGOS priskyrimas be pagrindo.
- Jei vaizdas silpnas — documentReadable/confidence atspindėk, bet NESTABDYK juodraščio.
- NIEKADA neatmesk vartotojo nuotraukų kaip „stock“ / „neadekvatu“ — tai ne tavo sprendimas.`;

export const WARDROBE_ANTI_HALLUCINATION_RULE = `
SPINTOS VIZIJA (PRIVALOMA — autonomija):
- Aptik matomus drabužius ir grąžink items masyvą.
- Jei neaišku — items gali būti tuščias, BET voiceAnnouncement turi pasiūlyti kitą žingsnį (patikslinti / įkelti kitą kadrą), ne kietą atmetimą.
- DRAUDŽIAMA išsigalvoti neegzistuojančius drabužius be vizualinio pagrindo.`;
