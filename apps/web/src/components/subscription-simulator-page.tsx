"use client";

import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  CircleAlert,
  Info,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ResultActions } from "@/components/result-actions";
import { SubscriptionBreakevenChart } from "@/components/tokenbench-chart";
import { DataText } from "@/components/untitled-data/data-value";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  selectedPlan,
  type SubscriptionCalculationView,
  type SubscriptionSimulatorCatalog,
} from "@/lib/subscription-simulator-projector";
import {
  defaultSubscriptionScenario,
  normalizeMix,
  serializeSubscriptionScenario,
  SUBSCRIPTION_PROVIDERS,
  type SubscriptionProvider,
  type SubscriptionScenario,
} from "@/lib/subscription-simulator";

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  note,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  note?: string;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-1.5 text-xs text-muted-foreground">
      {label}
      <Input
        className="mt-1.5 h-9 font-mono"
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => event.target.value !== "" && onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={value}
      />
      {note ? <span className="block text-[10px] leading-4">{note}</span> : null}
    </label>
  );
}

function SectionHeading({ number, eyebrow, title, body }: { number: string; eyebrow: string; title: string; body: string }) {
  return (
    <div className="mb-7">
      <p className="font-mono text-xs text-muted-foreground">{number} / {eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function PriceValue({
  value,
  reason = "No reviewed price was supplied for this value.",
}: {
  value: number | null;
  reason?: string;
}) {
  return <DataText format={(amount) => `$${amount.toFixed(2)}`} reason={reason} value={value} />;
}

function TokenVolumeValue({
  value,
  reason = "No token volume was supplied for this value.",
}: {
  value: number | null;
  reason?: string;
}) {
  return <DataText format={(tokens) => `${(tokens / 1_000_000).toFixed(2)}M`} reason={reason} value={value} />;
}

function PercentageValue({ value }: { value: number | null }) {
  return <DataText format={(percentage) => `${percentage.toFixed(0)}%`} reason="No usage mix was supplied for this model." value={value} />;
}

type ModelCostRow = {
  modelSlug: string;
  share: number | null;
  inputRate: number | null;
  cacheReadRate: number | null;
  cacheWriteRate: number | null;
  outputRate: number | null;
  standardInputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  outputCost: number;
  total: number;
};

function modelCostRows(calculation: SubscriptionCalculationView | null): ModelCostRow[] {
  if (calculation === null) return [];
  const rows = new Map<string, ModelCostRow>();
  for (const item of calculation.lineItems) {
    const row = rows.get(item.modelSlug) ?? {
      modelSlug: item.modelSlug,
      share: calculation.modelShares[item.modelSlug] ?? null,
      inputRate: null,
      cacheReadRate: null,
      cacheWriteRate: null,
      outputRate: null,
      standardInputCost: 0,
      cacheReadCost: 0,
      cacheWriteCost: 0,
      outputCost: 0,
      total: 0,
    };
    if (item.kind === "standard_input") {
      row.inputRate = item.rateUsdPerMillion;
      row.standardInputCost += item.costUsd;
    }
    if (item.kind === "cache_read") {
      row.cacheReadRate = item.rateUsdPerMillion;
      row.cacheReadCost += item.costUsd;
    }
    if (item.kind === "cache_write") {
      row.cacheWriteRate = item.rateUsdPerMillion;
      row.cacheWriteCost += item.costUsd;
    }
    if (item.kind === "output") {
      row.outputRate = item.rateUsdPerMillion;
      row.outputCost += item.costUsd;
    }
    row.total += item.costUsd;
    rows.set(item.modelSlug, row);
  }
  return [...rows.values()];
}

function UnavailableRow({ colSpan, message }: { colSpan: number; message: string }) {
  return <tr className="border-t border-border"><td className="px-4 py-5 text-sm text-muted-foreground" colSpan={colSpan}>{message}</td></tr>;
}

function PlanEvidence({
  plan,
  sources,
}: {
  plan: SubscriptionSimulatorCatalog["providers"][number]["plans"][number] | null;
  sources: SubscriptionSimulatorCatalog["sources"];
}) {
  if (plan === null) return null;
  const entitlement = plan.entitlement;
  const sourceRefs = [...new Set([...plan.sourceRefs, ...(entitlement?.sourceRefs ?? [])])];
  const receipts = sourceRefs.map((sourceRef) => sources.find((source) => source.sourceRef === sourceRef) ?? null);
  return (
    <details className="rounded-xl border border-border bg-muted/20 p-3">
      <summary className="min-h-9 cursor-pointer py-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Plan evidence and limits
      </summary>
      <dl className="mt-3 grid gap-px overflow-hidden rounded-lg border border-border bg-border text-xs sm:grid-cols-3">
        <div className="bg-card p-3"><dt className="text-muted-foreground">Monthly</dt><dd className="mt-1 font-mono"><DataText format={(value) => `$${value.toFixed(2)}`} reason="No reviewed monthly provider price was supplied." value={plan.monthlyUsd} /></dd></div>
        <div className="bg-card p-3"><dt className="text-muted-foreground">Annual checkout</dt><dd className="mt-1 font-mono"><DataText format={(value) => `$${value.toFixed(2)}`} reason="No provider-published annual checkout price was supplied." value={plan.annualUsd} /></dd></div>
        <div className="bg-card p-3"><dt className="text-muted-foreground">Annual effective / month</dt><dd className="mt-1 font-mono"><DataText format={(value) => `$${value.toFixed(2)}`} reason="No provider-published annual effective monthly price was supplied." value={plan.annualEffectiveMonthlyUsd} /></dd></div>
      </dl>
      {entitlement ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>Evidence: <strong className="font-medium text-foreground">{entitlement.evidenceStatus}</strong></span>
            <span>Bound: <strong className="font-medium text-foreground">{entitlement.boundType.replaceAll("_", " ")}</strong></span>
            <span>Verified: <DataText reason="No entitlement verification time was supplied." value={entitlement.lastVerifiedAt} /></span>
          </div>
          {entitlement.usageNote ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{entitlement.usageNote}</p> : null}
          {entitlement.staleReason ? <p className="mt-2 text-xs leading-5 text-amber-600 dark:text-amber-300">{entitlement.staleReason}</p> : null}
          {entitlement.dimensions.length ? (
            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[520px] text-xs">
                <caption className="sr-only">Published plan entitlement dimensions</caption>
                <thead className="bg-muted/60 text-muted-foreground"><tr><th className="px-3 py-2 text-left">Metric</th><th className="px-3 py-2 text-right">Minimum</th><th className="px-3 py-2 text-right">Maximum</th><th className="px-3 py-2 text-left">Window</th></tr></thead>
                <tbody>{entitlement.dimensions.map((dimension) => <tr className="border-t border-border" key={`${dimension.metric}-${dimension.feature ?? ""}-${dimension.modelId ?? ""}`}><td className="px-3 py-2">{dimension.metric}{dimension.feature ? ` · ${dimension.feature}` : ""}</td><td className="px-3 py-2 text-right font-mono"><DataText reason="No published entitlement minimum was supplied." value={dimension.minimum} /></td><td className="px-3 py-2 text-right font-mono"><DataText reason="No published entitlement maximum was supplied." value={dimension.maximum} /></td><td className="px-3 py-2">{dimension.window}{dimension.resetRule ? ` · ${dimension.resetRule}` : ""}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className="mt-3 text-xs text-muted-foreground">No entitlement dimensions were supplied.</p>}
        </div>
      ) : <p className="mt-3 text-xs text-muted-foreground">No provider entitlement receipt was supplied for this plan.</p>}
      {sourceRefs.length ? (
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {sourceRefs.map((sourceRef, index) => {
            const receipt = receipts[index];
            return (
              <li key={sourceRef}>
                {receipt ? (
                  <>
                    <a
                      className="text-primary underline underline-offset-2 hover:no-underline dark:text-[#9dabff]"
                      href={receipt.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {receipt.label}
                    </a>
                    <span className="ml-1 text-muted-foreground">{receipt.effectiveAt ?? receipt.observedAt}</span>
                  </>
                ) : (
                  <DataText
                    reason={`The ${sourceRef} receipt was referenced but no matching source record was supplied.`}
                    value={null}
                  />
                )}
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-3 text-xs text-muted-foreground">No source receipt references were supplied.</p>}
    </details>
  );
}

export function SubscriptionSimulatorPage({
  scenario,
  catalog,
}: {
  scenario: SubscriptionScenario;
  catalog: SubscriptionSimulatorCatalog;
}) {
  const router = useRouter();
  const plan = selectedPlan(scenario, catalog);
  const provider = catalog.providers.find((candidate) => candidate.id === scenario.provider) ?? catalog.providers[0];
  const calculation = catalog.calculation;
  const [candidate, setCandidate] = useState("");
  const selectedModels = catalog.models.filter((model) => model.planId === scenario.plan && scenario.models.includes(model.id));
  const availableModels = catalog.models.filter((model) => model.planId === scenario.plan && !scenario.models.includes(model.id));
  const rows = useMemo(() => modelCostRows(calculation), [calculation]);
  const currentMillions = calculation === null ? null : calculation.selectedTokenVolume / 1_000_000;
  const crossoverMillions = calculation?.crossoverTokens === null || calculation === null
    ? null
    : calculation.crossoverTokens / 1_000_000;
  const calculatedRate = calculation === null || calculation.selectedTokenVolume === 0
    ? null
    : calculation.selectedVolumeApiUsd / (calculation.selectedTokenVolume / 1_000_000);
  const comparison = calculation === null
    ? "Calculation unavailable"
    : calculation.cheaper === "api"
      ? "API estimate is lower"
      : calculation.cheaper === "subscription"
        ? "Subscription is lower"
        : "Costs are equal";

  const change = (patch: Partial<SubscriptionScenario>) => {
    const next = { ...scenario, ...patch };
    router.replace(`/subscribe-vs-api/?${serializeSubscriptionScenario(next)}`, { scroll: false });
  };

  const changeProvider = (nextProvider: SubscriptionProvider) => {
    const nextCatalogProvider = catalog.providers.find((candidate) => candidate.id === nextProvider);
    const models: string[] = [];
    change({
      provider: nextProvider,
      plan: nextCatalogProvider?.plans[0]?.id ?? "",
      models,
      mix: normalizeMix(models, null),
    });
  };

  const addModel = () => {
    if (!candidate || scenario.models.length >= 4) return;
    const models = [...scenario.models, candidate];
    change({ models, mix: normalizeMix(models, null) });
    setCandidate("");
  };

  const removeModel = (modelId: string) => {
    if (scenario.models.length === 1) return;
    const models = scenario.models.filter((id) => id !== modelId);
    change({ models, mix: normalizeMix(models, null) });
  };

  const changeRatio = (modelId: string, nextValue: number) => {
    const others = scenario.models.filter((id) => id !== modelId);
    if (others.length === 0) return;
    const bounded = Math.max(0, Math.min(100, Math.round(nextValue)));
    const remainder = 100 - bounded;
    const currentOtherTotal = others.reduce((sum, id) => sum + (scenario.mix[id] ?? 0), 0);
    let used = 0;
    const mix: Record<string, number> = { [modelId]: bounded };
    others.forEach((id, index) => {
      const value = index === others.length - 1
        ? remainder - used
        : Math.round(remainder * (currentOtherTotal > 0 ? (scenario.mix[id] ?? 0) / currentOtherTotal : 1 / others.length));
      mix[id] = value;
      used += value;
    });
    change({ mix });
  };

  const applyCharacterEstimate = () => {
    const divisor = scenario.contentType === "code" ? 3 : 4;
    change({
      inputTokensPerMessage: Math.round(scenario.inputCharactersPerMessage / divisor),
      outputTokensPerMessage: Math.round(scenario.outputCharactersPerMessage / divisor),
    });
  };

  const reset = () => router.replace(`/subscribe-vs-api/?${serializeSubscriptionScenario(defaultSubscriptionScenario)}`, { scroll: false });
  const exportRows = [
    { line: "API estimate", value: calculation?.monthlyApiUsd ?? null, unit: "USD / month" },
    { line: plan?.displayName ?? "Subscription plan", value: calculation?.monthlySubscriptionUsd ?? null, unit: "USD / month" },
    { line: "Token volume", value: currentMillions, unit: "million tokens / month" },
    { line: "Crossover", value: crossoverMillions, unit: "million tokens / month" },
    ...rows.map((row) => ({ line: row.modelSlug, value: row.total, unit: "USD / month" })),
  ];

  return (
    <main>
      <section className="border-b border-border px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <Badge className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em]" variant="secondary">Monthly cost simulator</Badge>
          <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Subscription versus pay-as-you-go API.</h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">Build a shareable monthly scenario from provider plan, model mix, message workload, cache allocation, seats, and token volume.</p>
            </div>
            <Card>
              <CardHeader><div className="flex items-center gap-2 text-sm font-medium"><Info className="size-4" />Scenario boundary</div></CardHeader>
              <CardContent>
                {catalog.sourceMode === "evidence" ? <p className="text-xs leading-5 text-muted-foreground">Preview evidence only. It is disabled in production and is never substituted for reviewed provider data.</p> : null}
                {catalog.sourceMode !== "evidence" ? <p className="text-xs leading-5 text-muted-foreground">Prices, limits, and results appear only when the reviewed catalog supplies them. Provider-managed limits remain explicitly variable.</p> : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <div id="subscription-result">
        <section className="px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <SectionHeading body="Every accepted input is encoded into the canonical URL so the complete scenario can be reconstructed and shared." eyebrow="SCENARIO SETUP" number="01" title="Set up a shareable cost scenario" />
            {catalog.reason ? <div className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{catalog.reason}</div> : null}
            <div className="grid gap-4 xl:grid-cols-3">
              <Card>
                <CardHeader><CardTitle>Provider and plan</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <label className="block space-y-1.5 text-xs text-muted-foreground">Provider
                    <select className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground" onChange={(event) => changeProvider(event.target.value as SubscriptionProvider)} value={scenario.provider}>
                      {SUBSCRIPTION_PROVIDERS.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-1.5 text-xs text-muted-foreground">Plan
                    <select className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground" disabled={provider.plans.length === 0} onChange={(event) => change({ plan: event.target.value, models: [], mix: {} })} value={scenario.plan}>
                      {provider.plans.length === 0 ? <option title="No reviewed plan was supplied for this provider." value="">- — no reviewed plan</option> : null}
                      {provider.plans.map((candidate) => <option key={candidate.id} title={candidate.monthlyUsd === null ? "No reviewed monthly price was supplied for this plan." : undefined} value={candidate.id}>{candidate.displayName ?? "-"} — {candidate.monthlyUsd === null ? "-" : `$${candidate.monthlyUsd.toFixed(2)}/month`}</option>)}
                    </select>
                  </label>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="font-mono text-xl"><PriceValue reason="No reviewed monthly provider price was supplied." value={plan?.monthlyUsd ?? null} /></p>
                    <p className="mt-1 text-xs text-muted-foreground">{plan?.monthlyUsd === null || plan === null ? "Reviewed price unavailable" : "reviewed monthly price per seat"}</p>
                    <p className="mt-2 text-xs text-muted-foreground"><DataText reason="No reviewed plan limit was supplied." value={plan?.limit.label ?? null} /></p>
                    {plan?.limit.detail ? <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{plan.limit.detail}</p> : null}
                  </div>
                  <PlanEvidence plan={plan} sources={catalog.sources} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>API models and usage ratios</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {selectedModels.length === 0 ? <div className="rounded-xl border border-border bg-muted/20 p-3"><div className="flex items-start gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p className="text-sm font-medium">API model selection unavailable</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{catalog.modelSelectionReason}</p></div></div></div> : selectedModels.map((model) => <div className="rounded-xl border border-border p-3" key={model.id}><div className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-foreground" /><span className="min-w-0 flex-1 text-sm font-medium">{model.id}<span className="ml-2 text-xs font-normal text-muted-foreground">exact direct route</span></span><Button aria-label={`Remove ${model.id}`} disabled={scenario.models.length === 1} onClick={() => removeModel(model.id)} size="icon-xs" variant="ghost"><X /></Button></div><div className="mt-3 flex items-center gap-3"><input aria-label={`${model.id} usage ratio`} className="min-w-0 flex-1 accent-foreground" disabled={scenario.models.length === 1} max={100} min={0} onChange={(event) => changeRatio(model.id, Number(event.target.value))} step={1} type="range" value={scenario.mix[model.id] ?? 0} /><span className="w-10 text-right font-mono text-xs">{scenario.mix[model.id] ?? 0}%</span></div></div>)}
                  <div className="flex gap-2">
                    <select aria-label="Add API model" className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm" disabled={availableModels.length === 0 || scenario.models.length >= 4} onChange={(event) => setCandidate(event.target.value)} value={candidate}><option value="">Choose another model</option>{availableModels.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}</select>
                    <Button disabled={!candidate || scenario.models.length >= 4} onClick={addModel}><Plus />Add model</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{scenario.models.length}/4 models · ratios total {Object.values(scenario.mix).reduce((sum, value) => sum + value, 0)}% · {catalog.modelSelectionReason}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Message-level workload</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  <NumberField label="Conversations / day" max={10_000} min={0} onChange={(value) => change({ conversationsPerDay: value })} value={scenario.conversationsPerDay} />
                  <NumberField label="Messages / conversation" max={10_000} min={0} onChange={(value) => change({ messagesPerConversation: value })} value={scenario.messagesPerConversation} />
                  <NumberField label="Active days / month" max={31} min={1} onChange={(value) => change({ activeDays: value })} value={scenario.activeDays} />
                  <span />
                  <NumberField label="Input tokens / message" max={1_000_000} min={0} onChange={(value) => change({ inputTokensPerMessage: value })} value={scenario.inputTokensPerMessage} />
                  <NumberField label="Output tokens / message" max={1_000_000} min={0} onChange={(value) => change({ outputTokensPerMessage: value })} value={scenario.outputTokensPerMessage} />
                  <NumberField label="Cache read share %" max={100} min={0} onChange={(value) => change({ cacheReadShare: value })} value={scenario.cacheReadShare} />
                  <NumberField label="Cache write share %" max={100} min={0} onChange={(value) => change({ cacheWriteShare: value })} value={scenario.cacheWriteShare} />
                  <label className="col-span-2 flex items-start gap-2 rounded-lg border border-border p-3 text-xs"><input checked={scenario.longContext} className="mt-0.5 accent-foreground" onChange={(event) => change({ longContext: event.target.checked })} type="checkbox" /><span><span className="block font-medium text-foreground">Long-context buffer</span><span className="mt-1 block text-muted-foreground">Add 50% to input tokens for this scenario; strict calculation rounds the result to whole tokens.</span></span></label>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-4">
              <CardHeader><CardTitle>Character estimate helper</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <NumberField label="Input characters / message" max={4_000_000} min={0} onChange={(value) => change({ inputCharactersPerMessage: value })} value={scenario.inputCharactersPerMessage} />
                <NumberField label="Output characters / message" max={4_000_000} min={0} onChange={(value) => change({ outputCharactersPerMessage: value })} value={scenario.outputCharactersPerMessage} />
                <label className="space-y-1.5 text-xs text-muted-foreground">Content type<select className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm" onChange={(event) => change({ contentType: event.target.value as "text" | "code" })} value={scenario.contentType}><option value="text">Text — 4 characters/token</option><option value="code">Code — 3 characters/token</option></select></label>
                <div className="flex items-end"><Button className="w-full" onClick={applyCharacterEstimate} variant="outline"><Calculator />Use character estimate</Button></div>
              </CardContent>
              <CardFooter><p className="text-xs text-muted-foreground">Displayed estimate: {Math.round(scenario.inputCharactersPerMessage / (scenario.contentType === "code" ? 3 : 4)).toLocaleString()} input and {Math.round(scenario.outputCharactersPerMessage / (scenario.contentType === "code" ? 3 : 4)).toLocaleString()} output tokens per message.</p></CardFooter>
            </Card>
          </div>
        </section>

        <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <SectionHeading body="The summary is shown only from a validated calculation response. It never uses browser-side price math or a fallback rate card." eyebrow="MONTHLY SUMMARY" number="02" title="Monthly API / SaaS summary" />
            <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              <div className="bg-card p-5"><p className="font-mono text-3xl"><PriceValue reason="No reviewed API-equivalent calculation was supplied." value={calculation?.monthlyApiUsd ?? null} /></p><p className="mt-1 text-sm font-medium">API-equivalent estimate</p><p className="mt-2 text-xs text-muted-foreground">{calculation === null ? "Unavailable until a reviewed calculation can be requested" : "Validated calculation"}</p></div>
              <div className="bg-card p-5"><p className="font-mono text-3xl"><PriceValue reason="No reviewed subscription calculation was supplied." value={calculation?.monthlySubscriptionUsd ?? null} /></p><p className="mt-1 text-sm font-medium"><DataText reason="No selected subscription plan was supplied." value={plan?.displayName ?? null} /></p><p className="mt-2 text-xs text-muted-foreground">{scenario.seats} seat{scenario.seats === 1 ? "" : "s"}</p></div>
              <div className="bg-card p-5"><p className="font-mono text-3xl"><TokenVolumeValue reason="No reviewed monthly token total was supplied." value={calculation === null ? null : calculation.monthlyInputTokens + calculation.monthlyOutputTokens} /></p><p className="mt-1 text-sm font-medium">Monthly tokens</p><p className="mt-2 text-xs text-muted-foreground"><DataText format={(messages) => `${messages.toLocaleString()} messages from workload`} reason="No reviewed monthly message count was supplied." value={calculation?.monthlyMessages ?? null} /></p></div>
              <div className="bg-card p-5"><p className="font-mono text-3xl"><DataText format={(value) => `${value.toFixed(2)}M`} reason="No reviewed crossover volume was supplied." value={crossoverMillions} /></p><p className="mt-1 text-sm font-medium">Estimated crossover</p><p className="mt-2 text-xs text-muted-foreground">{comparison}</p></div>
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <SectionHeading body="Seats and token volume remain shareable inputs. The published plan price is read-only, and all comparison values come from the strict calculation service." eyebrow="BREAKEVEN" number="03" title="Subscription versus API breakeven" />
            <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
              <Card>
                <CardHeader><CardTitle>Breakeven controls</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <div><div className="flex justify-between text-xs"><span className="text-muted-foreground">Seats</span><span className="font-mono">{scenario.seats}</span></div><input aria-label="Subscription seats" className="mt-3 w-full accent-foreground" max={50} min={1} onChange={(event) => change({ seats: Number(event.target.value) })} step={1} type="range" value={scenario.seats} /></div>
                  {plan?.monthlyUsd === null || plan === null ? (
                    <div className="space-y-1.5 text-xs text-muted-foreground"><span>Reviewed subscription price / seat</span><p className="rounded-md border border-input bg-muted/20 px-3 py-2 font-mono text-sm"><PriceValue reason="No reviewed subscription price was supplied for this selected plan." value={null} /></p></div>
                  ) : <NumberField disabled label="Reviewed subscription price / seat" max={10_000} min={0} onChange={() => undefined} step={0.01} value={plan.monthlyUsd} note="Published value is not editable in the simulator." />}
                  <div><div className="flex justify-between text-xs"><span className="text-muted-foreground">Token-volume scenario</span><span className="font-mono">{scenario.tokenVolume === 0 ? "From workload" : `${scenario.tokenVolume}M`}</span></div><input aria-label="Monthly token volume in millions" className="mt-3 w-full accent-foreground" max={300} min={0} onChange={(event) => change({ tokenVolume: Number(event.target.value) })} step={0.1} type="range" value={scenario.tokenVolume} /></div>
                  <div className="rounded-xl border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Crossover result</p><p className="mt-2 font-mono text-2xl"><DataText format={(value) => `${value.toFixed(2)}M tokens`} reason="No reviewed crossover volume was supplied." value={crossoverMillions} /></p><p className="mt-2 text-xs leading-5 text-muted-foreground">{calculation === null ? catalog.calculationReason : "This result is returned by the strict calculation service."}</p></div>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  {calculation !== null && calculatedRate !== null && currentMillions !== null ? <SubscriptionBreakevenChart costPerMillion={calculatedRate} crossoverMillions={crossoverMillions} currentMillions={currentMillions} subscriptionCost={calculation.monthlySubscriptionUsd} /> : <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">Breakeven chart unavailable until the catalog can form a reviewed model-to-route calculation request.</div>}
                </CardContent>
              </Card>
            </div>
            <div className="mt-4 grid gap-3 md:hidden">
              {calculation === null ? <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{catalog.calculationReason ?? "No verified calculation is available."}</p> : calculation.domain.map((point) => <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 text-sm" key={`${point.tokens}-mobile`}><dt className="col-span-2 flex flex-wrap items-center justify-between gap-2 font-medium"><span><TokenVolumeValue value={point.tokens} /></span>{point.tokens === calculation.selectedTokenVolume ? <Badge>Selected</Badge> : null}</dt><div><dt className="text-xs text-muted-foreground">API estimate</dt><dd className="mt-1 font-mono"><PriceValue value={point.apiUsd} /></dd></div><div><dt className="text-xs text-muted-foreground">Subscription</dt><dd className="mt-1 font-mono"><PriceValue value={point.subscriptionUsd} /></dd></div><div className="col-span-2"><dt className="text-xs text-muted-foreground">Lower line</dt><dd className="mt-1">{point.apiUsd < point.subscriptionUsd ? "API" : point.apiUsd > point.subscriptionUsd ? "Subscription" : "Equal"}</dd></div></dl>)}
            </div>
            <div aria-label="Breakeven comparison table" className="mt-4 hidden overflow-x-auto rounded-xl border border-border md:block" role="region" tabIndex={0}>
              <table className="w-full table-fixed border-collapse text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Volume</th><th className="px-4 py-3 text-right">API estimate</th><th className="px-4 py-3 text-right">Subscription</th><th className="px-4 py-3 text-left">Lower line</th></tr></thead><tbody>{calculation === null ? <UnavailableRow colSpan={4} message={catalog.calculationReason ?? "No verified calculation is available."} /> : calculation.domain.map((point) => <tr className="border-t border-border" key={point.tokens}><td className="px-4 py-3 font-mono"><TokenVolumeValue value={point.tokens} />{point.tokens === calculation.selectedTokenVolume ? " · selected" : ""}</td><td className="px-4 py-3 text-right font-mono"><PriceValue value={point.apiUsd} /></td><td className="px-4 py-3 text-right font-mono"><PriceValue value={point.subscriptionUsd} /></td><td className="px-4 py-3">{point.apiUsd < point.subscriptionUsd ? "API" : point.apiUsd > point.subscriptionUsd ? "Subscription" : "Equal"}</td></tr>)}</tbody></table>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <SectionHeading body="Reviewed rate lines remain separate from derived monthly lines. Missing rate or entitlement evidence stays unavailable instead of being filled with an estimate." eyebrow="PRICE EVIDENCE" number="04" title="Price sources and derived monthly lines" />
            <div className="grid gap-4">
              <div>
                <h3 className="rounded-t-xl border border-b-0 border-border bg-card px-4 py-3 font-medium">Raw source-price table</h3>
                <div className="grid gap-3 rounded-b-xl border border-border bg-card p-3 md:hidden">{rows.length === 0 ? <p className="text-sm text-muted-foreground">No reviewed calculation line items are available.</p> : rows.map((row) => <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-sm" key={`${row.modelSlug}-rates`}><dt className="col-span-2 font-medium">{row.modelSlug}</dt>{[["Input", row.inputRate], ["Cache read", row.cacheReadRate], ["Cache write", row.cacheWriteRate], ["Output", row.outputRate]].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-mono"><PriceValue value={value as number | null} /></dd></div>)}</dl>)}</div>
                <div aria-label="Raw source-price table" className="hidden overflow-x-auto rounded-b-xl border border-border bg-card md:block" role="region" tabIndex={0}><table className="w-full table-fixed border-collapse text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="w-2/5 px-3 py-3 text-left">Model</th><th className="px-3 py-3 text-right">Input</th><th className="px-3 py-3 text-right">Cache read</th><th className="px-3 py-3 text-right">Cache write</th><th className="px-3 py-3 text-right">Output</th></tr></thead><tbody>{rows.length === 0 ? <UnavailableRow colSpan={5} message="No reviewed calculation line items are available." /> : rows.map((row) => <tr className="border-t border-border" key={row.modelSlug}><td className="break-words px-3 py-3 font-medium">{row.modelSlug}</td><td className="px-3 py-3 text-right font-mono"><PriceValue value={row.inputRate} /></td><td className="px-3 py-3 text-right font-mono"><PriceValue value={row.cacheReadRate} /></td><td className="px-3 py-3 text-right font-mono"><PriceValue value={row.cacheWriteRate} /></td><td className="px-3 py-3 text-right font-mono"><PriceValue value={row.outputRate} /></td></tr>)}</tbody></table></div>
              </div>
              <div>
                <h3 className="rounded-t-xl border border-b-0 border-border bg-card px-4 py-3 font-medium">Derived monthly line-items</h3>
                <div className="grid gap-3 rounded-b-xl border border-border bg-card p-3 md:hidden">{rows.length === 0 ? <p className="text-sm text-muted-foreground">No reviewed calculation line items are available.</p> : rows.map((row) => <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-sm" key={`${row.modelSlug}-costs`}><dt className="col-span-2 flex justify-between gap-3 font-medium"><span>{row.modelSlug}</span><span className="font-mono"><PercentageValue value={row.share} /></span></dt>{[["Standard input", row.standardInputCost], ["Cache read", row.cacheReadCost], ["Cache write", row.cacheWriteCost], ["Output", row.outputCost], ["Total", row.total]].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-mono"><PriceValue value={value as number} /></dd></div>)}</dl>)}</div>
                <div aria-label="Derived monthly line-items table" className="hidden overflow-x-auto rounded-b-xl border border-border bg-card md:block" role="region" tabIndex={0}><table className="w-full table-fixed border-collapse text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="w-1/4 px-3 py-3 text-left">Model</th><th className="px-3 py-3 text-right">Mix</th><th className="px-3 py-3 text-right">Standard input</th><th className="px-3 py-3 text-right">Cache read</th><th className="px-3 py-3 text-right">Cache write</th><th className="px-3 py-3 text-right">Output</th><th className="px-3 py-3 text-right">Total</th></tr></thead><tbody>{rows.length === 0 ? <UnavailableRow colSpan={7} message="No reviewed calculation line items are available." /> : rows.map((row) => <tr className="border-t border-border" key={row.modelSlug}><td className="break-words px-3 py-3 font-medium">{row.modelSlug}</td><td className="px-3 py-3 text-right font-mono"><PercentageValue value={row.share} /></td><td className="px-3 py-3 text-right font-mono"><PriceValue value={row.standardInputCost} /></td><td className="px-3 py-3 text-right font-mono"><PriceValue value={row.cacheReadCost} /></td><td className="px-3 py-3 text-right font-mono"><PriceValue value={row.cacheWriteCost} /></td><td className="px-3 py-3 text-right font-mono"><PriceValue value={row.outputCost} /></td><td className="px-3 py-3 text-right font-mono"><PriceValue value={row.total} /></td></tr>)}</tbody></table></div>
              </div>
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />Requested cache shares: {scenario.cacheReadShare}% read + {scenario.cacheWriteShare}% write. Effective allocation is available only from a reviewed calculation response.</p>
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <SectionHeading body="The calculation is intentionally plain enough to reproduce in a spreadsheet or service-side evaluator." eyebrow="METHOD" number="05" title="Formula and assumptions" />
            <div className="grid gap-4 md:grid-cols-3">
              <Card><CardHeader><CardTitle>1. Workload</CardTitle></CardHeader><CardContent><p className="font-mono text-xs leading-6">conversations/day × messages/conversation × active days</p><p className="mt-3 text-xs text-muted-foreground">Long context adds 50% to input tokens only.</p></CardContent></Card>
              <Card><CardHeader><CardTitle>2. Weighted API cost</CardTitle></CardHeader><CardContent><p className="font-mono text-xs leading-6">Σ model mix × (input allocation × price + output × price)</p><p className="mt-3 text-xs text-muted-foreground">The strict service must validate every model and route before it returns this value.</p></CardContent></Card>
              <Card><CardHeader><CardTitle>3. Crossover</CardTitle></CardHeader><CardContent><p className="font-mono text-xs leading-6">subscription monthly cost ÷ API cost per million tokens</p><p className="mt-3 text-xs text-muted-foreground">This is a cost crossover, not a claim about product capacity or feature parity.</p></CardContent></Card>
            </div>
            <details className="mt-4 rounded-xl border border-border bg-card p-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Exact formula and rounding</summary><div className="mt-3 space-y-3 text-xs leading-6 text-muted-foreground"><p><span className="font-mono text-foreground">monthly messages</span> = conversations/day × messages/conversation × active days.</p><p><span className="font-mono text-foreground">standard input</span>, <span className="font-mono text-foreground">cache read</span>, and <span className="font-mono text-foreground">cache write</span> are priced as separate token lines. A positive allocation requires its own accepted rate; standard input is never substituted.</p><p>Each exact micro-dollar line is calculated before presentation rounding. Reader-facing currency is then rounded to at most two decimal places; positive sub-cent values display as &lt;$0.01.</p></div></details>
          </div>
        </section>
      </div>

      <section className="border-t border-border bg-muted/25 px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <SectionHeading body="The canonical URL contains every scenario input. CSV retains unavailable values as empty cells rather than coercing them to zero." eyebrow="EXPORT" number="06" title="Export or share this scenario" />
          <Card>
            <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">{calculation === null ? <CircleAlert className="size-4 text-muted-foreground" /> : <CheckCircle2 className="size-4 text-emerald-500" />}{calculation === null ? "Scenario ready to share; calculation unavailable" : "Verified calculation ready to share"}</div>
                <p className="mt-2 max-w-xl text-xs leading-5 text-muted-foreground">Copy the full URL, download a CSV or image of the result, or print the scenario with its assumptions and exact tables.</p>
              </div>
              <ResultActions filename="tokenbench-subscribe-vs-api" includePrint rows={exportRows} targetId="subscription-result" />
            </CardContent>
            <CardFooter className="justify-between gap-3"><Button onClick={reset} size="sm" variant="ghost"><RotateCcw />Reset default scenario</Button><Link className={buttonVariants({ variant: "outline", size: "sm" })} href="/tools/">All decision tools<ArrowRight /></Link></CardFooter>
          </Card>
        </div>
      </section>
    </main>
  );
}
