import { CircleAlert, Database, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import type {
  EvidenceValue,
  Provenance,
  UiDataContractV1,
} from "@tokenbench/frontend/preview-data/contracts";

import { Badge } from "@/components/ui/badge";

export function routeEvidenceText<T>(
  value: EvidenceValue<T>,
  format: (available: T) => ReactNode,
): ReactNode {
  return value.availability === "available" ? format(value.value) : "Unavailable";
}

export function routeEvidenceValue<T>(value: EvidenceValue<T>): T | null {
  return value.availability === "available" ? value.value : null;
}

export function formatRouteEvidencePrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return `$${value < 1 ? value.toFixed(3) : value.toFixed(2)}`;
}

export function formatRouteEvidenceTokens(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return Math.round(value).toLocaleString("en-US");
}

export function RouteEvidenceModeNotice({
  mode,
  status,
}: {
  mode: "preview" | "published" | "unconfigured";
  status?: UiDataContractV1<unknown>["status"];
}) {
  if (mode === "preview") {
    return (
      <p className="mt-6 flex max-w-3xl items-start gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
        Preview-only retained evidence is shown for interface review. It is not a production factual profile or a verified route recommendation.
      </p>
    );
  }
  if (status === "partial") {
    return (
      <p className="mt-6 flex max-w-3xl items-start gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        Coverage is partial. Missing observations remain unavailable and are not estimated from another route or model.
      </p>
    );
  }
  return null;
}

export function RouteEvidenceUnavailableState({
  heading,
  detail,
}: {
  heading: string;
  detail: string;
}) {
  return (
    <main className="px-4 py-20 sm:px-6 sm:py-28">
      <section className="mx-auto max-w-2xl rounded-2xl border border-dashed border-border bg-card p-7 sm:p-10">
        <CircleAlert aria-hidden="true" className="size-6 text-muted-foreground" />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">{heading}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{detail}</p>
      </section>
    </main>
  );
}

export function RouteEvidenceSources({
  sources,
  title = "Evidence receipt",
}: {
  sources: readonly Provenance[];
  title?: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="route-evidence-sources">
      <div className="flex items-start gap-3">
        <Database aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="font-medium" id="route-evidence-sources">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Source observations stay separate from derived route selection and unavailable fields.</p>
        </div>
      </div>
      {sources.length ? (
        <ul className="mt-5 divide-y divide-border text-sm">
          {sources.map((source, index) => (
            <li className="py-3 first:pt-0 last:pb-0" key={source.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Evidence source {index + 1}</span>
                <Badge variant="outline">{source.kind === "illustrative_prototype" ? "Preview-only · not verified" : "Published data"}</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {source.effectiveAt === null ? "Effective time unavailable" : `Effective ${new Date(source.effectiveAt).toLocaleDateString("en-US", { dateStyle: "medium" })}`}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">No source receipt was supplied for this request.</p>
      )}
    </section>
  );
}
