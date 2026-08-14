/** Shared types for Lithuanian domain normalizers. */

export type NormalizedAttribute =
  | { kind: "transmission"; value: "automatic" | "manual"; originalText: string }
  | { kind: "fuel"; value: "diesel" | "petrol" | "electric" | "hybrid" | "lpg"; originalText: string }
  | { kind: "drivetrain"; value: "AWD" | "FWD" | "RWD" | "4WD"; originalText: string; context?: string }
  | { kind: "commerce"; value: "vat_invoice"; originalText: string }
  | { kind: "location"; value: string; originalText: string }
  | { kind: "unknown"; value: null; originalText: string };

export type DomainNormalizeResult = {
  originalText: string;
  attributes: NormalizedAttribute[];
  /** Tokens recognized but left unchanged (ambiguous). */
  unresolved: string[];
};
