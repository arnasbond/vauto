"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Calendar, Package } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SellerRatingBadge } from "@/components/listing/SellerRatingBadge";
import { MarketplaceGridCard } from "@/components/marketplace/MarketplaceListingCards";
import { useVauto } from "@/context/VautoContext";
import {
  sellerActiveListings,
  sellerAvatarUrl,
  sellerDisplayName,
  sellerMemberSince,
} from "@/lib/seller-display";

interface SellerProfilePageProps {
  sellerId?: string;
}

export function SellerProfilePage({ sellerId: sellerIdProp }: SellerProfilePageProps = {}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const idFromQuery = searchParams.get("id") ?? undefined;
  const idFromPath = (() => {
    const m = pathname.match(/\/seller\/([^/]+)\/?$/);
    const segment = m?.[1];
    if (!segment || segment === "seller") return undefined;
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  })();
  const sellerId = sellerIdProp ?? idFromQuery ?? idFromPath;

  const { listings, reviews } = useVauto();

  if (!sellerId) {
    return (
      <AppShell variant="plain" hideNav>
        <div className="px-4 py-12 text-center text-slate-500">Pardavėjas nerastas.</div>
      </AppShell>
    );
  }

  const active = sellerActiveListings(listings, sellerId);
  const name = sellerDisplayName(sellerId);
  const memberSince = sellerMemberSince(listings, sellerId);

  return (
    <AppShell variant="plain" hideNav>
      <div className="px-4 pb-10 pt-2">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--vauto-teal)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Atgal į paiešką
        </Link>

        <header className="vauto-glass-card rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <Image
              src={sellerAvatarUrl(sellerId)}
              alt=""
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white shadow"
            />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl font-bold text-slate-900">{name}</h1>
              {memberSince && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  Narys nuo {memberSince}
                </p>
              )}
              <SellerRatingBadge
                sellerId={sellerId}
                reviews={reviews}
              />
              <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-600">
                <Package className="h-4 w-4 shrink-0 text-slate-400" />
                {active.length} aktyvūs skelbim{active.length === 1 ? "as" : "ai"}
              </p>
            </div>
          </div>
        </header>

        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Aktyvūs skelbimai
          </h2>
          {active.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              Šiuo metu nėra aktyvių skelbimų.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {active.map((listing) => (
                <MarketplaceGridCard
                  key={listing.id}
                  listing={listing}
                  priceColor="#1167b1"
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
