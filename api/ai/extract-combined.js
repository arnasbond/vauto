const { handleVautoServerAction, hasAiKey } = require("../lib/vauto-unified");
const { toLegacyListing } = require("../lib/gemini-config");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasAiKey()) {
    return res.status(503).json({ error: "GEMINI_API_KEY not configured on server" });
  }

  const { imageDataUrl, imageDataUrls, text, extraContext, userCity, contact } = req.body || {};
  const images =
    Array.isArray(imageDataUrls) && imageDataUrls.length
      ? imageDataUrls
      : imageDataUrl
        ? [imageDataUrl]
        : [];

  if (!images.length || !text?.trim()) {
    return res.status(400).json({ error: "imageDataUrl and text are required" });
  }

  try {
    const result = await handleVautoServerAction({
      action: "parse_combined",
      imageDataUrl: images[0],
      imageDataUrls: images.length > 1 ? images : undefined,
      text,
      extraContext,
      userCity,
      contact,
    });
    return res.status(200).json(toLegacyListing(result.listing));
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
