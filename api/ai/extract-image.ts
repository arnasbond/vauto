import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  chatJson,
  EXTRACTION_SCHEMA,
  getServerOpenAiKey,
  toListing,
} from "../_lib/openai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = getServerOpenAiKey();
  if (!key) {
    return res.status(503).json({ error: "OPENAI_API_KEY not configured on server" });
  }

  const { imageDataUrl, userCity, contact } = req.body as {
    imageDataUrl: string;
    userCity: string;
    contact: string;
  };

  if (!imageDataUrl) {
    return res.status(400).json({ error: "imageDataUrl is required" });
  }

  try {
    const raw = await chatJson(
      key,
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Ištrauk skelbimo duomenis iš nuotraukos. JSON: ${EXTRACTION_SCHEMA}. Miestas: ${userCity ?? "Panevėžys"}`,
            },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
          ],
        },
      ],
      "gpt-4o-mini"
    );
    return res.status(200).json(
      toListing(raw, userCity ?? "Panevėžys", contact ?? "+370 612 34567")
    );
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
