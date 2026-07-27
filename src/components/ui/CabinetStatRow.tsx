export type CabinetStat = {
  label: string;
  value: string;
};

type CabinetStatRowProps = {
  stats: CabinetStat[];
  className?: string;
};

/** Business cabinet KPI strip — data via props only. */
export function CabinetStatRow({ stats, className = "" }: CabinetStatRowProps) {
  return (
    <div className={`grid gap-4 sm:grid-cols-3 ${className}`}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-[var(--vauto-border-subtle)] bg-white p-5 shadow-[0_1px_0_rgba(11,18,32,0.04)]"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--vauto-subtle)]">
            {stat.label}
          </p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--vauto-ink)]">
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}
