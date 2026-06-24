import { Router } from "express";
import { runVautoAgent } from "../ai/vauto-agent.js";
import { normalizeAgentRouteError } from "../ai/agent-errors.js";
import { MAX_ADMIN_PROJECT_CONTEXT_CHARS } from "../ai/agent-system-instruction.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { userIsAdmin } from "../middleware/auth.js";
import { getAdminAgentContext } from "../repository.js";
import { trimVautoAgentRequest } from "../ai/agent-request-trim.js";
import { hasAgentAiKey } from "../load-env.js";

export const vautoAgentRouter = Router();

vautoAgentRouter.post("/", async (req: AuthedRequest, res) => {
  const {
    messages,
    context,
    adminProjectContext: rawAdminContext,
    includeAdminContext,
  } = req.body ?? {};

  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({
      ok: false,
      code: "invalid_request",
      error: "messages array is required",
    });
  }

  if (!hasAgentAiKey()) {
    return res.status(503).json({
      ok: false,
      code: "agent_unavailable",
      error:
        "AI agent unavailable (set GEMINI_API_KEY or OPENAI_API_KEY on the server)",
    });
  }

  let adminProjectContext: string | undefined;

  if (includeAdminContext === true) {
    const isAdmin = await userIsAdmin(req);
    if (!isAdmin) {
      return res.status(403).json({
        ok: false,
        code: "admin_required",
        error: "Admin access required",
      });
    }
    if (!req.authUserId) {
      return res.status(401).json({
        ok: false,
        code: "auth_required",
        error: "Authentication required",
      });
    }
    try {
      const fromDb = await getAdminAgentContext(req.authUserId);
      if (fromDb.trim()) {
        adminProjectContext = fromDb.trim().slice(0, MAX_ADMIN_PROJECT_CONTEXT_CHARS);
      }
    } catch (e) {
      const err = normalizeAgentRouteError(e);
      return res.status(err.status).json({
        ok: false,
        code: err.code,
        error: err.message,
      });
    }
  } else if (rawAdminContext != null && String(rawAdminContext).trim()) {
    const isAdmin = await userIsAdmin(req);
    if (!isAdmin) {
      return res.status(403).json({
        ok: false,
        code: "admin_required",
        error: "Admin access required",
      });
    }
    adminProjectContext = String(rawAdminContext)
      .trim()
      .slice(0, MAX_ADMIN_PROJECT_CONTEXT_CHARS);
  }

  try {
    const result = await runVautoAgent(
      trimVautoAgentRequest({
        messages,
        context: context ?? {},
        adminProjectContext,
      })
    );
    res.json(result);
  } catch (e) {
    const err = normalizeAgentRouteError(e);
    res.status(err.status).json({
      ok: false,
      code: err.code,
      error: err.message,
    });
  }
});
