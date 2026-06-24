const { hasAiKey, resolveGeminiProvider } = require("../lib/gemini-config");

module.exports = function handler(_req, res) {
  const provider = resolveGeminiProvider();
  res.status(200).json({
    ok: true,
    gemini: provider !== null,
    provider,
    mode: provider ?? "demo",
  });
};
