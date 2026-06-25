import { Suspense } from "react";
import { INITIAL_LISTINGS } from "@/data/mockListings";
import { uniqueSellerIds } from "@/lib/seller-display";
import SellerIdClient from "./SellerIdClient";

export function generateStaticParams() {
  return uniqueSellerIds(INITIAL_LISTINGS).map((id) => ({ id }));
}

export default async function SellerIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <p className="py-12 text-center text-slate-500">Kraunama...</p>
      }
    >
      <SellerIdClient sellerId={id} />
    </Suspense>
  );
}
