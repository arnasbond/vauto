const {
  EXTRACTION_SCHEMA,
  getServerOpenAiKey,
  chatJson,
  toListing,
} = require("../lib/openai");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = getServerOpenAiKey();
  if (!key) {
    return res.status(503).json({ error: "OPENAI_API_KEY not configured on server" });
  }

  const { text, userCity, contact } = req.body || {};
  if (!text?.trim()) {
    return res.status(400).json({ error: "text is required" });
  }

  try {
    const raw = await chatJson(key, [
      {
        role: "system",
        content:
          "Ištrauk skelbimo duomenis iš lietuviško teksto. Nustatyk kategoriją (vehicles, clothing, services, real_estate, other) ir užpildyk attributes. Jei kainos nėra — price: 0.",
      },
      {
        role: "user",
        content: `Tekstas: "${text}"\nJSON: ${EXTRACTION_SCHEMA}\nMiestas: ${userCity ?? "Panevėžys"}`,
      },
    ]);
    return res
      .status(200)
      .json(toListing(raw, userCity ?? "Panevėžys", contact ?? "+370 612 34567"));
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
