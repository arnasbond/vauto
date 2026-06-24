import { Router } from "express";
import { runVautoAgent } from "../ai/vauto-agent.js";

export const vautoAgentRouter = Router();

vautoAgentRouter.post("/", async (req, res) => {
  const { messages, context } = req.body ?? {};

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

  try {
    const result = await runVautoAgent({ messages, context: context ?? {} });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
