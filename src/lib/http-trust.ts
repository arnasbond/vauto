/** Safe, Lithuanian HTTP error copy — never leak SQL, stacks, or internals. */

const SQL_OR_STACK =
  /password|secret|api[_-]?key|token|stack|ECONNREFUSED|postgres|sqlstate|relation\s+".+"\s+does not exist|syntax error|at\s+\S+\s+\(|node_modules/i;

export type TrustHttpKind =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid"
  | "server"
  | "network"
  | "unknown";

export type TrustHttpError = {
  kind: TrustHttpKind;
  status?: number;
  message: string;
};

function sanitizeRaw(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  if (SQL_OR_STACK.test(text)) return "";
  if (text.length > 240) return `${text.slice(0, 197)}…`;
  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
    const msg =
      (typeof parsed.message === "string" && parsed.message) ||
      (typeof parsed.error === "string" && parsed.error) ||
      "";
    if (SQL_OR_STACK.test(msg)) return "";
    return msg.trim();
  } catch {
    return text;
  }
}

export function mapHttpError(
  status: number | undefined,
  raw?: string,
  context?: "review" | "deal" | "generic"
): TrustHttpError {
  const sanitized = raw ? sanitizeRaw(raw) : "";

  if (status === 401) {
    return {
      kind: "unauthorized",
      status,
      message: "Prisijungimas nebegalioja. Prašome prisijungti iš naujo.",
    };
  }
  if (status === 403) {
    return {
      kind: "forbidden",
      status,
      message:
        context === "review"
          ? "Atsiliepimą galima palikti tik užbaigtam sandoriui, kuriame dalyvaujate."
          : "Neturite teisės atlikti šio veiksmo.",
    };
  }
  if (status === 404) {
    return {
      kind: "not_found",
      status,
      message:
        context === "deal"
          ? "Sandoris nerastas."
          : "Ieškomas išteklius nerastas.",
    };
  }
  if (status === 409) {
    return {
      kind: "conflict",
      status,
      message:
        context === "review"
          ? "Jūs jau įvertinote šį sandorį"
          : sanitized || "Būsenos konfliktas. Atnaujinkite puslapį ir bandykite vėl.",
    };
  }
  if (status === 400 || status === 422) {
    return {
      kind: "invalid",
      status,
      message:
        sanitized && !/^[A-Z0-9_]+$/.test(sanitized)
          ? sanitized
          : "Šiuo metu šio veiksmo atlikti negalima. Patikrinkite sandorio būseną.",
    };
  }
  if (status != null && status >= 500) {
    return {
      kind: "server",
      status,
      message: "Laikinai nepavyko. Bandykite dar kartą.",
    };
  }
  if (status == null) {
    return {
      kind: "network",
      message: "Nepavyko susisiekti su serveriu. Patikrinkite ryšį.",
    };
  }
  return {
    kind: "unknown",
    status,
    message: sanitized || "Įvyko klaida. Bandykite dar kartą.",
  };
}
