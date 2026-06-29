import type { ZeroUiScreen } from "@/lib/zero-ui-screens";

const PENDING_ZERO_UI_KEY = "vauto:pending-zero-ui";

export function persistPendingZeroUiScreen(screen: ZeroUiScreen): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(PENDING_ZERO_UI_KEY, screen);
}

export function consumePendingZeroUiScreen(): ZeroUiScreen | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(PENDING_ZERO_UI_KEY);
  sessionStorage.removeItem(PENDING_ZERO_UI_KEY);
  if (
    raw === "marketplace" ||
    raw === "listing_preview" ||
    raw === "business_dashboard" ||
    raw === "admin_panel"
  ) {
    return raw;
  }
  return null;
}
