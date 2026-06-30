/** Shared Gemini Vision guardrails — reject logos/text-only images, never hallucinate products. */
export const VISION_ANTI_HALLUCINATION_RULE = `
GRIEŽTA TAISYKLĖ — PRIVALOMA:
Jei nuotraukoje NĖRA aiškiai identifikuojamo vieno pardavinėjamo objekto (drabužio ant kūno/manekeno, automobilio, baldų, elektronikos ir pan.), o matomas kambarys, interjeras, keli objektai, tekstas, logotipas, reklaminis plakatas, ekrano nuotrauka, tuščias fonas arba neaiškus vaizdas —
- grąžink confidence: 0 arba < 0.3
- NEGENERUOK išgalvoto skelbimo ir NEPRISKIR PASLAUGOS automatiškai
- Vietoj to pasiūlyk patikslinimą: apibūdink ką matai ir užduok klausimą su alternatyvomis (pvz. „Matau kambarį ir TV — ar parduodate televizorių, baldą, ar siūlote paslaugas?")
- DRAUDŽIAMA haliucinuoti (išsigalvoti) netikrus variantus be vizualinio pagrindo`;

export const WARDROBE_ANTI_HALLUCINATION_RULE = `
GRIEŽTA TAISYKLĖ — PRIVALOMA:
Jei nuotraukoje nėra realaus matomo drabužio (tik logotipas, tekstas, tuščias vaizdas, reklama) —
grąžink {"items":[],"error":"Prekė neatpažinta","voiceAnnouncement":"..."}.
DRAUDŽIAMA išsigalvoti netikrus drabužių variantus. Kiekvienas items įrašas turi atitikti aiškų fizinį drabužį nuotraukoje.`;
