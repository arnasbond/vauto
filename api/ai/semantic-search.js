const { getServerOpenAiKey } = require("../lib/openai");

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

  const { profile, candidates = [], limit = 40 } = req.body || {};
  if (!profile?.title) {
    return res.status(400).json({ error: "profile.title is required" });
  }

  const queryText = [
    profile.title,
    profile.category,
    profile.location,
    profile.description,
    profile.price ? `kaina ${profile.price} eur` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 2000);

  try {
    const queryEmbedding = await embedText(key, queryText);
    if (!queryEmbedding) {
      return res.status(500).json({ error: "Embedding failed" });
    }

    const scores = {};
    for (const c of candidates.slice(0, 80)) {
      const text = [c.title, c.category, c.location, c.description]
        .filter(Boolean)
        .join(" ");
      const emb = await embedText(key, text);
      if (emb) {
        const score = cosineSimilarity(queryEmbedding, emb);
        if (score > 0.05) scores[c.id] = Math.round(score * 1000) / 1000;
      }
    }

    const sorted = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
    const trimmed = Object.fromEntries(sorted);

    return res.status(200).json({ scores: trimmed });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
