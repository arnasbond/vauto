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

export async function apiBulkImportPreview(
  file: File
): Promise<
  | { ok: true; data: ImportPreviewResponse }
  | { ok: false; error: string; status?: number }
> {
  const text = await file.text();
  const contentType = file.name.trim().toLowerCase().endsWith(".xml")
    ? "application/xml"
    : "text/csv";
  return dataFetch<ImportPreviewResponse>("/api/bulk-import/preview", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: text,
  });
}
