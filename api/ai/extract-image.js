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

  const { imageDataUrl, userCity, contact } = req.body || {};
  if (!imageDataUrl) {
    return res.status(400).json({ error: "imageDataUrl is required" });
  }

  try {
    const raw = await chatJson(
      key,
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Ištrauk skelbimo duomenis iš nuotraukos taip, kad vartotojas galėtų iškart rasti panašią prekę arba publikuoti skelbimą. Atpažink tiksliai pagrindinį objektą — category ir title turi atitikti tai, ką realiai matai (telefonas → electronics, ne vehicles). Jei auto dalis — category vehicles su partType, size, condition, quantity. Kaina EUR. JSON: ${EXTRACTION_SCHEMA}. Miestas: ${userCity ?? "Lietuva"}`,
            },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ],
        },
      ],
      "gpt-4o-mini"
    );
    return res
      .status(200)
      .json(toListing(raw, userCity ?? "Lietuva", contact ?? "+370 612 34567"));
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
