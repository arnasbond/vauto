"use client";

import { ExternalLink, Package, QrCode } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import { formatOmnivaParcelPrice } from "@/lib/shipping/omniva-parcel-prices";
import type { ParcelSize } from "@/lib/shipping/shipping-provider";

export function ShippingLabelChatCard({ message }: { message: ChatMessage }) {
  const label = message.shippingLabel;
  if (!label) return null;
  const size = (label.parcelSize ?? "M") as ParcelSize;
  const qr = label.qrPayload || label.trackingCode;

  return (
    <div
      className="mt-2 space-y-2 rounded-xl border border-[var(--vauto-primary)]/25 bg-[var(--vauto-primary)]/6 p-3 not-italic"
      data-shipping-label-card="1"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--vauto-primary)]">
        <Package className="h-3.5 w-3.5" aria-hidden />
        Omniva siuntos lipdukas
        {label.mode === "live" ? (
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">
            LIVE
          </span>
        ) : null}
      </p>
      {label.lockerName ? (
        <p className="text-xs text-[var(--vauto-text)]">
          Paštomatas: <strong>{label.lockerName}</strong>
        </p>
      ) : null}
      <p className="text-xs text-[var(--vauto-text-muted)]">
        Dydis {size} · {formatOmnivaParcelPrice(size)}
      </p>
      <p className="font-mono text-sm font-bold tracking-wide text-[var(--vauto-ink)]">
        {label.trackingCode}
      </p>
      <div className="flex items-start gap-2 rounded-lg bg-[var(--vauto-card-bg)] px-2.5 py-2">
        <QrCode
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vauto-primary)]"
          aria-hidden
        />
        <p className="break-all font-mono text-[11px] text-[var(--vauto-text)]">
          {qr}
        </p>
      </div>
      {label.trackingUrl ? (
        <a
          href={label.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--vauto-primary)] hover:underline"
        >
          Atidaryti Omniva sekimą
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}
