import type { Response } from "express";
import {
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
  const flags = await getPlatformFlags();
  if (flags.maintenanceMode) {
    res.status(503).json({ error: PLATFORM_MAINTENANCE_MESSAGE, code: "maintenance" });
    return true;
  }
  if (flags.disableCheckout) {
    res.status(503).json({
      error: PLATFORM_CHECKOUT_DISABLED_MESSAGE,
      code: "checkout_disabled",
    });
    return true;
  }
  return false;
}
