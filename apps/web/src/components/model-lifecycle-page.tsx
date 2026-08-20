"use client";

import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ResultActions, ViewModeToggle } from "@/components/result-actions";
import {
  RouteEvidenceModeNotice,
  RouteEvidenceSources,
} from "@/components/route-evidence-ui";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  ModelSurfaceMode,
  SurfaceLifecycleRow,
} from "@tokenbench/frontend/model-surface-projectors";
import type { Provenance } from "@tokenbench/frontend/preview-data/contracts";

function formatAsOf(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : date.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
}

function statusLabel(value: string | null): string {
  return value ?? "Unavailable";
}

export function ModelLifecyclePage({
  rows,
  asOf,
  mode,
  status,
  sources,
}: {
  rows: readonly SurfaceLifecycleRow[];
  asOf: string;
  mode: ModelSurfaceMode;
  status: "available" | "partial" | "unavailable";
  sources: readonly Provenance[];
}) {
  const [horizon, setHorizon] = useState<"all" | "90" | "60">("all");
  const [view, setView] = useState<"cards" | "list">("cards");
  const alerts = rows.filter(
    (item) =>
      item.lifecycleStatus === "Retirement scheduled" ||
      item.lifecycleStatus === "Retired",
  );
  const visible = useMemo(
    () =>
      horizon === "all"
        ? alerts
        : alerts.filter(
            (item) =>
              item.daysToSunset !== null &&
              item.daysToSunset <= Number(horizon),
          ),
    [alerts, horizon],
  );
  const nextSunset =
    alerts
      .flatMap((item) =>
        item.daysToSunset === null ? [] : [item.daysToSunset],
      )
      .toSorted((left, right) => left - right)[0] ?? null;

  return (
    <main>
      <section className="border-b border-border px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <Badge
            className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em]"
            variant="secondary"
          >
            Lifecycle radar
          </Badge>
          <div className="grid gap-8 lg:grid-cols-[1fr_420px] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
                Plan model migrations before the deadline.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Track announced retirements and accepted successor guidance
                without converting a missing lifecycle record into false
                certainty.
              </p>
              <RouteEvidenceModeNotice mode={mode} status={status} />
            </div>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
              {[
                ["Open alerts", String(alerts.length)],
                [
                  "Next sunset",
                  nextSunset === null ? "Unavailable" : `${nextSunset}d`,
                ],
                ["As of", formatAsOf(asOf)],
              ].map(([label, value]) => (
                <div className="bg-card p-4" key={label}>
                  <p className="font-mono text-2xl">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs text-muted-foreground">
                01 / RETIREMENT WATCH
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Open migration alerts
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Filter supplied lifecycle evidence and switch between decision
                cards and a compact migration table.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div
                aria-label="Retirement horizon"
                className="flex rounded-xl border border-border bg-card p-1"
                role="group"
              >
                {[
                  ["all", "All"],
                  ["90", "90 days"],
                  ["60", "60 days"],
                ].map(([value, label]) => (
                  <button
                    aria-pressed={horizon === value}
                    className={`min-h-10 rounded-lg px-3 py-1.5 text-xs ${horizon === value ? "bg-active-control text-active-control-foreground" : "text-muted-foreground"}`}
                    key={value}
                    onClick={() => setHorizon(value as typeof horizon)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ViewModeToggle mode={view} onChange={setView} />
            </div>
          </div>
          <div className="mb-4 flex justify-end">
            <ResultActions
              filename="tokenbench-model-lifecycle"
              rows={visible.map((item) => ({
                model: item.name,
                provider: item.provider,
                sunset: item.sunsetOn,
                days: item.daysToSunset,
                successor: item.replacementId,
                migrationNote: item.migrationNote,
                state: item.lifecycleStatus,
              }))}
              targetId="lifecycle-results"
            />
          </div>
          <div id="lifecycle-results">
            {view === "cards" ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {visible.map((item) => (
                  <Card key={item.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-4">
                        <Badge variant="outline">
                          {item.provider ?? "Provider unavailable"}
                        </Badge>
                        <span className="font-mono text-xs text-amber-500">
                          {item.daysToSunset === null
                            ? "Deadline unavailable"
                            : `${item.daysToSunset} days`}
                        </span>
                      </div>
                      <CardTitle className="mt-4 text-xl">
                        {item.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-xl border border-border bg-muted/30 p-4">
                        <p className="text-xs text-muted-foreground">
                          Recommended successor
                        </p>
                        <p className="mt-2 text-lg font-medium">
                          {item.replacementId ?? "Unavailable"}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {item.migrationNote ??
                            "No accepted migration note was supplied."}
                        </p>
                      </div>
                      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarClock className="size-4" />
                        Published sunset {item.sunsetOn ?? "Unavailable"}
                      </div>
                    </CardContent>
                    <CardFooter className="justify-between">
                      <span className="text-xs text-muted-foreground">
                        {statusLabel(item.lifecycleStatus)}
                      </span>
                      {item.replacementId === null ? (
                        <span className="text-xs text-muted-foreground">
                          Comparison unavailable
                        </span>
                      ) : (
                        <Link
                          className="text-xs font-medium hover:underline"
                          href={`/compare?models=${encodeURIComponent(item.id)},${encodeURIComponent(item.replacementId)}`}
                        >
                          Inspect successor →
                        </Link>
                      )}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Model</th>
                      <th className="px-4 py-3 text-left">Provider</th>
                      <th className="px-4 py-3 text-left">Sunset</th>
                      <th className="px-4 py-3 text-right">Days</th>
                      <th className="px-4 py-3 text-left">Successor</th>
                      <th className="px-4 py-3 text-left">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((item) => (
                      <tr className="border-t border-border" key={item.id}>
                        <td className="px-4 py-3 font-medium">{item.name}</td>
                        <td className="px-4 py-3">
                          {item.provider ?? "Unavailable"}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {item.sunsetOn ?? "Unavailable"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {item.daysToSunset ?? "Unavailable"}
                        </td>
                        <td className="px-4 py-3">
                          {item.replacementId ?? "Unavailable"}
                        </td>
                        <td className="px-4 py-3">
                          {statusLabel(item.lifecycleStatus)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No accepted alerts fall inside this horizon. This does not imply
                indefinite model availability.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <p className="font-mono text-xs text-muted-foreground">
            02 / RELEASE TIMELINE
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Release timeline</h2>
          <div className="mt-8 rounded-xl border border-dashed border-border p-6">
            <Clock3 className="size-4 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">
              No release timeline was supplied with this lifecycle response.
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Model launch dates are not inferred from lifecycle status,
              retirement events, or provider names.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="size-4 text-emerald-500" />
              Evidence boundary
            </div>
            <h2 className="mt-3 text-2xl font-semibold">
              Only announced lifecycle facts become alerts.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              An absent retirement notice is not a promise of indefinite
              availability. Re-check published documentation before scheduling a
              migration.
            </p>
            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              Dates and successors remain source-attributed records rather than
              inferred from model age.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonVariants()} href="/models/">
              Open model workbench
              <ArrowRight />
            </Link>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href="/articles/"
            >
              Read migration guides
            </Link>
          </div>
        </div>
      </section>
      <section className="border-t border-border px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <RouteEvidenceSources
            sources={sources}
            title="Lifecycle provenance"
          />
        </div>
      </section>
    </main>
  );
}
