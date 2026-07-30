/**
 * Offline M3 checks: b2bTrustBoost + seller analytics merge + ROI.
 *   node scripts/test-m3-b2b-analytics.mjs
 */
import assert from "node:assert/strict";

const B2B_ATTR_PRO = "_b2bPro";
const B2B_ATTR_BUSINESS = "_b2bBusiness";
const B2B_ATTR_VERIFIED = "_b2bVerified";

function computeLogisticsReadyBoost(listing) {
  if (listing.allowPastomatas === true) return 0.06;
  const fits = String(listing.attributes?.fitsOmnivaLocker ?? "")
    .trim()
    .toLowerCase();
  if (fits === "true" || fits === "1" || fits === "yes") return 0.05;
  return 0;
}

function attrFlag(attributes, key) {
  const raw = attributes?.[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function computeB2bTrustBoost(listing, seller) {
  if (computeLogisticsReadyBoost(listing) <= 0) return 0;
  const isPro =
    seller?.role === "pro" ||
    attrFlag(listing.attributes, B2B_ATTR_PRO) ||
    listing.providerVerified === true;
  const isBusiness =
    seller?.profileType === "business" ||
    attrFlag(listing.attributes, B2B_ATTR_BUSINESS) ||
    listing.providerVerified === true;
  if (!isPro && !isBusiness) return 0;
  const verified =
    String(seller?.companyCode ?? "").trim().length >= 5 ||
    attrFlag(listing.attributes, B2B_ATTR_VERIFIED) ||
    listing.isVerified === true ||
    listing.providerVerified === true;
  if (isPro && (isBusiness || verified)) return verified ? 0.05 : 0.04;
  if (isBusiness && verified) return 0.035;
  return 0;
}

function stampB2bSellerAttributes(attributes, seller) {
  const next = { ...(attributes ?? {}) };
  if (!seller) return next;
  if (seller.role === "pro") next[B2B_ATTR_PRO] = "true";
  else delete next[B2B_ATTR_PRO];
  if (seller.profileType === "business") next[B2B_ATTR_BUSINESS] = "true";
  else delete next[B2B_ATTR_BUSINESS];
  if (String(seller.companyCode ?? "").trim().length >= 5) {
    next[B2B_ATTR_VERIFIED] = "true";
  } else delete next[B2B_ATTR_VERIFIED];
  return next;
}

function mergeSellerAnalytics(local, remote) {
  if (!remote || remote.source !== "server") {
    const contacts = local.callClicks + local.chatStarts;
    return {
      views: local.views,
      contacts,
      callClicks: local.callClicks,
      chatStarts: local.chatStarts,
      shareStory: 0,
      saves: local.saves,
      interestScore: local.interestScore,
      promoteSpendEur: 0,
      costPerContact: null,
      source: "local",
    };
  }
  const views = remote.views;
  const callClicks = remote.callClicks;
  const chatStarts = remote.chatStarts;
  const contacts =
    remote.contacts > 0 ? remote.contacts : callClicks + chatStarts;
  const saves = Math.max(remote.saves, local.saves);
  const promoteSpendEur = remote.promoteSpendEur;
  const costPerContact =
    contacts > 0 && promoteSpendEur > 0
      ? Math.round((promoteSpendEur / contacts) * 100) / 100
      : null;
  return {
    views,
    contacts,
    callClicks,
    chatStarts,
    shareStory: remote.shareStory,
    saves,
    interestScore:
      views > 0
        ? Math.min(99, Math.round((contacts / views) * 100 * 3 + saves * 2))
        : 0,
    promoteSpendEur,
    costPerContact,
    source: "server",
  };
}

// --- b2bTrustBoost ---
assert.equal(
  computeB2bTrustBoost({ allowPastomatas: true, attributes: {} }, null),
  0,
  "no pro → 0"
);
assert.equal(
  computeB2bTrustBoost(
    { allowPastomatas: false, attributes: {} },
    { role: "pro", profileType: "business", companyCode: "123456789" }
  ),
  0,
  "no logistics → 0"
);
assert.equal(
  computeB2bTrustBoost(
    { allowPastomatas: true, attributes: {} },
    { role: "pro", profileType: "business", companyCode: "123456789" }
  ),
  0.05,
  "verified pro + logistics"
);
assert.equal(
  computeB2bTrustBoost(
    {
      allowPastomatas: true,
      attributes: stampB2bSellerAttributes(
        {},
        { role: "pro", profileType: "business", companyCode: "300000000" }
      ),
    },
    null
  ),
  0.05,
  "stamped attrs without seller map"
);

// --- analytics merge + ROI ---
const merged = mergeSellerAnalytics(
  { views: 10, callClicks: 1, chatStarts: 0, saves: 2, interestScore: 5 },
  {
    views: 120,
    contacts: 18,
    callClicks: 12,
    chatStarts: 6,
    shareStory: 9,
    saves: 0,
    interestScore: 40,
    promoteSpendEur: 36,
    costPerContact: 2,
    source: "server",
  }
);
assert.equal(merged.source, "server");
assert.equal(merged.views, 120);
assert.equal(merged.shareStory, 9);
assert.equal(merged.saves, 2, "keep local saves");
assert.equal(merged.costPerContact, 2);
assert.ok(merged.interestScore > 0);

const localOnly = mergeSellerAnalytics(
  { views: 5, callClicks: 1, chatStarts: 1, saves: 0, interestScore: 10 },
  null
);
assert.equal(localOnly.source, "local");
assert.equal(localOnly.contacts, 2);
assert.equal(localOnly.shareStory, 0);

console.log("✔ M3 B2B analytics checks passed");
