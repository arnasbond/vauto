"use client";

import { SellerProfilePage } from "@/components/SellerProfilePage";

export default function SellerIdClient({ sellerId }: { sellerId: string }) {
  return <SellerProfilePage sellerId={sellerId} />;
}
