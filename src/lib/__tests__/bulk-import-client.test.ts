import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IMPORT_CLIENT_MAX_BYTES,
  checkImportFile,
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
