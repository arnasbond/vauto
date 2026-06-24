function resolveGeminiApiKey() {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.AI_KEY?.trim() ||
    process.env.GOOGLE_AI_API_KEY?.trim() ||
    ""
  );
}

function resolveGeminiProvider() {
  return resolveGeminiApiKey() ? "gemini" : null;
}

function hasAiKey() {
  return Boolean(resolveGeminiApiKey());
}

function toLegacyListing(listing) {
  const attrs = { ...(listing.attributes || {}) };
  delete attrs._intent;
  delete attrs._vautoCategory;
  return {
    title: listing.title,
    price: listing.price,
    location: listing.location,
    contact: listing.contact,
    category: listing.category,
    description: listing.description,
    confidence: listing.confidence,
    attributes: attrs,
  };
}

module.exports = {
  resolveGeminiApiKey,
  resolveGeminiProvider,
  hasAiKey,
  toLegacyListing,
};
