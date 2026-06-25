const { unifiedLlmJson, hasAiKey } = require("../lib/vauto-unified");

const SEARCH_INTENT_SCHEMA = `{
  "category": "Auto | Elektronika | Namai | Drabužiai | Paslaugos | NT | Darbas | null",
  "cleanQuery": "string — produkto ar paslaugos pavadinimas lietuviškai, be klausiamųjų žodžių (kas, kur, rask)",
  "location": "string — Lietuvos miestas vardininku (Vilnius, Kaunas, …) arba tuščia eilutė",
  "radiusKm": "number | null — tik 5, 10, 20, 50 arba null",
  "condition": "used | new | null"
}`;

function snapRadius(km) {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  if (n <= 20) return 20;
  return 50;
}

const VALID = new Set([
  "Auto",
  "Elektronika",
  "Namai",
  "Drabužiai",
  "Paslaugos",
  "NT",
  "Darbas",
]);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasAiKey()) {
    return res.status(503).json({ error: "GEMINI_API_KEY not configured on server" });
  }

  const { query, userCity } = req.body || {};
  if (!query?.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  const prompt = `Esi VAUTO pirkėjo paieškos intent analizatorius (Gemini). Vartotojas IEŠKO skelbimų — nekelia skelbimo.
Semantiškai suprask lietuvių kalbą, linksnius, sinonimus ir kontekstą. Nenaudok jokių fiksuotų žodžių žodynų — mąstyk prasmę.

Pavyzdžiai:
- "kas parduoda rubus" → category: Drabužiai, cleanQuery: "drabužiai"
- "kedai", "striukė", "kostiumas", "batai", "apranga" → Drabužiai
- "sofa", "komoda", "baldai" → Namai
- "volvo v70 kaune naudotas" → Auto, cleanQuery: "volvo v70", location: "Kaunas", condition: used
- "iPhone 13 vilniuje" → Elektronika, cleanQuery: "iPhone 13", location: "Vilnius"

Užklausa: """${String(query).trim()}"""
Numatytas vartotojo miestas: ${userCity ?? "Lietuva"}

Grąžink TIK vieną JSON objektą: ${SEARCH_INTENT_SCHEMA}`;

  try {
    const raw = await unifiedLlmJson({ prompt });
    const categoryRaw = raw.category;
    const category =
      categoryRaw == null || categoryRaw === "null"
        ? null
        : VALID.has(String(categoryRaw))
          ? String(categoryRaw)
          : null;

    return res.status(200).json({
      category,
      cleanQuery: String(raw.cleanQuery ?? "").trim(),
      location: String(raw.location ?? "").trim(),
      radiusKm: snapRadius(raw.radiusKm),
      condition:
        raw.condition === "used" || raw.condition === "new" ? raw.condition : null,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
