const { handleVautoServerAction, hasAiKey } = require("../lib/vauto-unified");
const { toLegacyListing } = require("../lib/gemini-config");

function buildSearchKeywords(listing) {
  const tokens = [
    listing.title,
    listing.category,
    listing.location,
    listing.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/[\s,.;:!?()[\]'"„“—–-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t !== "undefined" && t !== "null");

  const attrs = listing.attributes && typeof listing.attributes === "object"
    ? Object.values(listing.attributes)
    : [];
  for (const value of attrs) {
    if (typeof value === "string" && value.trim().length >= 2) {
      tokens.push(value.trim().toLowerCase());
    }
  }

  return [...new Set(tokens)].slice(0, 12).join(" ");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { imageBase64, imageDataUrl, extraContext, userCity, contact } = req.body || {};
  const image = imageBase64 || imageDataUrl;

  if (!image || typeof image !== "string") {
    return res.status(400).json({ error: "imageBase64 is required" });
  }

  if (!hasAiKey()) {
    return res.status(503).json({
      ok: false,
      error: "GEMINI_API_KEY not configured on server",
    });
  }

  try {
    const result = await handleVautoServerAction({
      action: "analyze_image",
      imageDataUrl: image,
      extraContext,
      userCity: userCity || "Lietuva",
      contact: contact || "+370 612 34567",
    });
    const listing = toLegacyListing(result.listing);
    const keywords = buildSearchKeywords(listing);
    return res.status(200).json({
      ok: true,
      keywords,
      confidence: listing.confidence ?? 0,
      category: listing.category,
      title: listing.title,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: String(e?.message || e),
    });
  }
};
