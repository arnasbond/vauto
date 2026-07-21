import type { AiExtractedListing } from "@/lib/types";

export interface DetectedVisionObject {
  label: string;
  category?: string;
  confidence?: number;
}

const SELL_CHIP_PREFIX = "Parduoti ";
const SEARCH_CHIP_PREFIX = "Ieškoti ";

export {
  isVisionObjectSellChip,
  nounFromVisionObjectSellChip,
} from "@vauto/shared/listing-organism";

function normalizeChipLabel(raw: string, mode: "sell" | "search"): string {
  const trimmed = raw.trim().replace(/^[\[\]«»"']+|[\[\]«»"']+$/g, "");
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("parduoti ") || lower.startsWith("ieškoti ") || lower.startsWith("ieskoti ")) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  const prefix = mode === "sell" ? SELL_CHIP_PREFIX : SEARCH_CHIP_PREFIX;
  const noun = trimmed.replace(/^(parduoti|ieškoti|ieskoti)\s+/i, "").trim();
  return `${prefix}${noun.charAt(0).toLowerCase()}${noun.slice(1)}`;
}

export function parseChoiceChipsFromAttributes(
  attrs: Record<string, string | string[] | undefined> | undefined,
  mode: "sell" | "search" = "sell"
): string[] {
  if (!attrs) return [];
  const raw = attrs.choiceChips;
  const list =
    typeof raw === "string"
      ? raw.split("|").map((s) => normalizeChipLabel(s, mode))
      : Array.isArray(raw)
        ? raw.map((s) => normalizeChipLabel(String(s), mode))
        : [];
  return [...new Set(list.filter(Boolean))].slice(0, 4);
}

export function parseDetectedObjectsFromAttributes(
  attrs: Record<string, string | string[] | undefined> | undefined
): DetectedVisionObject[] {
  if (!attrs?.detectedObjects) return [];
  try {
    const parsed = JSON.parse(String(attrs.detectedObjects)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const r = item as Record<string, unknown>;
        const label = String(r.label ?? "").trim();
        if (!label) return null;
        return {
          label,
          category: r.category ? String(r.category) : undefined,
          confidence: Number.isFinite(Number(r.confidence)) ? Number(r.confidence) : undefined,
        };
      })
      .filter(Boolean) as DetectedVisionObject[];
  } catch {
    return [];
  }
}

export function extractVisionChoiceChips(
  extracted: Pick<AiExtractedListing, "attributes" | "clarificationPrompt" | "choiceChips">,
  mode: "sell" | "search" = "sell"
): string[] {
  if (extracted.choiceChips?.length) return extracted.choiceChips.slice(0, 4);
  const fromAttrs = parseChoiceChipsFromAttributes(extracted.attributes, mode);
  if (fromAttrs.length) return fromAttrs;
  const objects = parseDetectedObjectsFromAttributes(extracted.attributes);
  return objects
    .map((o) => normalizeChipLabel(o.label, mode))
    .filter((c) => c.length >= 6)
    .slice(0, 4);
}

export function buildPhotoClarificationMessage(extracted: AiExtractedListing): string {
  const objects = parseDetectedObjectsFromAttributes(extracted.attributes);
  // Specs/objects only — never echo remote sceneContext (paving, house, yard, trees).
  if (objects.length >= 2) {
    const labels = objects.map((o) => o.label).join(", ");
    return `Nuotraukoje matau kelis objektus: ${labels}. Ar teisingai suprantu, kurį objektą ruošiame? Pasirinkite žemiau.`;
  }

  const prompt =
    extracted.clarificationPrompt?.trim() ||
    (typeof extracted.attributes?.clarificationPrompt === "string"
      ? extracted.attributes.clarificationPrompt.trim()
      : "");
  if (prompt) {
    // Strip background poetry if remote API still emits it.
    const cleaned = prompt
      .replace(
        /Nuotraukoje matau[^.]*(?:kieme|trinkel|medin|namas|medži|dangus|oras)[^.]*\.\s*/gi,
        ""
      )
      .trim();
    if (cleaned && !/(kieme|trinkel|medin|medži|dangus)/i.test(cleaned)) {
      return cleaned;
    }
  }

  return extracted.description?.trim() || "Ką iš nuotraukos norite parduoti? Pasirinkite žemiau.";
}

export function shouldClarifyPhotoUpload(extracted: AiExtractedListing): boolean {
  const chips = extractVisionChoiceChips(extracted, "sell");
  const confidence = extracted.confidence ?? 0;
  const objects = parseDetectedObjectsFromAttributes(extracted.attributes);
  return chips.length >= 2 && (confidence < 0.55 || objects.length >= 2);
}

export function formatSearchAlternativeChips(alternatives: string[]): string[] {
  return alternatives
    .map((a) => normalizeChipLabel(a.replace(/^Ieškoti\s+/i, ""), "search"))
    .filter(Boolean)
    .slice(0, 4);
}
