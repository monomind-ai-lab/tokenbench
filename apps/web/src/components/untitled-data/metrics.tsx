import type { ReactNode } from "react";

import { DataValueText, type PresentationValue } from "@/components/untitled-data/data-value";
import { cn } from "@/lib/utils";

export type DataMetric = {
  label: string;
  note?: string;
  value: PresentationValue<unknown>;
};

/** Untitled UI stats pattern, scoped to TokenBench's brand and data contract. */
export function DataMetrics({
  className,
  items,
}: {
  className?: string;
  items: readonly DataMetric[];
}): ReactNode {
  const columns =
    items.length >= 5
      ? "grid-cols-2 lg:grid-cols-5 [&>div:last-child]:col-span-2 lg:[&>div:last-child]:col-span-1"
      : items.length === 4
        ? "grid-cols-2 lg:grid-cols-4"
      : items.length === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : items.length === 2
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-1";
  return (
    <dl className={cn("grid gap-px overflow-hidden rounded-xl border border-border bg-border", columns, className)}>
      {items.map((item) => (
        <div className="min-w-0 bg-card p-4" key={item.label}>
          <dd className="font-mono text-xl tabular-nums sm:text-2xl">
            <DataValueText value={item.value} />
          </dd>
          <dt className="mt-1 text-xs text-muted-foreground">{item.label}</dt>
          {item.note ? (
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{item.note}</p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
