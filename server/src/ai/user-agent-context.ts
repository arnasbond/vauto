import { getListings, getUser } from "../repository.js";
import type { ApiListing, ApiUser } from "../types.js";

export interface MyListingForAgent {
  id: string;
  title: string;
  price: number;
  category: string;
  location: string;
  status: string;
}

export interface UserAgentContextPayload {
  userName: string;
  accountType: string;
  userCity: string;
  contact: string;
  userRole: "buyer" | "seller" | "business" | "admin";
  isAuthenticated: boolean;
  myListings: MyListingForAgent[];
  myListingsSummary: string;
}

export function resolveAccountTypeLabel(user: Pick<ApiUser, "role" | "businessType">): string {
  if (user.role === "super_admin" || user.role === "admin") return "Administratorius";
  if (user.role === "pro") {
    if (user.businessType === "dealer") return "Verslas · Auto salonas";
    if (user.businessType === "services") return "Verslas · Paslaugos";
    return "Verslas · Pro";
  }
  return "Privatus pardavėjas";
}

export function resolveAgentRole(user: Pick<ApiUser, "role">): UserAgentContextPayload["userRole"] {
  if (user.role === "super_admin" || user.role === "admin") return "admin";
  if (user.role === "pro") return "business";
  return "buyer";
}

function listingStatusLabel(status: string | undefined): string {
  if (status === "sold") return "parduotas";
  if (status === "active") return "aktyvus";
  return status ?? "aktyvus";
}

export function summarizeMyListings(listings: MyListingForAgent[], firstName: string): string {
  const active = listings.filter((l) => l.status !== "sold");
  const sold = listings.filter((l) => l.status === "sold");

  if (!listings.length) {
    return `${firstName} neturi skelbimų — gali pasiūlyti naują skelbimą ar paiešką.`;
  }
  if (active.length === 1) {
    const l = active[0]!;
    return `Turi 1 aktyvų skelbimą: „${l.title}" (${l.location}, ${l.price}€).`;
  }
  if (active.length > 1) {
    const sample = active
      .slice(0, 3)
      .map((l) => `„${l.title}" (${l.location})`)
      .join("; ");
    return `Turi ${active.length} aktyvius skelbimus: ${sample}.`;
  }
  if (sold.length) {
    return `Aktyvių skelbimų nėra; ${sold.length} archyvuota (-i).`;
  }
  return `${firstName} skelbimų sąrašas tuščias.`;
}

export function buildUserContextInjectionBlock(payload: UserAgentContextPayload): string {
  const firstName = payload.userName.split(/\s+/)[0] || payload.userName;
  const lines = [
    "[Vartotojo profilis — gyvi duomenys, privaloma naudoti]",
    `Vardas: ${payload.userName} (kreipkis: ${firstName})`,
    `Paskyra: ${payload.accountType}`,
    `Miestas: ${payload.userCity}`,
    `Prisijungęs: ${payload.isAuthenticated ? "taip" : "ne"}`,
    `Mano skelbimai: ${payload.myListingsSummary}`,
  ];

  if (payload.myListings.length) {
    const detail = payload.myListings
      .slice(0, 12)
      .map(
        (l) =>
          `- id=${l.id} | ${listingStatusLabel(l.status)} | ${l.title} | ${l.location} | ${l.price}€ | ${l.category}`
      )
      .join("\n");
    lines.push(`Detalus sąrašas:\n${detail}`);
  }

  lines.push(
    `Asmeninio sveikinimo pavyzdys (pritaikyk): „Labas, ${firstName}! ${payload.myListingsSummary.replace(firstName + " ", "")} Nori papildyti nuotraukas, pakoreguoti kainą, ar kelti naują skelbimą?"`
  );

  return lines.join("\n");
}

function mapListing(l: ApiListing): MyListingForAgent {
  return {
    id: l.id,
    title: l.title,
    price: l.price,
    category: l.category,
    location: l.location,
    status: l.status ?? "active",
  };
}

export async function resolveAuthenticatedAgentContext(
  authUserId: string | undefined,
  clientFallback?: Partial<UserAgentContextPayload>
): Promise<UserAgentContextPayload> {
  if (!authUserId) {
    const name = clientFallback?.userName?.trim() || "Svečias";
    const firstName = name.split(/\s+/)[0] || name;
    const myListings = clientFallback?.myListings ?? [];
    return {
      userName: name,
      accountType: clientFallback?.accountType ?? "Svečias",
      userCity: clientFallback?.userCity ?? "Lietuva",
      contact: clientFallback?.contact ?? "+370 612 34567",
      userRole: clientFallback?.userRole ?? "buyer",
      isAuthenticated: Boolean(clientFallback?.isAuthenticated),
      myListings,
      myListingsSummary:
        clientFallback?.myListingsSummary ??
        summarizeMyListings(myListings, firstName),
    };
  }

  const user = await getUser(authUserId);
  if (!user) {
    return resolveAuthenticatedAgentContext(undefined, clientFallback);
  }

  let myListings: MyListingForAgent[] = [];
  try {
    const rows = await getListings();
    myListings = rows
      .filter((l) => l.sellerId === authUserId && !l.banned)
      .map(mapListing);
  } catch {
    myListings = clientFallback?.myListings ?? [];
  }

  const firstName = user.name.split(/\s+/)[0] || user.name;

  return {
    userName: user.name,
    accountType: resolveAccountTypeLabel(user),
    userCity: user.city || clientFallback?.userCity || "Lietuva",
    contact: user.phone || clientFallback?.contact || "+370 612 34567",
    userRole: resolveAgentRole(user),
    isAuthenticated: true,
    myListings,
    myListingsSummary: summarizeMyListings(myListings, firstName),
  };
}
