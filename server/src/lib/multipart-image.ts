import type { Request } from "express";

export interface ParsedMultipartImage {
  imageDataUrl: string;
  fields: Record<string, string>;
}

function parseMultipartFields(
  body: Buffer,
  boundary: string
): { files: Map<string, { mimeType: string; data: Buffer }>; fields: Record<string, string> } {
  const files = new Map<string, { mimeType: string; data: Buffer }>();
  const fields: Record<string, string> = {};
  const delimiter = Buffer.from(`--${boundary}`);
  let offset = 0;

  while (offset < body.length) {
    const start = body.indexOf(delimiter, offset);
    if (start < 0) break;
    const partStart = start + delimiter.length;
    if (body[partStart] === 0x2d && body[partStart + 1] === 0x2d) break;

    const lineEnd = body.indexOf("\r\n", partStart);
    if (lineEnd < 0) break;
    const headerEnd = body.indexOf("\r\n\r\n", lineEnd);
    if (headerEnd < 0) break;

    const headerBlock = body.slice(lineEnd + 2, headerEnd).toString("utf8");
    const nameMatch = headerBlock.match(/name="([^"]+)"/i);
    const filenameMatch = headerBlock.match(/filename="([^"]*)"/i);
    const mimeMatch = headerBlock.match(/Content-Type:\s*([^\r\n]+)/i);
    const contentStart = headerEnd + 4;
    const nextBoundary = body.indexOf(delimiter, contentStart);
    const contentEnd = nextBoundary >= 0 ? nextBoundary - 2 : body.length;
    const content = body.slice(contentStart, Math.max(contentStart, contentEnd));

    if (nameMatch) {
      const fieldName = nameMatch[1]!;
      if (filenameMatch) {
        files.set(fieldName, {
          mimeType: (mimeMatch?.[1] ?? "application/octet-stream").trim(),
          data: content,
        });
      } else {
        fields[fieldName] = content.toString("utf8").replace(/\r\n$/, "");
      }
    }

    offset = nextBoundary >= 0 ? nextBoundary : body.length;
  }

  return { files, fields };
}

/** Parse a single multipart/form-data image upload (field name: image | file | photo). */
export function parseMultipartImageRequest(req: Request): ParsedMultipartImage | null {
  const contentType = req.headers["content-type"];
  if (!contentType?.includes("multipart/form-data")) return null;
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return null;

  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary) return null;

  const { files, fields } = parseMultipartFields(req.body, boundary);
  const file =
    files.get("image") ?? files.get("file") ?? files.get("photo") ?? files.values().next().value;
  if (!file || file.data.length === 0) return null;

  const base64 = file.data.toString("base64");
  const imageDataUrl = `data:${file.mimeType};base64,${base64}`;
  return { imageDataUrl, fields };
}
