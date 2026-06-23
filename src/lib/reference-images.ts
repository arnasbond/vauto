import { apiReferenceImages } from "@/lib/api/client";
import { isAiProxyAvailable } from "@/lib/api/config";

const CATEGORY_FALLBACK: Record<string, string[]> = {
  electronics: [
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&h=300&fit=crop",
  ],
  vehicles: [
    "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&h=300&fit=crop",
    "https://images.unsplash.com/photo-1542362567-b07e54358753?w=400&h=300&fit=crop",
  ],
  home: [
    "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=300&fit=crop",
  ],
  clothing: [
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=300&fit=crop",
  ],
  services: [
    "https://images.unsplash.com/photo-1558904541-efa843a96f01?w=400&h=300&fit=crop",
  ],
  real_estate: [
    "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&h=300&fit=crop",
  ],
  other: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop",
  ],
};

function localFallback(query: string, category?: string): string[] {
  const key = category && CATEGORY_FALLBACK[category] ? category : "other";
  const base = CATEGORY_FALLBACK[key] ?? CATEGORY_FALLBACK.other;
  const q = query.toLowerCase();
  if (/phone|iphone|telefon/i.test(q)) return CATEGORY_FALLBACK.electronics;
  if (/car|bmw|auto/i.test(q)) return CATEGORY_FALLBACK.vehicles;
  return base;
}

export async function searchReferenceImages(
  query: string,
  category?: string,
  limit = 4
): Promise<string[]> {
  if (isAiProxyAvailable()) {
    const remote = await apiReferenceImages({ query, category, limit });
    if (remote?.length) return remote;
  }

  return localFallback(query, category).slice(0, limit);
}
