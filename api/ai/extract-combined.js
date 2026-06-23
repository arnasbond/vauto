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

  const { imageDataUrl, imageDataUrls, text, extraContext, userCity, contact } =
    req.body || {};
  const images = Array.isArray(imageDataUrls) && imageDataUrls.length
    ? imageDataUrls
    : imageDataUrl
      ? [imageDataUrl]
      : [];
  const transcript = [text, extraContext].map((s) => s?.trim()).filter(Boolean).join("\n\n");

  if (!images.length || !transcript) {
    return res.status(400).json({ error: "imageDataUrl and text are required" });
  }

  const imageCountNote =
    images.length > 1
      ? ` Vartotojas įkėlė ${images.length} nuotraukas — naudok visas analizei.`
      : "";

  const prompt = `Ištrauk skelbimo duomenis iš nuotraukos IR vartotojo balso/teksto aprašymo vienu kartu. Tekstas turi prioritetą kainai, vietai ir detalėms; nuotrauka — objekto atpažinimui ir kategorijai. Atpažink tiksliai pagrindinį objektą.${imageCountNote} Vartotojo aprašymas: "${transcript}" JSON: ${EXTRACTION_SCHEMA}. Miestas: ${userCity ?? "Lietuva"}`;

  try {
    const raw = await chatJson(
      key,
      [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...images.map((url) => ({
              type: "image_url",
              image_url: { url, detail: "high" },
            })),
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
