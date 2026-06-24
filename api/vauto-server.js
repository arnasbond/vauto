const { handleVautoServerAction, hasAiKey } = require("./lib/vauto-unified");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action } = req.body || {};
  if (!action) {
    return res.status(400).json({ error: "action is required" });
  }

  if (action !== "upload_media" && !hasAiKey()) {
    return res.status(503).json({
      error: "AI API key not set (GEMINI_API_KEY or OPENAI_API_KEY)",
    });
  }

  try {
    const result = await handleVautoServerAction(req.body);
    return res.status(200).json(result);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || String(e) });
  }
};
