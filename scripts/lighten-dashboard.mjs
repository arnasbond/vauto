import fs from "node:fs";
import path from "node:path";

const targets = [
  "src/components/admin",
  "src/components/privacy/PrivacySettingsCard.tsx",
  "src/components/status/ConnectionStatusCard.tsx",
  "src/components/voice/WakeWordSettingsCard.tsx",
  "src/components/social/SocialSyncSettingsCard.tsx",
  "src/components/support/UserSupportInbox.tsx",
  "src/components/trust/SellerTrustCard.tsx",
];

const skip = new Set(["GdprConsentModal.tsx", "EditListingModal.tsx", "SmartPromoteModal.tsx"]);
const keepWhite =
  /(bg-\[var\(--vauto|bg-\[#|bg-emerald|bg-green|bg-red|bg-amber|bg-slate-500|bg-black|fixed inset-0)/;

function lightenFile(fp) {
  let c = fs.readFileSync(fp, "utf8");
  c = c.replace(/bg-\[#0b1220\][^\s"]*/g, "bg-white");
  c = c.replace(/bg-white\/5/g, "bg-slate-50");
  c = c.replace(/bg-white\/10/g, "bg-slate-100");
  c = c.replace(/border-white\/10/g, "border-slate-200");
  c = c.replace(/border-white\/15/g, "border-slate-200");
  c = c.replace(/bg-black\/20/g, "bg-white");
  c = c.replace(/text-slate-300/g, "text-slate-600");
  c = c.replace(/text-slate-200/g, "text-slate-700");
  c = c.split("\n").map((line) => {
    if (line.includes("text-white") && !keepWhite.test(line)) {
      return line.replace(/\btext-white\b/g, "text-slate-900");
    }
    return line;
  }).join("\n");
  fs.writeFileSync(fp, c);
  console.log("updated", fp);
}

for (const target of targets) {
  if (target.endsWith(".tsx")) {
    if (!skip.has(path.basename(target))) lightenFile(target);
    continue;
  }
  for (const file of fs.readdirSync(target)) {
    if (!file.endsWith(".tsx") || skip.has(file)) continue;
    lightenFile(path.join(target, file));
  }
}
