import { Router } from "express";
import { hasAiKey } from "../ai/llm-provider.js";
import { handleVautoServerAction } from "../ai/vauto-unified.js";

export const vautoServerRouter = Router();

const AI_UNAVAILABLE = {
  error: "AI API key not set (GEMINI_API_KEY required)",
};

vautoServerRouter.post("/", async (req, res) => {
  const { action } = req.body ?? {};
  if (!action) {
    return res.status(400).json({ error: "action is required" });
  }

  if (action !== "upload_media" && !hasAiKey()) {
    return res.status(503).json(AI_UNAVAILABLE);
  }

  try {
    const result = await handleVautoServerAction(req.body);
    res.json(result);
  } catch (e) {
    const err = e as Error & {
      status?: number;
      code?: string;
      missing?: string[];
      hint?: string;
    };
    const status = err.status ?? 500;
    console.error("[vauto-server]", err.message || String(e), {
      action: req.body?.action,
      code: err.code,
      missing: err.missing,
      status,
    });
    res.status(status).json({
      error: err.message || String(e),
      ...(err.code ? { code: err.code } : {}),
      ...(err.missing?.length ? { missing: err.missing } : {}),
      ...(err.hint ? { hint: err.hint } : {}),
    });
  }
});
