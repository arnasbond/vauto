/** Demo katalogas gamyboje išjungtas pagal nutylėjimą. */
export function isServerDemoCatalogEnabled(): boolean {
  if (process.env.VAUTO_DEMO_CATALOG === "true") return true;
  if (process.env.VAUTO_DEMO_CATALOG === "false") return false;
  return process.env.NODE_ENV !== "production";
}
