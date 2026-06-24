const { runVautoAgent, hasAgentKey } = require("./lib/vauto-agent");
const { isBearerAdmin } = require("./lib/auth-token");

const MAX_ADMIN_PROJECT_CONTEXT_CHARS = 80_000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasAgentKey()) {
    return res.status(503).json({
      error: "AI agent unavailable (GEMINI_API_KEY or OPENAI_API_KEY required)",
    });
  }

  const { messages, context, adminProjectContext: rawAdminContext } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: "messages array is required" });
  }

  let adminProjectContext;
  if (rawAdminContext != null && String(rawAdminContext).trim()) {
    if (!isBearerAdmin(req)) {
      return res.status(403).json({ error: "Admin access required" });
    }
    adminProjectContext = String(rawAdminContext)
      .trim()
      .slice(0, MAX_ADMIN_PROJECT_CONTEXT_CHARS);
  }

  try {
    const result = await runVautoAgent({
      messages,
      context: context ?? {},
      adminProjectContext,
    });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
