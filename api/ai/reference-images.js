const CATEGORY_FALLBACK = {
  electronics: [
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&h=300&fit=crop",
  ],
  vehicles: [
    "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1542362567-b07e54358753?w=400&h=300&fit=crop",
  ],
  other: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop",
  ],
};

async function searchWikimedia(query, limit) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrlimit", String(limit));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url");
  url.searchParams.set("iiurlwidth", "400");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "VautoApp/1.0 (reference image search)" },
  });
  if (!res.ok) return [];

  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return [];

  const urls = [];
  for (const page of Object.values(pages)) {
    const thumb = page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url;
    if (thumb && typeof thumb === "string") urls.push(thumb);
  }
  return urls;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query, category, limit = 4 } = req.body || {};
  if (!query?.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    let images = await searchWikimedia(query.trim(), Math.min(limit, 6));
    if (!images.length) {
      const key = category && CATEGORY_FALLBACK[category] ? category : "other";
      images = CATEGORY_FALLBACK[key] ?? CATEGORY_FALLBACK.other;
    }
    return res.status(200).json({ images: images.slice(0, limit) });
  } catch (e) {
    const key = category && CATEGORY_FALLBACK[category] ? category : "other";
    return res.status(200).json({
      images: (CATEGORY_FALLBACK[key] ?? CATEGORY_FALLBACK.other).slice(0, limit),
    });
  }
};
