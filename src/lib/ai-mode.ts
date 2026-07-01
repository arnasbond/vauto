import { apiAiHealthCheck } from "@/lib/api/client";

export async function resolveAiModeLabel(): Promise<string> {
  const health = await apiAiHealthCheck();
  if (health?.provider === "gemini") return "Gemini Flash · VAUTO serveris";
  if (health?.gemini) return "Gemini · VAUTO serveris";
  return "Demo režimas (GEMINI_API_KEY)";
}
