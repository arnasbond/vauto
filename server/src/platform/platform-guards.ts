import type { Response } from "express";
import {
  getCheckoutDisabledFlag,
  getPlatformFlags,
  PLATFORM_CHECKOUT_DISABLED_MESSAGE,
  PLATFORM_LISTINGS_DISABLED_MESSAGE,
  PLATFORM_MAINTENANCE_MESSAGE,
  type PlatformFlags,
} from "./platform-settings.js";

export async function loadPlatformFlags(): Promise<PlatformFlags> {
  return getPlatformFlags();
}

/** Block listing create when maintenance or disableNewListings. */
export async function rejectIfListingsDisabled(
  res: Response
): Promise<boolean> {
  const flags = await getPlatformFlags();
  if (flags.maintenanceMode) {
    res.status(503).json({ error: PLATFORM_MAINTENANCE_MESSAGE, code: "maintenance" });
    return true;
  }
  if (flags.disableNewListings) {
    res.status(503).json({
      error: PLATFORM_LISTINGS_DISABLED_MESSAGE,
      code: "listings_disabled",
    });
    return true;
  }
  return false;
}

/** Block checkout when maintenance or disableCheckout. */
export async function rejectIfCheckoutDisabled(
  res: Response
): Promise<boolean> {
  // Financial kill-switch FAILS CLOSED: block money when the checkout safety
  // state is explicitly disabled OR cannot be reliably read. Only a KNOWN
  // `false` allows money initiation to proceed. Maintenance stays fail-open so
  // a platform_settings read failure can never take down the whole platform,
  // only the money surface.
  const checkout = await getCheckoutDisabledFlag();
  if (checkout !== false) {
    res.status(503).json({
      error: PLATFORM_CHECKOUT_DISABLED_MESSAGE,
      code: "checkout_disabled",
    });
    return true;
  }

  const flags = await getPlatformFlags();
  if (flags.maintenanceMode) {
    res.status(503).json({ error: PLATFORM_MAINTENANCE_MESSAGE, code: "maintenance" });
    return true;
  }
  return false;
}
