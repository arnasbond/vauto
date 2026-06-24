import { Router } from "express";
import { runVautoAgent } from "../ai/vauto-agent.js";
import { MAX_ADMIN_PROJECT_CONTEXT_CHARS } from "../ai/agent-system-instruction.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { userIsAdmin } from "../middleware/auth.js";

export const vautoAgentRouter = Router();

vautoAgentRouter.post("/", async (req: AuthedRequest, res) => {
  const { messages, context, adminProjectContext: rawAdminContext } = req.body ?? {};

  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: "messages array is required" });
  }

  const hasKey =
    Boolean(process.env.GEMINI_API_KEY?.trim()) ||
    Boolean(process.env.OPENAI_API_KEY?.trim());

  if (!hasKey) {
    return res.status(503).json({
      error: "AI agent unavailable (GEMINI_API_KEY or OPENAI_API_KEY required)",
    });
  }

  let adminProjectContext: string | undefined;
  if (rawAdminContext != null && String(rawAdminContext).trim()) {
    const isAdmin = await userIsAdmin(req);
    if (!isAdmin) {
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
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
