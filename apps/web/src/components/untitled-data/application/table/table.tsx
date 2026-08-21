import type { ReactNode } from "react";

import { Table } from "@untitledui/icons";

/**
 * Adapted from Untitled UI's Table Card. It keeps semantic HTML tables and
 * TokenBench tokens, leaving sorting and selection to the owning route.
 */
export function DataTableCard({
  children,
  description,
  title,
  trailing,
}: {
  children: ReactNode;
  description?: string;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex items-start gap-2">
          <Table aria-hidden="true" className="mt-0.5 size-4 text-brand-secondary" />
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {trailing}
      </header>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}
