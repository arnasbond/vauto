const { getServerOpenAiKey } = require("../lib/openai");

async function visualFingerprint(key, imageUrl) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe this product photo for visual similarity search. Dense English keywords only, max 80 words.",
            },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

async function embedText(key, text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.trim(),
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.data?.[0]?.embedding ?? null;
}

function cosineSimilarity(a, b) {
  if (!a?.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = getServerOpenAiKey();
  if (!key) {
    return res.status(503).json({ error: "OPENAI_API_KEY not configured on server" });
  }

  const { imageDataUrl, candidates = [], limit = 40 } = req.body || {};
  if (!imageDataUrl?.trim()) {
    return res.status(400).json({ error: "imageDataUrl is required" });
  }

  try {
    const queryFingerprint = await visualFingerprint(key, imageDataUrl);
    if (!queryFingerprint) {
      return res.status(500).json({ error: "Visual fingerprint failed" });
    }
    const queryEmbedding = await embedText(key, queryFingerprint);
    if (!queryEmbedding) {
      return res.status(500).json({ error: "Embedding failed" });
    }

    const scores = {};
    for (const c of candidates.slice(0, 40)) {
      if (!c.image) continue;
      const fp = await visualFingerprint(key, c.image);
      if (!fp) continue;
      const emb = await embedText(key, fp);
      if (!emb) continue;
      const score = cosineSimilarity(queryEmbedding, emb);
      if (score > 0.05) scores[c.id] = Math.round(score * 1000) / 1000;
    }

    const sorted = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
    return res.status(200).json({ scores: Object.fromEntries(sorted) });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
