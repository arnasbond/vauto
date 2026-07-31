"use client";

import { cn } from "@/lib/cn";

export interface StatItem {
  label: string;
  value: string;
  hint?: string;
}

interface StatGridProps {
  stats: StatItem[];
  columns?: 2 | 3 | 4;
  className?: string;
}

const COLUMNS: Record<2 | 3 | 4, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

/** Compact KPI tiles — one metric appears in exactly one grid per surface. */
export function StatGrid({ stats, columns = 3, className }: StatGridProps) {
  if (stats.length === 0) return null;

  return (
    <div className={cn("grid gap-2", COLUMNS[columns], className)}>
      {stats.map((stat) => (
        <div key={stat.label} className="vauto-stat">
          <p className="vauto-stat-label">{stat.label}</p>
          <p className="vauto-stat-value">{stat.value}</p>
          {stat.hint ? <p className="vauto-stat-hint">{stat.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
