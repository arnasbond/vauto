const { handleVautoServerAction, hasAiKey } = require("./lib/vauto-unified");

const RENDER_API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.RENDER_API_URL ||
  ""
).replace(/\/$/, "");

async function proxyToRenderApi(req, res) {
  if (!RENDER_API_URL) return false;

  try {
    const headers = { "Content-Type": "application/json" };
    const auth = req.headers?.authorization;
    if (auth) headers.Authorization = auth;

    const upstream = await fetch(`${RENDER_API_URL}/api/vauto-server`, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body || {}),
    });

    const text = await upstream.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = {
        error: text || upstream.statusText,
      };
    }

    return res.status(upstream.status).json(body);
  } catch (e) {
    console.warn("[vauto-server] Render proxy failed:", e.message);
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const proxied = await proxyToRenderApi(req, res);
  if (proxied !== false) return;

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

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};
