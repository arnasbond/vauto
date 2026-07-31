"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  shortLabel?: string;
  icon?: ReactNode;
  badge?: number;
}

interface SegmentedTabsProps<T extends string> {
  items: readonly SegmentedTabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  className?: string;
}

/** Single tab treatment for every VAUTO dashboard surface. */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedTabsProps<T>) {
  return (
    <div className={cn("-mx-1 overflow-x-auto px-1 scrollbar-hide", className)}>
      <div className="vauto-segmented" role="tablist" aria-label={ariaLabel}>
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.id)}
              className={cn(
                "vauto-segmented-btn",
                active && "vauto-segmented-btn--active"
              )}
            >
              {item.icon ? <span aria-hidden>{item.icon}</span> : null}
              {item.shortLabel ? (
                <>
                  <span className="sm:hidden">{item.shortLabel}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </>
              ) : (
                item.label
              )}
              {item.badge && item.badge > 0 ? (
                <span className="vauto-segmented-badge">{item.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
