"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Atgal",
  action,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-4", className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--vauto-text-muted)] transition hover:text-[var(--vauto-text-main)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="vauto-page-title">{title}</h1>
          {subtitle ? <p className="vauto-page-subtitle">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
