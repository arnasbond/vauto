const { unifiedLlmJson, hasAiKey } = require("../lib/vauto-unified");

const BUDDY_REPEAT_PROMPT =
  "Atsiprašau, ne viską aiškiai išgirdau. Ar galėtumėte pakartoti komandą?";

const VOICE_INTENT_SCHEMA = `{
  "understoodSummary": "string — lietuviškai, be žodžio ieškoti jei vartotojas kelia skelbimą",
  "needsClarification": "boolean",
  "followUpQuestion": "string | null — vienas TTS klausimas trūkstamiems laukams (pvz. „AI užpildė markę ir modelį. Kokiais metais… ir kokia kaina?“)",
  "missingFields": ["string"],
  "imageSearchQuery": "string — tik paieškai, angliški raktažodžiai",
  "mergedTranscript": "string",
  "intent": "sell | search | service | general",
  "category": "electronics | vehicles | services | home | clothing | real_estate | other",
  "confidence": "number 0-1"
}`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasAiKey()) {
    return res.status(503).json({ error: "GEMINI_API_KEY not configured on server" });
  }

  const { transcript, mode, history, userCity } = req.body || {};
  if (!transcript?.trim()) {
    return res.status(400).json({ error: "transcript is required" });
  }

  const historyText = (history ?? [])
    .map((h) => `${h.role === "user" ? "Vartotojas" : "AI"}: ${h.text}`)
    .join("\n");

  const modeHint =
    mode === "listing"
      ? "Vartotojas nori įdėti / parduoti skelbimą — NE paieška."
      : "Nustatyk ar vartotojas IEŠKO, ar KELIA skelbimą.";

  try {
    const raw = await unifiedLlmJson(
      `Esi Vauto balso asistentas (Gemini). ${modeHint}
Pokalbio istorija:
${historyText || "(tuščia)"}

Naujas įrašas: "${transcript}"
Miestas: ${userCity ?? "Lietuva"}

Jei kelia skelbimą ir trūksta laukų — needsClarification=true, followUpQuestion vienu šiltu klausimu.

Grąžink JSON: ${VOICE_INTENT_SCHEMA}`
    );

    return res.status(200).json({
      understoodSummary: String(raw.understoodSummary ?? "Supratau jūsų užklausą"),
      needsClarification: Boolean(raw.needsClarification),
      followUpQuestion: raw.followUpQuestion ? String(raw.followUpQuestion) : null,
      missingFields: Array.isArray(raw.missingFields)
        ? raw.missingFields.map(String)
        : [],
      imageSearchQuery: String(raw.imageSearchQuery ?? transcript).slice(0, 80),
      mergedTranscript: String(raw.mergedTranscript ?? transcript),
      category: String(raw.category ?? "other"),
      confidence: Number(raw.confidence) || 0.75,
      intent: String(raw.intent ?? (mode === "listing" ? "sell" : "search")),
    });
  } catch {
    return res.status(200).json({
      understoodSummary: "Ne viską aiškiai supratau",
      needsClarification: true,
      followUpQuestion: BUDDY_REPEAT_PROMPT,
      missingFields: [],
      imageSearchQuery: "",
      mergedTranscript: String(transcript),
      category: "other",
      confidence: 0.2,
      intent: mode === "listing" ? "sell" : "search",
    });
  }
};
