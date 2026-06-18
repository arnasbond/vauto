const EXTRACTION_SCHEMA = `{
  "title": "string",
  "price": "number",
  "location": "string",
  "category": "electronics | vehicles | services | home | other",
  "confidence": "number 0-1"
}`;

function getServerOpenAiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key && key.startsWith("sk-") ? key : null;
}

async function chatJson(key, messages, model = "gpt-4o-mini") {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages,
      temperature: 0.2,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty OpenAI response");
  return JSON.parse(content);
}

function toListing(raw, userCity, contact) {
  return {
    title: String(raw.title ?? "Skelbimas"),
    price: Number(raw.price) || 0,
    location: String(raw.location ?? userCity),
    contact,
    category: String(raw.category ?? "other"),
    confidence: Number(raw.confidence) || 0.8,
  };
}

module.exports = { EXTRACTION_SCHEMA, getServerOpenAiKey, chatJson, toListing };
