import type { ChatPushPayload } from "@/lib/chat-push";
import { buildChatPushPayload, buildChatDeepLink } from "@/lib/chat-push";
import type { VautoInvoice } from "@/lib/invoices";
import type { JobApplication } from "@/lib/job-applications";
import type { ChatThread, Listing, UserProfile } from "@/lib/types";

export const INVESTOR_DEMO_EMPLOYER_ID = "demo-employer-vauto";

export const INVESTOR_DEMO_PROFILE: UserProfile = {
  id: INVESTOR_DEMO_EMPLOYER_ID,
  name: "UAB Baltijos Technika",
  avatar:
    "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=100&h=100&fit=crop",
  phone: "+370 655 12345",
  city: "Vilnius",
  email: "hr@baltijotechnika.lt",
  role: "pro",
  authProvider: "phone",
  businessType: "general",
  companyName: "UAB Baltijos Technika",
  companyCode: "305112233",
  vatCode: "LT551122334",
  billingPlan: "growth",
  billingModel: "subscription",
  jobListingCredits: 5,
  walletBalance: 120,
  memberSince: new Date(Date.now() - 180 * 86_400_000).toISOString(),
  soldCount: 0,
};

const DEMO_BUYERS = [
  { id: "demo-buyer-1", name: "Giedrė Kazlauskaitė" },
  { id: "demo-buyer-2", name: "Tomas Petraitis" },
  { id: "demo-buyer-3", name: "Mantas Jurgilas" },
];

function demoJobListings(catalog: Listing[]): Listing[] {
  const templates = catalog.filter((l) => l.category === "jobs").slice(0, 2);
  const now = new Date().toISOString();
  if (templates.length >= 2) {
    return templates.map((t, i) => ({
      ...t,
      id: `demo-job-listing-${i + 1}`,
      sellerId: INVESTOR_DEMO_EMPLOYER_ID,
      createdAt: now,
      status: "active" as const,
    }));
  }
  return [
    {
      id: "demo-job-listing-1",
      title: "Senior Frontend inžinierius (React)",
      price: 3200,
      location: "Vilnius",
      distanceKm: 2,
      images: [
        "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=400&h=300&fit=crop",
      ],
      category: "jobs",
      tags: ["darbas", "it"],
      sellerId: INVESTOR_DEMO_EMPLOYER_ID,
      createdAt: now,
      status: "active",
      attributes: { jobType: "Siūlau darbą" },
    },
    {
      id: "demo-job-listing-2",
      title: "Logistikos koordinatorius",
      price: 1800,
      location: "Kaunas",
      distanceKm: 5,
      images: [
        "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=400&h=300&fit=crop",
      ],
      category: "jobs",
      tags: ["darbas", "logistika"],
      sellerId: INVESTOR_DEMO_EMPLOYER_ID,
      createdAt: now,
      status: "active",
      attributes: { jobType: "Siūlau darbą" },
    },
  ];
}

export function buildInvestorDemoApplications(jobListings: Listing[]): JobApplication[] {
  const names = [
    { name: "Giedrė Kazlauskaitė", email: "giedre.k@email.lt" },
    { name: "Tomas Petraitis", email: "tomas.p@email.lt" },
    { name: "Mantas Jurgilas", email: "mantas.j@email.lt" },
  ];
  return names.map((applicant, i) => {
    const listing = jobListings[i % jobListings.length];
    return {
      id: `demo-app-${i + 1}`,
      listingId: listing.id,
      employerId: INVESTOR_DEMO_EMPLOYER_ID,
      applicantName: applicant.name,
      jobTitle: listing.title,
      email: applicant.email,
      cvFileUrl: `https://example.com/cv-${i + 1}.pdf`,
      message: "Domina pozicija — turiu atitinkamą patirtį ir CV pridedu.",
      createdAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
      status: "new" as const,
    };
  });
}

export function buildInvestorDemoInvoices(): VautoInvoice[] {
  const base = new Date();
  const rows = [
    { title: "GROWTH prenumerata", gross: 99, productId: "growth", daysAgo: 2 },
    { title: "TOP Pozicija — Logistikos koordinatorius", gross: 9.99, productId: "top", daysAgo: 8 },
    { title: "PLUS Ženklelis — Frontend inžinierius", gross: 4.99, productId: "plus", daysAgo: 15 },
  ];
  return rows.map((row, i) => {
    const createdAt = new Date(base.getTime() - row.daysAgo * 86_400_000).toISOString();
    const amountNet = Math.round((row.gross / 1.21) * 100) / 100;
    const vatAmount = Math.round((row.gross - amountNet) * 100) / 100;
    return {
      id: `demo-inv-${i + 1}`,
      number: `VAUTO-${base.getFullYear()}-${String(i + 1).padStart(4, "0")}`,
      createdAt,
      userId: INVESTOR_DEMO_EMPLOYER_ID,
      buyerName: INVESTOR_DEMO_PROFILE.companyName!,
      buyerEmail: INVESTOR_DEMO_PROFILE.email,
      buyerCompanyName: INVESTOR_DEMO_PROFILE.companyName,
      buyerCompanyCode: INVESTOR_DEMO_PROFILE.companyCode,
      buyerVatCode: INVESTOR_DEMO_PROFILE.vatCode,
      serviceTitle: row.title,
      amountNet,
      vatRate: 0.21,
      vatAmount,
      amountGross: row.gross,
      paymentMethod: "Swedbank",
      checkoutKind: row.productId === "growth" ? "b2b_subscription" : "b2c_promote",
      productId: row.productId,
    };
  });
}

export function buildInvestorDemoChats(
  catalog: Listing[],
  jobListings: Listing[]
): ChatThread[] {
  const vehicle =
    catalog.find((l) => l.category === "vehicles" && l.images?.length) ??
    catalog.find((l) => l.images?.length) ??
    jobListings[0];
  const job = jobListings[0];
  const now = Date.now();

  const threads: ChatThread[] = [
    {
      id: "demo-chat-vehicle",
      listingId: vehicle.id,
      listingTitle: vehicle.title,
      buyerId: DEMO_BUYERS[0].id,
      sellerId: INVESTOR_DEMO_EMPLOYER_ID,
      escrowOffered: false,
      messages: [
        {
          id: "dm1",
          senderId: DEMO_BUYERS[0].id,
          text: "Labas! Ar automobilis dar parduodamas? Domina apžiūra šiandien.",
          timestamp: new Date(now - 8 * 60_000).toISOString(),
          status: "read",
          readAt: new Date(now - 7 * 60_000).toISOString(),
        },
        {
          id: "dm2",
          senderId: INVESTOR_DEMO_EMPLOYER_ID,
          text: "Sveiki! Taip, aktualu. Galime susitikti 17:00 prie salonų.",
          timestamp: new Date(now - 6 * 60_000).toISOString(),
          status: "read",
          deliveredAt: new Date(now - 6 * 60_000).toISOString(),
          readAt: new Date(now - 5 * 60_000).toISOString(),
        },
        {
          id: "dm3",
          senderId: DEMO_BUYERS[0].id,
          text: "Puiku, tinka! Ar galima derėtis dėl kainos?",
          timestamp: new Date(now - 90_000).toISOString(),
          status: "delivered",
          deliveredAt: new Date(now - 60_000).toISOString(),
        },
      ],
    },
    {
      id: "demo-chat-job",
      listingId: job.id,
      listingTitle: job.title,
      buyerId: DEMO_BUYERS[1].id,
      sellerId: INVESTOR_DEMO_EMPLOYER_ID,
      escrowOffered: false,
      messages: [
        {
          id: "jm1",
          senderId: DEMO_BUYERS[1].id,
          text: "Sveiki, ką tik išsiunčiau CV į jūsų skelbimą. Ar galime aptarti atlyginimą?",
          timestamp: new Date(now - 4 * 60_000).toISOString(),
          status: "delivered",
          deliveredAt: new Date(now - 3 * 60_000).toISOString(),
        },
      ],
    },
    {
      id: "demo-chat-cv",
      listingId: jobListings[1]?.id ?? job.id,
      listingTitle: jobListings[1]?.title ?? job.title,
      buyerId: DEMO_BUYERS[2].id,
      sellerId: INVESTOR_DEMO_EMPLOYER_ID,
      escrowOffered: false,
      messages: [
        {
          id: "cm1",
          senderId: DEMO_BUYERS[2].id,
          text: "Labas! Prisegu CV — turiu 4 m. logistikos patirties. Ar aktualu?",
          timestamp: new Date(now - 45_000).toISOString(),
          status: "sent",
        },
      ],
    },
  ];

  return threads;
}

export function buildInvestorDemoPushPayloads(
  chats: ChatThread[],
  catalog: Listing[]
): ChatPushPayload[] {
  return chats
    .map((chat) => {
      const last = chat.messages[chat.messages.length - 1];
      if (!last || last.senderId === INVESTOR_DEMO_EMPLOYER_ID) return null;
      const listing = catalog.find((l) => l.id === chat.listingId);
      const buyer = DEMO_BUYERS.find((b) => b.id === last.senderId);
      return buildChatPushPayload({
        chat,
        listing,
        sender: { name: buyer?.name ?? "Kandidatas", companyName: undefined },
        messageText: last.text,
      });
    })
    .filter((p): p is ChatPushPayload => Boolean(p));
}

export interface InvestorDemoBundle {
  profile: UserProfile;
  jobListings: Listing[];
  chats: ChatThread[];
  invoices: VautoInvoice[];
  applications: JobApplication[];
  pushPayloads: ChatPushPayload[];
  deepLink: string;
}

export function buildInvestorDemoBundle(catalog: Listing[]): InvestorDemoBundle {
  const jobListings = demoJobListings(catalog);
  const chats = buildInvestorDemoChats(catalog, jobListings);
  const allCatalog = [...jobListings, ...catalog];
  return {
    profile: INVESTOR_DEMO_PROFILE,
    jobListings,
    chats,
    invoices: buildInvestorDemoInvoices(),
    applications: buildInvestorDemoApplications(jobListings),
    pushPayloads: buildInvestorDemoPushPayloads(chats, allCatalog),
    deepLink: buildChatDeepLink(chats[0]?.id ?? "demo-chat-vehicle"),
  };
}

export function isInvestorDemoEnabled(): boolean {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_INVESTOR_DEMO !== "0";
  }
  return (
    process.env.NEXT_PUBLIC_INVESTOR_DEMO === "1" ||
    process.env.NODE_ENV !== "production" ||
    localStorage.getItem("vauto_investor_demo_unlocked_v1") === "1"
  );
}
