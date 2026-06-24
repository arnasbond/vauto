import { apiAiHealthCheck } from "@/lib/api/client";

export async function resolveAiModeLabel(): Promise<string> {
  const health = await apiAiHealthCheck();
  if (health?.provider === "gemini") return "Gemini Flash · Vauto serveris";
  if (health?.gemini) return "Gemini · Vauto serveris";
  return "Demo režimas (GEMINI_API_KEY)";
}
