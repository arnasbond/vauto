import { dataFetch } from "@/lib/api/client";

/**
 * F6 Final — bulk import client. Raw CSV/XML text upload; the server does
 * every security decision (UTF-8, DTD/entities, budgets, mapping). The
 * client only reads the file locally and forwards the text — and always
 * shows the server's `importEnabled: false` truth instead of inventing one.
 */

export type ImportRowReport = {
  line: number;
  verdict: "ok" | "warning" | "error";
  errors: string[];
  warnings: string[];
  ignoredFields: string[];
  title: string | null;
  price: number | null;
  category: string | null;
  location: string | null;
};

export type ImportPreviewResponse = {
  ok: boolean;
  importEnabled: boolean;
  source: "csv" | "xml";
  columns: string[];
  mapping: Array<{ column: string; field: string | null; ignored: boolean }>;
  rows: ImportRowReport[];
  summary: {
    total: number;
    ok: number;
    warnings: number;
    errors: number;
    byCategory: Record<string, number>;
  };
  reportText: string;
  error?: string | null;
  note?: string;
};

export const IMPORT_CLIENT_MAX_BYTES = 512 * 1024;

export type ImportFileCheck =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "too_large"; message: string };

export function checkImportFile(file: {
  name: string;
  size: number;
}): ImportFileCheck {
  const name = file.name.trim().toLowerCase();
  const supported =
    name.endsWith(".csv") || name.endsWith(".xml");
  if (!supported) {
    return {
      ok: false,
      reason: "unsupported",
      message: "Palaikomi tik .csv ir .xml failai.",
    };
  }
  if (file.size === 0) {
    return { ok: false, reason: "too_large", message: "Failas tuščias." };
  }
  if (file.size > IMPORT_CLIENT_MAX_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      message: `Failas per didelis (daugiausia ${Math.floor(
        IMPORT_CLIENT_MAX_BYTES / 1024
      )} KB).`,
    };
  }
  return { ok: true };
}

export function contentTypeForImportFile(name: string): "text/csv" | "application/xml" {
  return name.trim().toLowerCase().endsWith(".xml")
    ? "application/xml"
    : "text/csv";
}

/**
 * Build the raw-binary upload request. The body is the ORIGINAL file bytes
 * (ArrayBuffer) — never a string. No text decoding happens anywhere on the
 * client, so invalid UTF-8 reaches the server byte-for-byte and the server's
 * fatal decoder can reject it.
 */
export function buildBulkImportRequest(
  fileName: string,
  buffer: ArrayBuffer
): {
  path: string;
  options: {
    method: "POST";
    headers: { "Content-Type": string };
    body: ArrayBuffer;
  };
} {
  return {
    path: "/api/bulk-import/preview",
    options: {
      method: "POST",
      headers: { "Content-Type": contentTypeForImportFile(fileName) },
      body: buffer,
    },
  };
}

export async function apiBulkImportPreview(
  file: File
): Promise<
  | { ok: true; data: ImportPreviewResponse }
  | { ok: false; error: string; status?: number }
> {
  // file.text() would pre-decode (and mangle) non-UTF-8 bytes — forbidden.
  // arrayBuffer() hands the ORIGINAL bytes to fetch untouched.
  const buffer = await file.arrayBuffer();
  const req = buildBulkImportRequest(file.name, buffer);
  return dataFetch<ImportPreviewResponse>(req.path, req.options);
}
