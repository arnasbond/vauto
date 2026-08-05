import { Router } from "express";
import { hasAiKey } from "../ai/llm-provider.js";
import { handleVautoServerAction } from "../ai/vauto-unified.js";
import {
  safeDomainMessage,
  sendInternalError,
} from "../lib/http-errors.js";

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
    if (status >= 500) {
      return sendInternalError(res, err, "vauto-server");
    }
    return res.status(status).json({
      error: safeDomainMessage(err) || "Užklausa nepavyko",
      ...(err.code ? { code: err.code } : {}),
    });
  }
});
