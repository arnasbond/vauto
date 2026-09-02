/**
 * F6 Final — safe CSV/XML bulk import boundary.
 *
 * This route implements the FULL parse/validate/preview/mapping layer with
 * hard security guarantees (strict UTF-8, deterministic delimiters, no DTD /
 * entities / network resolution, formula-injection rejection, size/row/field
 * budgets, canonical category + per-vertical attribute validation, explicit
 * `other` fallback, no invented facts).
 *
 * Persistence is deliberately FAIL-CLOSED: the server has no `draft` listing
 * status (LISTING_STATUSES = active|sold|deleted|paused|archived), so a
 * durable "import into drafts" cannot be completed without a broader
 * listing-pipeline change. `bulkImportEnabled()` therefore ALWAYS returns
 * false and `/confirm` always answers 403 `disabled`. Nothing here writes to
 * the database and nothing fakes completion. The production gate
 * (VAUTO_ENABLE_BULK_IMPORT) stays OFF by default and is not opened by this
 * wave.
 *
 * Mounted with `actionRateLimiter` + `requireAuth` in server/src/index.ts.
 * Actor identity is ALWAYS server-derived from the JWT — a seller can never
 * import on behalf of another account. The LLM has NO tool for this boundary.
 */
import { Router, type Request, type Response } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { canRunBulkOperations } from "../ai/bulk-listing-control.js";
import {
  IMPORT_MAX_BYTES,
  parseCsv,
  parseXml,
  type XmlNode,
} from "../bulk-import/import-parsers.js";
import {
  bulkImportEnabled,
  buildImportPreview,
  extractXmlRow,
  mapColumn,
  type ImportPreviewResult,
} from "../bulk-import/import-validate.js";

const router = Router();

/** Raw text upload: CSV/XML content arrives as the request body itself. */
export const bulkImportTextParser = {
  type: ["text/csv", "application/xml", "text/xml", "text/plain"],
  limit: IMPORT_MAX_BYTES,
};

function sniffSource(text: string): "csv" | "xml" {
  const t = text.trimStart();
  if (t.startsWith("<")) return "xml";
  return "csv";
}

function buildCsvPreview(text: string): ImportPreviewResult {
  const parsed = parseCsv(text);
  if ("error" in parsed) {
    return {
      source: "csv",
      columns: [],
      mapping: [],
      rows: [],
      summary: { total: 0, ok: 0, warnings: 0, errors: 1, byCategory: {} },
      reportText: parsed.error,
    };
  }
  const rows = parsed.rows.map((cells, i) => {
    const fields: Record<string, string> = {};
    parsed.headers.forEach((h, j) => {
      const mapped = mapColumn(h);
      if (mapped.field && !mapped.field.startsWith("attribute:")) {
        fields[mapped.field] = cells[j] ?? "";
      }
    });
    const images: string[] = [];
    const tags: string[] = [];
    const attributes: Record<string, string> = {};
    parsed.headers.forEach((h, j) => {
      const mapped = mapColumn(h);
      if (mapped.field === "image" || mapped.field === "images") {
        images.push(...String(cells[j] ?? "").split(/[,;|]/).map((s) => s.trim()).filter(Boolean));
      } else if (mapped.field === "tags") {
        tags.push(...String(cells[j] ?? "").split(/[,;|]/).map((s) => s.trim()).filter(Boolean));
      } else if (mapped.field?.startsWith("attribute:")) {
        attributes[mapped.field.slice("attribute:".length)] = String(cells[j] ?? "").trim();
      }
    });
    const ignored = parsed.headers.filter((h) => mapColumn(h).ignored);
    return { line: i + 2, fields, images, tags, attributes, ignored };
  });
  return buildImportPreview({ source: "csv", columns: parsed.headers, rows });
}

function buildXmlPreview(text: string): ImportPreviewResult {
  const parsed = parseXml(text);
  if ("error" in parsed) {
    return {
      source: "xml",
      columns: [],
      mapping: [],
      rows: [],
      summary: { total: 0, ok: 0, warnings: 0, errors: 1, byCategory: {} },
      reportText: parsed.error,
    };
  }
  const rows = parsed.listingNodes.map((node: XmlNode, i) => {
    const extracted = extractXmlRow(node);
    return { line: i + 1, ...extracted };
  });
  const columns = [
    "title",
    "price",
    "category",
    "location",
    "description",
    "tags",
    "images",
    "attributes",
  ];
  return buildImportPreview({ source: "xml", columns, rows });
}

router.post("/preview", async (req: AuthedRequest, res: Response) => {
  if (!canRunBulkOperations(req.authRole)) {
    res.status(403).json({ ok: false, code: "unauthorized", error: "Tik verslo pardavėjams." });
    return;
  }
  if (typeof req.body !== "string" || req.body.trim().length === 0) {
    res.status(400).json({ ok: false, code: "invalid_payload", error: "Įkelkite CSV arba XML failo turinį." });
    return;
  }
  if (Buffer.byteLength(req.body, "utf8") > IMPORT_MAX_BYTES) {
    res.status(413).json({ ok: false, code: "too_large", error: `Failas per didelis (daugiausia ${IMPORT_MAX_BYTES} baitų).` });
    return;
  }
  const source = sniffSource(req.body);
  const preview = source === "xml" ? buildXmlPreview(req.body) : buildCsvPreview(req.body);
  const hardError =
    preview.summary.errors > 0 && preview.rows.length === 0 ? preview.reportText : null;

  res.json({
    ok: true,
    importEnabled: bulkImportEnabled(),
    source: preview.source,
    columns: preview.columns,
    mapping: preview.mapping,
    rows: preview.rows,
    summary: preview.summary,
    reportText: preview.reportText,
    error: hardError,
    note:
      "Importas patenka tik į juodraščių būseną ir niekada nepublikuojamas automatiškai.",
  });
});

/**
 * Persistence is fail-closed: no durable import execution exists yet (no
 * `draft` listing status). This endpoint NEVER returns success — the client
 * cannot fake completion and no rows are ever written.
 */
router.post("/confirm", async (_req: Request, res: Response) => {
  res.status(403).json({
    ok: false,
    code: "disabled",
    error:
      "Masinis importas dar neįjungtas: serveris neturi juodraščių (draft) būsenos skelbimams. Jokie skelbimai nebuvo sukurti.",
  });
});

export default router;
