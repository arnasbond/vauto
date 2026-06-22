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
              text: `Ištrauk skelbimo duomenis iš nuotraukos taip, kad vartotojas galėtų iškart rasti panašią prekę arba publikuoti skelbimą. Jei matai auto dalį (pvz. ratlankį, padangą), category turi būti "vehicles", title turi turėti konkrečią dalį ir dydį, attributes pridėk partType, size, condition, quantity, o price pateik kaip realistišką vietinės rinkos pradinį pasiūlymą eurais. JSON: ${EXTRACTION_SCHEMA}. Miestas: ${userCity ?? "Lietuva"}`,
            },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
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
