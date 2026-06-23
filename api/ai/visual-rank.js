const { getServerOpenAiKey, chatJson } = require("../lib/openai");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = getServerOpenAiKey();
  if (!key) {
    return res.status(503).json({ error: "OPENAI_API_KEY not configured on server" });
  }

  const { profile, candidates } = req.body || {};
  if (!profile?.title || !Array.isArray(candidates) || !candidates.length) {
    return res.status(400).json({ error: "profile.title and candidates[] required" });
  }

  const listText = candidates
    .slice(0, 40)
    .map(
      (c, i) =>
        `${i + 1}. id=${c.id} | ${c.title} | ${c.category} | ${c.price}€ | ${c.location}`
    )
    .join("\n");

  const prompt = `Vartotojas ieško panašių skelbimų pagal AI atpažintą objektą.
Objektas: "${profile.title}" (kategorija: ${profile.category}, kaina ~${profile.price}€, vieta: ${profile.location})
${profile.description ? `Aprašymas: ${profile.description}` : ""}

Įvertink kiekvieno kandidato vizualinį / semantinį panašumą 0.0–1.0.
Grąžink JSON: { "scores": { "<listing-id>": 0.0-1.0 } }

Kandidatai:
${listText}`;

  try {
    const raw = await chatJson(
      key,
      [
        {
          role: "system",
          content:
            "Esi Vauto paieškos rerankeris. Grąžink tik JSON su scores objektu. Aukščiausias balas — labiausiai panašūs skelbimai.",
        },
        { role: "user", content: prompt },
      ],
      "gpt-4o-mini"
    );

    const scores = raw.scores && typeof raw.scores === "object" ? raw.scores : {};
    const normalized = {};
    for (const c of candidates) {
      const v = Number(scores[c.id]);
      if (Number.isFinite(v)) normalized[c.id] = Math.min(1, Math.max(0, v));
    }

    return res.status(200).json({ scores: normalized });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
