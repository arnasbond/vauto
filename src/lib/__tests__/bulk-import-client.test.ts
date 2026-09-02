import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IMPORT_CLIENT_MAX_BYTES,
  apiBulkImportPreview,
  buildBulkImportRequest,
  checkImportFile,
  contentTypeForImportFile,
} from "@/lib/api/bulk-import";

describe("F6 Final — import client file checks", () => {
  it("accepts .csv and .xml files within the size budget", () => {
    assert.equal(checkImportFile({ name: "import.csv", size: 1024 }).ok, true);
    assert.equal(
      checkImportFile({ name: "FEED.XML", size: 10 }).ok,
      true,
      "extension matching is case-insensitive"
    );
  });

  it("rejects unsupported extensions", () => {
    const r = checkImportFile({ name: "virus.exe", size: 10 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "unsupported");
    assert.equal(checkImportFile({ name: "feed", size: 10 }).ok, false);
  });

  it("rejects empty and oversized files", () => {
    const empty = checkImportFile({ name: "empty.csv", size: 0 });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.reason, "too_large");

    const big = checkImportFile({
      name: "big.csv",
      size: IMPORT_CLIENT_MAX_BYTES + 1,
    });
    assert.equal(big.ok, false);
    if (!big.ok) {
      assert.equal(big.reason, "too_large");
      assert.match(big.message, /per didelis/);
    }
  });
});

describe("F6 Final — raw binary upload (Atlas blocker)", () => {
  const INVALID_UTF8 = new Uint8Array([0x74, 0x69, 0x74, 0x6c, 0x65, 0x2c, 0x70, 0x72, 0x69, 0x63, 0x65, 0x0a, 0xff, 0xfe, 0x41]);

  it("buildBulkImportRequest passes ORIGINAL bytes as ArrayBuffer, never a string", () => {
    const buffer = INVALID_UTF8.buffer.slice(
      INVALID_UTF8.byteOffset,
      INVALID_UTF8.byteOffset + INVALID_UTF8.byteLength
    ) as ArrayBuffer;
    const req = buildBulkImportRequest("import.csv", buffer);
    assert.equal(req.path, "/api/bulk-import/preview");
    assert.equal(typeof req.options.body, "object", "body must be an object, not string");
    assert.ok(req.options.body instanceof ArrayBuffer, "body must be an ArrayBuffer");
    assert.notEqual(typeof (req.options.body as unknown), "string");
    const bytes = new Uint8Array(req.options.body);
    assert.deepEqual([...bytes], [...INVALID_UTF8], "invalid UTF-8 bytes preserved exactly");
  });

  it("content types are correct per file extension", () => {
    assert.equal(contentTypeForImportFile("feed.csv"), "text/csv");
    assert.equal(contentTypeForImportFile("FEED.XML"), "application/xml");
    assert.equal(contentTypeForImportFile("feed.txt"), "text/csv");
  });

  it("apiBulkImportPreview sends the raw bytes through fetch with the right Content-Type", async () => {
    const savedUrl = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "http://test-api.local";
    const captured: Array<{ url: string; init: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      captured.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({
          ok: true,
          importEnabled: false,
          source: "csv",
          columns: [],
          mapping: [],
          rows: [],
          summary: { total: 0, ok: 0, warnings: 0, errors: 0, byCategory: {} },
          reportText: "x",
          note: "tik patikrintas",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const file = new File([INVALID_UTF8 as unknown as BlobPart], "import.csv", {
        type: "text/csv",
      });
      const res = await apiBulkImportPreview(file);
      assert.equal(res.ok, true);
      assert.equal(captured.length, 1);
      const { url, init } = captured[0]!;
      assert.equal(url, "http://test-api.local/api/bulk-import/preview");
      assert.equal(init.method, "POST");
      assert.ok(init.body instanceof ArrayBuffer, "fetch body is an ArrayBuffer");
      assert.notEqual(typeof init.body, "string");
      const sent = new Uint8Array(init.body as ArrayBuffer);
      assert.deepEqual([...sent], [...INVALID_UTF8], "fetch carried the original invalid bytes untouched");
      const headers = init.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "text/csv");
    } finally {
      globalThis.fetch = originalFetch;
      if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
      else process.env.NEXT_PUBLIC_API_URL = savedUrl;
    }
  });
});
