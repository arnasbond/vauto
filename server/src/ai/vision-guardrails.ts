/** Shared Gemini Vision guardrails — reject logos/text-only images, never hallucinate products. */
export const VISION_ANTI_HALLUCINATION_RULE = `
GRIEŽTA TAISYKLĖ — PRIVALOMA:
Jei nuotraukoje NĖRA realaus pardavinėjamo objekto (drabužio ant kūno/manekeno, automobilio, baldų, elektronikos ir pan.), o matomas TIK tekstas, logotipas, reklaminis plakatas, ekrano nuotrauka, tuščias fonas arba neaiškus vaizdas —
- grąžink confidence: 0
- grąžink tuščią cleanQuery / visualSummary: "Prekė neatpažinta"
- NEGENERUOK jokių drabužių, suknelių, švarkų ar kitų prekių
- DRAUDŽIAMA haliucinuoti (išsigalvoti) netikrus variantus`;

export const WARDROBE_ANTI_HALLUCINATION_RULE = `
GRIEŽTA TAISYKLĖ — PRIVALOMA:
Jei nuotraukoje nėra realaus matomo drabužio (tik logotipas, tekstas, tuščias vaizdas, reklama) —
grąžink {"items":[],"error":"Prekė neatpažinta","voiceAnnouncement":"..."}.
DRAUDŽIAMA išsigalvoti netikrus drabužių variantus. Kiekvienas items įrašas turi atitikti aiškų fizinį drabužį nuotraukoje.`;
