"use client";

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { useEffect, useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";

ChartJS.register(BarElement, CategoryScale, Legend, LinearScale, Tooltip);

type TableData = Readonly<{
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}>;

const framing: TableData = {
  caption: "Evidence framing table",
  columns: ["Statement", "Type", "What to verify"],
  rows: [
    ["Request mix changes the blended monthly cost.", "Derived relationship", "Input/output mix and host prices"],
    ["A high-capability lane is worth its cost for complex work.", "Interpretation", "Acceptance rate, recovery cost, human review"],
    ["Illustrative scenario: 70/30 routine/complex split.", "Prototype fixture", "Replace with production telemetry"],
  ],
};

const routingMatrix: TableData = {
  caption: "Architecture decision matrix",
  columns: ["Condition", "Preferred route", "Guardrail"],
  rows: [
    ["Multi-file change, unclear acceptance criteria", "Capability lane", "Human review on sampled completions"],
    ["Stable extraction, bounded output", "Economy lane", "Schema validation and fallback"],
    ["Latency breach or provider incident", "Fallback lane", "Circuit breaker and event log"],
  ],
};

const accessOptions: TableData = {
  caption: "Official free-access options and limits to verify",
  columns: ["Service", "What the free option provides", "Limit to verify"],
  rows: [
    ["Gemini API", "A free tier with selected model access and free input/output usage under published limits.", "Model quotas, supported regions, and free-tier data-use terms vary."],
    ["Groq", "A published free-plan rate-limit table for supported models.", "Limits apply at the organization level and vary by model."],
    ["OpenRouter", "A free plan with free models and a free-model router.", "Daily request limits and model availability are intentionally constrained."],
    ["GitHub Models", "Free, rate-limited model access for prototyping and experimentation with a GitHub account.", "Limits vary by model and plan; enabling paid usage changes the budget model."],
    ["Cloudflare Workers AI", "A daily allocation measured in Neurons for serverless AI inference.", "Neurons are model-dependent compute units, not a universal token allowance."],
  ],
};

const costMetrics: TableData = {
  caption: "Cost-control measurement table",
  columns: ["Metric", "Why it matters"],
  rows: [
    ["Cost per successful task", "Includes retries and quality failures that token price misses."],
    ["Cache hit rate", "Shows whether write premiums are being amortized."],
    ["Escalation rate", "Reveals whether a lower-cost first model is actually efficient."],
    ["P95 latency", "Protects the user experience during routing changes."],
    ["Human review minutes", "Captures cost shifted from inference to people."],
  ],
};

function EvidenceTable({ table }: { table: TableData }) {
  return (
    <div className="mt-6">
      <div className="grid gap-3 md:hidden">
        {table.rows.map((row, rowIndex) => (
          <dl className="rounded-xl border border-border bg-card p-4" key={`${table.caption}-${rowIndex}`}>
            {table.columns.map((column, columnIndex) => (
              <div className="grid gap-1 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0" key={column}>
                <dt className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">{column}</dt>
                <dd className="text-sm leading-6">{row[columnIndex]}</dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
      <div aria-label={table.caption} className="hidden overflow-x-auto rounded-xl border border-border md:block" role="region" tabIndex={0}>
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{table.caption}</caption>
          <thead className="bg-muted/60 text-xs text-muted-foreground"><tr>{table.columns.map((column) => <th className="px-4 py-3 font-medium" key={column}>{column}</th>)}</tr></thead>
          <tbody>{table.rows.map((row, rowIndex) => <tr className="border-t border-border" key={`${table.caption}-${rowIndex}`}>{row.map((value, columnIndex) => <td className="px-4 py-3 align-top leading-6" key={`${columnIndex}-${value}`}>{value}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function HybridCostChart() {
  const [dark, setDark] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { setDark(root.classList.contains("dark")); setReducedMotion(motion.matches); };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    motion.addEventListener("change", sync);
    return () => { observer.disconnect(); motion.removeEventListener("change", sync); };
  }, []);
  const data = useMemo(() => ({
    labels: ["Single premium lane", "Hybrid with review", "Single economy lane"],
    datasets: [{ label: "Illustrative monthly index", data: [100, 62, 41], backgroundColor: ["#1111ff", "#5489d6", "#9dabff"], borderRadius: 6 }],
  }), []);
  const options = useMemo<ChartOptions<"bar">>(() => ({
    animation: reducedMotion ? false : { duration: 400 },
    indexAxis: "y",
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { displayColors: false } },
    responsive: true,
    scales: {
      x: { beginAtZero: true, grid: { color: dark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)" }, ticks: { color: dark ? "#a1a1aa" : "#71717a" }, title: { color: dark ? "#a1a1aa" : "#71717a", display: true, text: "Illustrative monthly cost index" } },
      y: { grid: { display: false }, ticks: { color: dark ? "#fafafa" : "#18181b" } },
    },
  }), [dark, reducedMotion]);
  return <div aria-label="Illustrative horizontal routing cost comparison" className="mt-6 h-[260px]" role="img"><Bar data={data} options={options} /><p className="sr-only">Single premium lane index 100, hybrid with review 62, and single economy lane 41.</p></div>;
}

function HybridBlocks() {
  return (
    <div className="mt-12 space-y-12">
      <section aria-labelledby="article-evidence-framing"><p className="font-mono text-xs text-muted-foreground">EXACT DECISION AID</p><h2 className="mt-2 text-2xl font-semibold" id="article-evidence-framing">Separate facts, derived relationships, and interpretation</h2><p className="mt-4 text-base leading-8 text-muted-foreground">Keep prototype fixtures and editorial judgment visibly separate from observed prices, service measurements, and production outcomes.</p><EvidenceTable table={framing} /></section>
      <section aria-labelledby="article-routing-policies"><p className="font-mono text-xs text-muted-foreground">ILLUSTRATIVE CHART</p><h2 className="mt-2 text-2xl font-semibold" id="article-routing-policies">Compare routing policies on the same cost basis</h2><p className="mt-4 text-base leading-8 text-muted-foreground">This chart demonstrates how three policies can be reviewed. It does not report live prices, measured savings, or a recommended production split.</p><HybridCostChart /><details className="mt-5 rounded-xl border border-border bg-card p-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring">Exact illustrative values</summary><EvidenceTable table={{ caption: "Exact illustrative routing cost values", columns: ["Policy", "Monthly index"], rows: [["Single premium lane", "100"], ["Hybrid with review", "62"], ["Single economy lane", "41"]] }} /></details></section>
      <section aria-labelledby="article-routing-matrix"><p className="font-mono text-xs text-muted-foreground">GUARDRAIL MATRIX</p><h2 className="mt-2 text-2xl font-semibold" id="article-routing-matrix">Choose the route and its guardrail together</h2><EvidenceTable table={routingMatrix} /></section>
    </div>
  );
}

export function ArticleEvidenceBlocks({ slug }: { slug: string }) {
  if (slug === "hybrid-router") return <HybridBlocks />;
  if (slug === "legitimate-free-ai-api-access-credits") return <section aria-labelledby="article-free-access-table" className="mt-12"><p className="font-mono text-xs text-muted-foreground">EXACT REVIEW TABLE</p><h2 className="mt-2 text-2xl font-semibold" id="article-free-access-table">Compare official access options</h2><p className="mt-4 text-sm leading-6 text-muted-foreground">Terms change. Treat these entries as a review checklist and verify each current provider page before choosing a production dependency.</p><EvidenceTable table={accessOptions} /></section>;
  if (slug === "reduce-llm-api-costs-caching-batch-output-limits") return <section aria-labelledby="article-cost-metrics" className="mt-12"><p className="font-mono text-xs text-muted-foreground">MEASUREMENT TABLE</p><h2 className="mt-2 text-2xl font-semibold" id="article-cost-metrics">Measure savings beyond token price</h2><EvidenceTable table={costMetrics} /></section>;
  return null;
}
