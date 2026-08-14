import { Suspense } from "react";
import { DealRoomPage } from "@/components/deal-room/DealRoomPage";

export default function SandoriaiRoute() {
  return (
    <Suspense
      fallback={
        <p className="py-12 text-center text-sm text-slate-500">Kraunama…</p>
      }
    >
      <DealRoomPage />
    </Suspense>
  );
}
