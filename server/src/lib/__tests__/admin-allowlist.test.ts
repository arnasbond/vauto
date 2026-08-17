import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  isAllowlistedAdminName,
  shouldElevateToSuperAdmin,
} from "../admin-allowlist.js";

const PREV_NAMES = process.env.ADMIN_NAMES;
const PREV_EMAILS = process.env.ADMIN_EMAILS;
const PREV_EMAIL = process.env.ADMIN_EMAIL;
const PREV_PHONE = process.env.ADMIN_PHONE;

afterEach(() => {
  if (PREV_NAMES === undefined) delete process.env.ADMIN_NAMES;
  else process.env.ADMIN_NAMES = PREV_NAMES;
  if (PREV_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = PREV_EMAILS;
  if (PREV_EMAIL === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = PREV_EMAIL;
  if (PREV_PHONE === undefined) delete process.env.ADMIN_PHONE;
  else process.env.ADMIN_PHONE = PREV_PHONE;
});

describe("Stage 16 admin elevation (S16-001)", () => {
  it("does not elevate a random Google first name Arnas by default", () => {
    delete process.env.ADMIN_NAMES;
    assert.equal(isAllowlistedAdminName("Arnas"), false);
    assert.equal(
      shouldElevateToSuperAdmin({
        name: "Arnas Bond",
        firstName: "Arnas",
        email: "buyer@example.com",
        phone: "+37060000001",
        metaRole: "private",
      }),
      false
    );
  });

  it("still elevates explicit ADMIN_EMAIL allowlist", () => {
    process.env.ADMIN_EMAIL = "ops@vauto.lt";
    assert.equal(
      shouldElevateToSuperAdmin({
        email: "ops@vauto.lt",
        name: "Buyer",
        metaRole: "private",
      }),
      true
    );
  });

  it("elevates names only when ADMIN_NAMES is explicitly set", () => {
    process.env.ADMIN_NAMES = "arnas";
    assert.equal(isAllowlistedAdminName("Arnas"), true);
    assert.equal(
      shouldElevateToSuperAdmin({
        firstName: "Arnas",
        email: "buyer@example.com",
      }),
      true
    );
  });
});
