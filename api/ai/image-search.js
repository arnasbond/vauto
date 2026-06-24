const RENDER_API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.RENDER_API_URL ||
  ""
).replace(/\/$/, "");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!RENDER_API_URL) {
    return res.status(503).json({ error: "Render API not configured" });
  }

  try {
    const upstream = await fetch(`${RENDER_API_URL}/api/ai/image-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    });
    const text = await upstream.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text || upstream.statusText };
    }
    return res.status(upstream.status).json(body);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
