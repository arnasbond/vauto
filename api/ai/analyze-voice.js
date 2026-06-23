const { getServerOpenAiKey, chatJson } = require("../lib/openai");

const VOICE_INTENT_SCHEMA = `{
  "understoodSummary": "string",
  "needsClarification": "boolean",
  "followUpQuestion": "string | null",
  "missingFields": ["string"],
  "imageSearchQuery": "string",
  "mergedTranscript": "string",
  "category": "electronics | vehicles | services | home | clothing | real_estate | other",
  "confidence": "number 0-1"
}`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = getServerOpenAiKey();
  if (!key) {
    return res.status(503).json({ error: "OPENAI_API_KEY not configured on server" });
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
      ? "Vartotojas nori įdėti / parduoti skelbimą."
      : "Vartotojas ieško prekės ar paslaugos.";

  try {
    const raw = await chatJson(
      key,
      [
        {
          role: "system",
          content: `Esi Vauto balso asistentas Lietuvoje. ${modeHint} Jei trūksta kritinės info (modelis, metai, būklė) — užduok VIENĄ trumpą klausimą lietuviškai. Po 2 klausimų tęsk su tuo, ką turi. imageSearchQuery — angliški raktažodžiai nuotraukų paieškai.`,
        },
        {
          role: "user",
          content: `Pokalbio istorija:\n${historyText || "(tuščia)"}\n\nNaujas įrašas: "${transcript}"\n\nJSON: ${VOICE_INTENT_SCHEMA}\nMiestas: ${userCity ?? "Lietuva"}`,
        },
      ],
      "gpt-4o-mini"
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
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
