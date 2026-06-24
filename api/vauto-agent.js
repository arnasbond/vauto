const { runVautoAgent, hasAgentKey } = require("./lib/vauto-agent");
const { isBearerAdmin } = require("./lib/auth-token");

const MAX_ADMIN_PROJECT_CONTEXT_CHARS = 80_000;
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

    const upstream = await fetch(`${RENDER_API_URL}/api/vauto-agent`, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body || {}),
    });

    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { ok: false, error: text || upstream.statusText, code: "agent_unavailable" };
    }

    return res.status(upstream.status).json(payload);
  } catch (e) {
    console.warn("[vauto-agent] Render proxy failed:", e.message);
    return false;
  }
}

function jsonError(res, status, code, error) {
  return res.status(status).json({ ok: false, code, error });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return jsonError(res, 405, "invalid_request", "Method not allowed");
  }

  const body = req.body || {};
  const { messages, context, adminProjectContext: rawAdminContext, includeAdminContext } =
    body;

  if (!Array.isArray(messages) || !messages.length) {
    return jsonError(res, 400, "invalid_request", "messages array is required");
  }

  if (includeAdminContext === true || (rawAdminContext != null && String(rawAdminContext).trim())) {
    const proxied = await proxyToRenderApi(req, res);
    if (proxied !== false) return;
  }

  if (!hasAgentKey()) {
    return jsonError(
      res,
      503,
      "agent_unavailable",
      "AI agent unavailable (GEMINI_API_KEY or OPENAI_API_KEY required)"
    );
  }

  let adminProjectContext;
  if (rawAdminContext != null && String(rawAdminContext).trim()) {
    if (!isBearerAdmin(req)) {
      return jsonError(res, 403, "admin_required", "Admin access required");
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
    const code = e.code || "agent_unavailable";
    const status = e.status || (code === "timeout" ? 504 : 503);
    return jsonError(res, status, code, e.message || String(e));
  }
};
