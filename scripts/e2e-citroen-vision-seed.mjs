/**
 * Background E2E: send real Citroën PNGs (tech pasas + cars) as data URLs to
 * Render /api/vauto-agent for Vision OCR — no Cloudinary, no CDP.
 * Writes public/e2e-citroen/prepublish-seed.json for UI PrePublish display.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const API = process.env.NEXT_PUBLIC_API_URL || "https://vauto-api.onrender.com";
const PHONE = process.env.E2E_PHONE || "+37060000002";
const OTP = process.env.E2E_OTP || "123456";
const PHOTO_DIR = path.join(ROOT, "public", "e2e-citroen");
const OUT_SEED = path.join(ROOT, "public", "e2e-citroen", "prepublish-seed.json");
const OUT_LOG = path.join(ROOT, "tmp", "e2e-citroen-run", "vision-run.json");

const FILES = [
  "c1.png", // tech pasas
  "c2.png",
  "c5.png",
  "c6.png",
  "c7.png",
  "c8.png",
  "c9.png",
];

const MESSAGE =
  "Naujas skelbimas: parduodu Citroën C4 Picasso, 2.0 HDi, 2007 m., 7 vietų, Prienai. Kaina 2250€.";

function log(...args) {
  console.log("[e2e-vision]", ...args);
}

function fileToDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function extractDraft(agentBody) {
  let draft =
    agentBody?.actions?.draft ||
    agentBody?.actions?.listingDraft ||
    agentBody?.listingDraft ||
    agentBody?.draft ||
    null;

  const toolCalls = agentBody?.toolCalls || [];
  for (const t of toolCalls) {
    if (t?.result?.draft) draft = t.result.draft;
    if (t?.result?.result?.draft) draft = t.result.result.draft;
    if (t?.name === "scanListingPhotos" && t?.result?.draft) draft = t.result.draft;
  }

  if (agentBody?.actions?.type === "listing_draft" && agentBody.actions.draft) {
    draft = agentBody.actions.draft;
  }
  return draft;
}

async function main() {
  fs.mkdirSync(path.dirname(OUT_LOG), { recursive: true });

  log("OTP…");
  await fetch(`${API}/api/auth/otp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: PHONE }),
  });
  const ver = await fetch(`${API}/api/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: PHONE, code: OTP }),
  });
  const auth = await ver.json();
  const token = auth.accessToken || auth.token;
  if (!ver.ok || !token) throw new Error(`auth failed: ${JSON.stringify(auth)}`);
  log("authed", auth.user?.id);

  const pendingImageUrls = [];
  const uploadedMeta = [];
  for (const name of FILES) {
    const filePath = path.join(PHOTO_DIR, name);
    if (!fs.existsSync(filePath)) throw new Error(`missing ${filePath}`);
    const dataUrl = fileToDataUrl(filePath);
    pendingImageUrls.push(dataUrl);
    uploadedMeta.push({ name, bytes: fs.statSync(filePath).size, kind: name === "c1.png" ? "tech_pasas" : "car" });
    log("loaded", name, fs.statSync(filePath).size);
  }

  log("POST /api/vauto-agent with", pendingImageUrls.length, "images (Vision)…");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240_000);

  let agentRes;
  let agentBody;
  try {
    agentRes = await fetch(`${API}/api/vauto-agent`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        messages: [{ role: "user", text: MESSAGE }],
        context: {
          pendingImageUrls,
          userCity: "Prienai",
          contact: PHONE,
          userName: auth.user?.name || "E2E",
          listingDraft: {
            title: "Citroën C4 Picasso",
            description: "",
            price: 2250,
            location: "Prienai",
            category: "vehicles",
            contact: PHONE,
            listingFlowState: "AWAITING_PHOTOS",
          },
        },
      }),
    });
    agentBody = await agentRes.json().catch(() => ({}));
  } finally {
    clearTimeout(timer);
  }

  fs.writeFileSync(
    OUT_LOG,
    JSON.stringify(
      {
        status: agentRes?.status,
        reply: agentBody?.reply,
        actionsType: agentBody?.actions?.type,
        toolNames: (agentBody?.toolCalls || []).map((t) => t.name),
        uploadedMeta,
      },
      null,
      2
    )
  );

  if (!agentRes?.ok) {
    throw new Error(`agent HTTP ${agentRes?.status}: ${JSON.stringify(agentBody).slice(0, 800)}`);
  }

  const draft = extractDraft(agentBody);
  // Keep absolute https cover if present; else first non-tech data URL index 1+
  let ordered =
    (draft?.orderedImageUrls || []).filter(Boolean).length > 0
      ? draft.orderedImageUrls.filter(Boolean)
      : pendingImageUrls.slice(1); // drop tech pasas from public gallery fallback

  // Never keep tech pasas (c1 / first upload) as cover when we know index 0 was c1
  const techPasasData = pendingImageUrls[0];
  ordered = ordered.filter((u) => u !== techPasasData).slice(0, 6);
  if (!ordered.length) ordered = pendingImageUrls.slice(1, 7);

  const seed = {
    createdAt: new Date().toISOString(),
    reply: agentBody.reply || "",
    quickReplies: agentBody.quickReplies || [],
    uploadedMeta,
    draft: {
      title: draft?.title || "Citroën C4 Picasso, 2250€, Prienai",
      description: draft?.description || agentBody.reply || "",
      price: Number(draft?.price) || 2250,
      location: draft?.location || "Prienai",
      category: draft?.category || "vehicles",
      contact: PHONE,
      attributes: {
        ...(draft?.attributes || {}),
        year: String(draft?.attributes?.year || "2007"),
        seats: String(draft?.attributes?.seats || draft?.attributes?.seating || "7"),
        engine: String(draft?.attributes?.engine || draft?.attributes?.engineSize || "2.0 HDi"),
      },
      orderedImageUrls: ordered,
      listingFlowState: "AWAITING_CONFIRMATION",
    },
    coverUrl: ordered[0] || null,
    techPasasExcluded: true,
  };

  // Seed JSON must stay small for the browser — replace huge data URLs with public paths
  const publicOrdered = FILES.filter((n) => n !== "c1.png")
    .slice(0, 6)
    .map((n) => `/e2e-citroen/${n}`);
  // Prefer exterior c6 as cover when present
  const coverFirst = ["/e2e-citroen/c6.png", ...publicOrdered.filter((u) => u !== "/e2e-citroen/c6.png")];
  seed.draft.orderedImageUrls = coverFirst.slice(0, 6);
  seed.coverUrl = seed.draft.orderedImageUrls[0];
  // Keep Vision text/attrs from API; only swap gallery to public paths for UI
  seed.visionDescription = draft?.description || agentBody.reply || "";
  seed.visionAttributes = draft?.attributes || {};
  seed.draft.description = seed.visionDescription || seed.draft.description;

  fs.writeFileSync(OUT_SEED, JSON.stringify(seed, null, 2));
  log("SEED_OK", OUT_SEED);
  log("title", seed.draft.title);
  log("cover", seed.coverUrl);
  log("descPreview", String(seed.draft.description).slice(0, 240));
  log("attrs", JSON.stringify(seed.draft.attributes).slice(0, 400));
}

main().catch((e) => {
  console.error("[e2e-vision] FAILED", e);
  process.exit(1);
});
