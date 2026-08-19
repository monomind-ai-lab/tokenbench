"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

function parseNonNegative(value: string) {
  const next = Number(value);
  return Number.isNaN(next) || next < 0 ? 0 : next;
}
function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 100 ? 2 : 0,
  }).format(value);
}

type FieldProps = {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  className?: string;
  prefix?: string;
  suffix?: string;
  step?: number;
};

function Field({
  id,
  label,
  value,
  onChange,
  className,
  prefix,
  suffix,
  step,
}: FieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="font-medium text-sm" htmlFor={id}>
        {label}
      </Label>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm tabular-nums text-muted-foreground">
            {prefix}
          </span>
        ) : null}
        <Input
          className={cn(
            "h-11 rounded-lg border-0 bg-background tabular-nums shadow-soft",
            prefix && "pl-7",
            suffix && "pr-14",
          )}
          id={id}
          inputMode="decimal"
          min={0}
          onChange={(event) => onChange(parseNonNegative(event.target.value))}
          step={step}
          type="number"
          value={value}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ComparisonBar({
  label,
  value,
  max,
  emphasize,
}: {
  label: string;
  value: number;
  max: number;
  emphasize?: boolean;
}) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 4 : 0) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium tabular-nums">{formatCurrency(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-out",
            emphasize ? "bg-foreground" : "bg-foreground/30",
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function AgentROICalculator() {
  const [requestsPerMonth, setRequestsPerMonth] = useState(100_000);
  const [inputTokensPerRequest, setInputTokensPerRequest] = useState(1_800);
  const [outputTokensPerRequest, setOutputTokensPerRequest] = useState(700);
  const [inputPrice, setInputPrice] = useState(2.5);
  const [outputPrice, setOutputPrice] = useState(10);
  const [cacheHitRate, setCacheHitRate] = useState(30);

  const calculations = useMemo(() => {
    const inputTokens = requestsPerMonth * inputTokensPerRequest;
    const outputTokens = requestsPerMonth * outputTokensPerRequest;
    const uncachedInputCost = (inputTokens / 1_000_000) * inputPrice;
    const cacheDiscount = uncachedInputCost * (cacheHitRate / 100) * 0.5;
    const outputCost = (outputTokens / 1_000_000) * outputPrice;
    const monthlyWithoutCache = uncachedInputCost + outputCost;
    const monthlyCost = monthlyWithoutCache - cacheDiscount;

    return {
      inputTokens,
      outputTokens,
      cacheDiscount,
      monthlyWithoutCache,
      monthlyCost,
      annualCost: monthlyCost * 12,
    };
  }, [requestsPerMonth, inputTokensPerRequest, outputTokensPerRequest, inputPrice, outputPrice, cacheHitRate]);

  const formatTokens = (value: number) =>
    value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(value >= 100_000_000 ? 0 : 1)}M`
      : `${Math.round(value / 1000)}K`;

  return (
    <div className="bg-muted p-4 sm:p-8">
      <div className="mx-auto max-w-xl">
        <header className="flex animate-rise-in flex-col items-center gap-3 text-center">
          <p className="text-xs text-muted-foreground">Workload calculator</p>
          <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            See what the workload costs
          </h2>
          <p className="text-balance text-sm text-muted-foreground sm:text-base">
            Adjust tokens and source prices. Monthly API spend updates live.
          </p>
        </header>

        <div className="mt-10 flex animate-rise-in flex-col overflow-hidden rounded-[2rem] bg-card shadow-soft sm:mt-12" style={{ animationDelay: "80ms" }}>
          <div className="px-6 pb-2 pt-8 text-center sm:px-8 sm:pt-10">
            <p className="text-sm text-muted-foreground">Estimated monthly API cost</p>
            <p className="mt-2 font-mono text-4xl tabular-nums tracking-tight sm:text-5xl">
              {formatCurrency(calculations.monthlyCost)}
            </p>
            <p className="mt-3 text-sm tabular-nums text-muted-foreground">
              {formatCurrency(calculations.annualCost)} annualized
            </p>
            <div className="mt-4">
              <span className="inline-flex rounded-md bg-muted px-2.5 py-1 text-sm font-medium tabular-nums text-muted-foreground">
                {cacheHitRate}% cache hit rate
              </span>
            </div>
          </div>

          <div className="space-y-5 px-6 pt-8 sm:px-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field className="sm:col-span-2" id="requests-per-month" label="Requests / month" onChange={setRequestsPerMonth} value={requestsPerMonth} />
              <Field id="input-tokens" label="Input tokens / request" onChange={setInputTokensPerRequest} suffix="tokens" value={inputTokensPerRequest} />
              <Field id="output-tokens" label="Output tokens / request" onChange={setOutputTokensPerRequest} suffix="tokens" value={outputTokensPerRequest} />
              <Field id="input-price" label="Input price / 1M" onChange={setInputPrice} prefix="$" step={0.01} value={inputPrice} />
              <Field id="output-price" label="Output price / 1M" onChange={setOutputPrice} prefix="$" step={0.01} value={outputPrice} />
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <Label className="text-sm font-medium" htmlFor="cache-hit-rate">Cache hit rate</Label>
                <span className="text-sm font-medium tabular-nums">{cacheHitRate}%</span>
              </div>
              <Slider
                aria-label="Cache hit rate"
                className="**:data-[slot=slider-thumb]:border-foreground **:data-[slot=slider-range]:bg-foreground"
                id="cache-hit-rate"
                max={100}
                min={0}
                onValueChange={(value) => setCacheHitRate((Array.isArray(value) ? value[0] : value) ?? 0)}
                step={1}
                value={[cacheHitRate]}
              />
              <div className="flex justify-between text-xs tabular-nums text-muted-foreground"><span>0%</span><span>100%</span></div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 px-6 sm:grid-cols-3 sm:px-8">
            {[
              ["Input volume", formatTokens(calculations.inputTokens)],
              ["Output volume", formatTokens(calculations.outputTokens)],
              ["Cache savings", formatCurrency(calculations.cacheDiscount)],
            ].map(([label, value]) => (
              <div className="rounded-lg bg-muted px-4 py-3 text-center" key={label}>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-base font-semibold tabular-nums tracking-tight">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-4 px-6 sm:px-8">
            <p className="text-sm font-medium text-foreground">Monthly cost</p>
            <div className="space-y-4 rounded-lg bg-muted/60 p-4">
              <ComparisonBar label="Without caching" max={calculations.monthlyWithoutCache} value={calculations.monthlyWithoutCache} />
              <ComparisonBar emphasize label="With caching" max={calculations.monthlyWithoutCache} value={calculations.monthlyCost} />
            </div>
          </div>

          <div className="mt-auto px-6 pb-6 pt-10 sm:px-8 sm:pb-8">
            <Button className="w-full rounded-full" size="lg" type="button">Compare subscription plans</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
