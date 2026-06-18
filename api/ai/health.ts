import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServerOpenAiKey } from "../_lib/openai";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const hasKey = Boolean(getServerOpenAiKey());
  res.status(200).json({
    ok: true,
    openai: hasKey,
    mode: hasKey ? "server" : "demo",
  });
}
