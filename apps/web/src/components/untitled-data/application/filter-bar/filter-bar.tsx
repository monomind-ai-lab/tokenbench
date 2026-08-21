"use client";

import { FilterFunnel01, XClose } from "@untitledui/icons";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Adapted from Untitled UI's Filter Bar, without its global token layer. */
export function DataFilterBar({
  actions,
  children,
  className,
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function DataFilterTag({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border bg-muted px-2 text-xs font-medium">
      <FilterFunnel01 aria-hidden="true" className="size-3.5 text-brand-secondary" />
      {label}
      <button aria-label={`Remove ${label} filter`} className="-mr-1 grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground" onClick={onClear} type="button">
        <XClose aria-hidden="true" className="size-3.5" />
      </button>
    </span>
  );
}
