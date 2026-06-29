import cron from "node-cron";
import { runPortalSyncBatch } from "./portal-sync-service.js";

let cronStarted = false;
let batchRunning = false;

/**
 * Kasdien 04:15 UTC tikrina eilę — sinchronizuoja tik nuorodas, kurių next_sync_at praėjo (3 d. ciklas).
 * Viena partija: max 6 vartotojų portalai, 2.5 s tarp užklausų — švelnu nemokamam hostingui.
 */
export function startPortalSyncCron(): void {
  if (cronStarted) return;
  if (process.env.ENABLE_PORTAL_SYNC_CRON === "false") {
    console.log("[portal-sync] Cron disabled via ENABLE_PORTAL_SYNC_CRON=false");
    return;
  }

  cronStarted = true;

  const runSafe = () => {
    if (batchRunning) return;
    batchRunning = true;
    void runPortalSyncBatch({ maxLinks: 6 })
      .then((r) => {
        if (r.processed > 0) {
          console.log(
            `[portal-sync] batch done: processed=${r.processed} updated=${r.updated} skipped=${r.skipped} errors=${r.errors}`
          );
        }
      })
      .catch((e) => {
        console.error("[portal-sync] batch failed:", e);
      })
      .finally(() => {
        batchRunning = false;
      });
  };

  cron.schedule("15 4 * * *", runSafe, { timezone: "Europe/Vilnius" });

  // Pirmas patikrinimas 3 min po starto (staging / deploy)
  setTimeout(runSafe, 3 * 60 * 1000);

  console.log("[portal-sync] Cron scheduled — daily queue check, 3-day sync cycle per link");
}
