export type ProviderFailureCode =
  | "provider_unavailable"
  | "http_error"
  | "timeout"
  | "malformed_json"
  | "schema_invalid";

export class ProviderFailureError extends Error {
  readonly code: ProviderFailureCode;
  readonly status?: number;
  constructor(code: ProviderFailureCode, message: string, status?: number) {
    super(message);
    this.name = "ProviderFailureError";
    this.code = code;
    this.status = status;
  }
}

export function isRetryableFailure(err: unknown): boolean {
  if (!(err instanceof ProviderFailureError)) return false;
  if (err.code === "timeout") return false;
  if (err.code === "http_error") {
    if (err.status === 429) return true;
    if (err.status != null && err.status >= 500) return true;
    return err.status == null;
  }
  return false;
}
