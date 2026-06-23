const { getServerOpenAiKey } = require("../lib/openai");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = getServerOpenAiKey();
  if (!key) {
    return res.status(503).json({ error: "OPENAI_API_KEY not configured on server" });
  }

  const { audioBase64, mimeType = "audio/webm" } = req.body || {};
  if (!audioBase64?.trim()) {
    return res.status(400).json({ error: "audioBase64 is required" });
  }

  try {
    const buffer = Buffer.from(audioBase64, "base64");
    const blob = new Blob([buffer], { type: mimeType });
    const form = new FormData();
    form.append("file", blob, "recording.webm");
    form.append("model", "whisper-1");
    form.append("language", "lt");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      return res.status(500).json({ error: `Whisper: ${whisperRes.status} ${err}` });
    }

    const data = await whisperRes.json();
    return res.status(200).json({ text: String(data.text ?? "").trim() });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
