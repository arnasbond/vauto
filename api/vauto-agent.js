const { runVautoAgent, hasAgentKey } = require("./lib/vauto-agent");
const { isBearerAdmin } = require("./lib/auth-token");

const MAX_ADMIN_PROJECT_CONTEXT_CHARS = 80_000;
const AGENT_MAX_MESSAGES = 32;
const AGENT_MAX_MESSAGE_CHARS = 12_000;
const AGENT_MAX_LISTINGS = 48;
const AGENT_MAX_LISTING_DESC_CHARS = 160;

const RENDER_API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.RENDER_API_URL ||
  ""
).replace(/\/$/, "");

function capText(text, max) {
  const t = String(text ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function trimAgentBody(body) {
  const messages = (body.messages ?? [])
    .slice(-AGENT_MAX_MESSAGES)
    .map((m) => ({
      role: m.role,
      text: capText(m.text, AGENT_MAX_MESSAGE_CHARS),
    }))
    .filter((m) => m.text.length > 0);

  const context = body.context ?? {};
  if (Array.isArray(context.listings) && context.listings.length) {
    context.listings = context.listings.slice(0, AGENT_MAX_LISTINGS).map((l) => ({
      ...l,
      description: l.description
        ? capText(l.description, AGENT_MAX_LISTING_DESC_CHARS)
        : undefined,
    }));
  }

  return {
    ...body,
    messages: messages.length ? messages : (body.messages ?? []).slice(-1),
    context,
  };
}

async function proxyToRenderApi(req, res) {
  if (!RENDER_API_URL) return false;

  try {
    const headers = { "Content-Type": "application/json" };
    const auth = req.headers?.authorization;
    if (auth) headers.Authorization = auth;

    const payload = trimAgentBody(req.body || {});
    const upstream = await fetch(`${RENDER_API_URL}/api/vauto-agent`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = {
        ok: false,
        error: text || upstream.statusText,
        code: upstream.status === 413 ? "payload_too_large" : "agent_unavailable",
      };
    }

    return res.status(upstream.status).json(body);
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

  const proxied = await proxyToRenderApi(req, res);
  if (proxied !== false) return;

  const body = trimAgentBody(req.body || {});
  const { messages, context, adminProjectContext: rawAdminContext } = body;

  if (!Array.isArray(messages) || !messages.length) {
    return jsonError(res, 400, "invalid_request", "messages array is required");
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

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};
