const { runVautoAgent, hasAgentKey } = require("./lib/vauto-agent");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasAgentKey()) {
    return res.status(503).json({
      error: "AI agent unavailable (GEMINI_API_KEY or OPENAI_API_KEY required)",
    });
  }

  const { messages, context } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: "messages array is required" });
  }

  try {
    const result = await runVautoAgent({ messages, context: context ?? {} });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
