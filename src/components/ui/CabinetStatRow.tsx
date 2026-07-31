import { StatGrid, type StatItem } from "@/components/ui/surface";

export type CabinetStat = StatItem;

type CabinetStatRowProps = {
  stats: CabinetStat[];
  className?: string;
};

/** Business cabinet KPI strip — delegates to the shared StatGrid primitive. */
export function CabinetStatRow({ stats, className }: CabinetStatRowProps) {
  return <StatGrid stats={stats} columns={3} className={className} />;
}
