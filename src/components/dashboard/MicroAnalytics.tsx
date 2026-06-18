"use client";

import { BarChart3, Eye, MousePointerClick, TrendingUp } from "lucide-react";

interface MicroAnalyticsProps {
  views: number;
  clicks: number;
  interestScore: number;
}

export function MicroAnalytics({ views, clicks, interestScore }: MicroAnalyticsProps) {
  const stats = [
    { label: "Peržiūros", value: views, icon: Eye, color: "text-sky-400" },
    { label: "Paspaudimai", value: clicks, icon: MousePointerClick, color: "text-[var(--vauto-teal)]" },
    { label: "Domėjimasis", value: `${interestScore}%`, icon: TrendingUp, color: "text-[var(--vauto-orange)]" },
  ];

  return (
    <div className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-[var(--vauto-teal)]" />
        <h3 className="text-sm font-semibold text-white">Mikro analitika</h3>
        <span className="ml-auto text-[10px] text-slate-500">7 d.</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl bg-white/5 p-3 text-center"
          >
            <s.icon className={`mx-auto mb-1 h-4 w-4 ${s.color}`} />
            <p className="text-lg font-bold text-white">{s.value}</p>
            <p className="text-[10px] text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
