"use client";

import { Eye, Heart, MessageCircle, Phone } from "lucide-react";

interface CallAndSellWidgetProps {
  views: number;
  callClicks: number;
  saves: number;
  chatStarts: number;
}

export function CallAndSellWidget({
  views,
  callClicks,
  saves,
  chatStarts,
}: CallAndSellWidgetProps) {
  const stats = [
    { label: "Peržiūros", value: views, icon: Eye, color: "text-sky-400" },
    { label: "Skambučiai", value: callClicks, icon: Phone, color: "text-[var(--vauto-orange)]" },
    { label: "Išsaugota", value: saves, icon: Heart, color: "text-[var(--vauto-red)]" },
    { label: "Pokalbiai", value: chatStarts, icon: MessageCircle, color: "text-[var(--flux-teal)]" },
  ];

  return (
    <div className="vauto-dashboard-card mb-4 rounded-2xl border border-[var(--vauto-orange)]/20 p-4">
      <div className="mb-3">
        <h3 className="font-display text-sm font-bold text-white">
          Paskambink ir parduok
        </h3>
        <p className="mt-0.5 text-[10px] text-slate-500">
          Statistika atnaujinama realiu laiku
        </p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl bg-white/5 p-2.5 text-center"
          >
            <s.icon className={`mx-auto mb-1 h-3.5 w-3.5 ${s.color}`} />
            <p className="text-base font-bold text-white">{s.value}</p>
            <p className="text-[9px] text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
