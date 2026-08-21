import { Activity } from "@untitledui/icons";
import type { ReactNode } from "react";

import { DataValueText, type PresentationValue } from "@/components/untitled-data/data-value";

export type ProvenanceActivityItem = {
  detail?: string;
  id: string;
  observedAt: PresentationValue<string>;
  sourceLabel: string;
  sourceUrl?: string | null;
  title: string;
};

/**
 * Adapted from Untitled UI's Activity Feed component: records are connected by
 * provenance receipt rather than represented as a synthetic audit trail.
 */
export function ProvenanceActivityFeed({
  items,
  title = "Source provenance",
}: {
  items: readonly ProvenanceActivityItem[];
  title?: string;
}): ReactNode {
  return (
    <section aria-label={title} className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Activity aria-hidden="true" className="size-4 text-brand-secondary dark:text-brand-secondary" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {items.length ? (
        <ol className="mt-5 space-y-4">
          {items.map((item, index) => (
            <li className="relative flex gap-3" key={item.id}>
              {index < items.length - 1 ? (
                <span aria-hidden="true" className="absolute left-[9px] top-5 h-[calc(100%+0.5rem)] border-l border-dashed border-border" />
              ) : null}
              <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand ring-4 ring-brand/10" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="font-medium text-sm">{item.title}</p>
                  <span className="text-xs text-muted-foreground">
                    <DataValueText value={item.observedAt} />
                  </span>
                </div>
                {item.detail ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p> : null}
                {item.sourceUrl ? (
                  <a className="mt-1.5 inline-flex text-xs font-medium text-link hover:underline" href={item.sourceUrl} rel="noreferrer" target="_blank">
                    {item.sourceLabel}
                  </a>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">{item.sourceLabel}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No source provenance receipts were supplied for this response.</p>
      )}
    </section>
  );
}
