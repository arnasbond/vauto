"use client";

import { Calendar, Clock } from "lucide-react";
import type { ServiceBooking } from "@/lib/types";

export function ServiceCalendar({ bookings }: { bookings: ServiceBooking[] }) {
  const grouped = bookings.reduce<Record<string, ServiceBooking[]>>((acc, b) => {
    (acc[b.date] ??= []).push(b);
    return acc;
  }, {});

  return (
    <div className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[var(--vauto-orange)]" />
          <h3 className="text-sm font-semibold text-slate-900">Artimiausi užsakymai</h3>
        </div>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase text-amber-300">
          Demo
        </span>
      </div>
      <div className="space-y-3">
        {Object.entries(grouped).map(([date, items]) => (
          <div key={date}>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {new Date(date).toLocaleDateString("lt-LT", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </p>
            {items.map((b) => (
              <div
                key={b.id}
                className="mb-1.5 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--vauto-orange)]/15">
                  <Clock className="h-3.5 w-3.5 text-[var(--vauto-orange)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {b.clientName}
                  </p>
                  <p className="truncate text-xs text-slate-400">{b.service}</p>
                </div>
                <span className="shrink-0 font-mono text-xs text-[var(--vauto-teal)]">
                  {b.time}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
