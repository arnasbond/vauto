/** Zero-UI views controlled by Gemini via navigate_view. */
export const APP_VIEWS = [
  "home",
  "discover",
  "search_results",
  "add_listing",
  "seller_wizard",
  "chats",
  "profile",
  "admin_ai",
] as const;

export type AppView = (typeof APP_VIEWS)[number];

export type ViewParams = Record<string, string>;

export const APP_VIEW_LABELS: Record<AppView, string> = {
  home: "Pradžia",
  discover: "Atrasti",
  search_results: "Paieškos rezultatai",
  add_listing: "Įdėti skelbimą",
  seller_wizard: "Pardavėjo vedlys",
  chats: "Pokalbiai",
  profile: "Mano VAUTO",
  admin_ai: "Admin AI",
};

export function isAppView(value: string): value is AppView {
  return (APP_VIEWS as readonly string[]).includes(value);
}

/** Map static-export pathname → default view (no query heuristics). */
export function pathToView(pathname: string): AppView {
  const p = pathname.replace(/\/$/, "") || "/";
  if (p === "/") return "home";
  if (p === "/discover") return "discover";
  if (p === "/add") return "add_listing";
  if (p.startsWith("/chats")) return "chats";
  if (p === "/profile") return "profile";
  if (p.startsWith("/admin/ai")) return "admin_ai";
  return "home";
}

export function viewToPath(view: AppView): string {
  switch (view) {
    case "home":
      return "/";
    case "discover":
    case "search_results":
      return "/discover/";
    case "add_listing":
    case "seller_wizard":
      return "/add/";
    case "chats":
      return "/chats/";
    case "profile":
      return "/profile/";
    case "admin_ai":
      return "/admin/ai/";
    default:
      return "/";
  }
}
