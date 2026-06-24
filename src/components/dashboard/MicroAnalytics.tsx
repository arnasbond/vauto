"use client";

import { BarChart3, Eye, MessageCircle, MousePointerClick, Phone, Heart } from "lucide-react";

interface MicroAnalyticsProps {
  views: number;
  callClicks: number;
  chatStarts: number;
  saves: number;
  interestScore: number;
}

export function MicroAnalytics({
  views,
  callClicks,
  chatStarts,
  saves,
  interestScore,
}: MicroAnalyticsProps) {
  const stats = [
    { label: "Peržiūros", value: views, icon: Eye, color: "text-sky-400" },
    { label: "Skambučiai", value: callClicks, icon: Phone, color: "text-emerald-400" },
    { label: "Pokalbiai", value: chatStarts, icon: MessageCircle, color: "text-[var(--vauto-teal)]" },
    { label: "Išsaugota", value: saves, icon: Heart, color: "text-[var(--vauto-red)]" },
  ];

  return (
    <div className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-[var(--vauto-teal)]" />
        <h3 className="text-sm font-semibold text-slate-900">Skelbimų statistika</h3>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-500">
          <MousePointerClick className="h-3 w-3" />
          Domėjimasis {interestScore}%
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl bg-slate-50 p-2.5 text-center"
          >
            <s.icon className={`mx-auto mb-1 h-3.5 w-3.5 ${s.color}`} />
            <p className="text-base font-bold text-slate-900">{s.value}</p>
            <p className="text-[9px] text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
