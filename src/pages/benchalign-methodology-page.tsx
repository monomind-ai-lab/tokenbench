import { publishedBenchAlignMethodVersion, type BenchAlignSourceMetadata } from '../benchmarks/benchalign-metadata';
import { useBenchAlignSourceMetadata } from '../frontend/use-benchmarks';

interface BenchAlignMethodologyPageProps {
  readonly activeSourceMetadata?: BenchAlignSourceMetadata | null;
}

export function BenchAlignMethodologyPage({ activeSourceMetadata }: BenchAlignMethodologyPageProps) {
  const currentSourceMetadata = useBenchAlignSourceMetadata();
  const sourceMetadata = activeSourceMetadata === undefined ? currentSourceMetadata : activeSourceMetadata;

  return <div className="content-stack methodology-page">
    <section className="panel" aria-labelledby="benchalign-methodology-heading">
      <span className="eyebrow">TokenBench methodology</span>
      <h1 id="benchalign-methodology-heading">How BenchAlign rankings work</h1>
      <p>TokenBench republishes BenchLM&apos;s BenchAlign results without recalculating them. <a href="https://benchlm.ai/methodology">Read BenchLM&apos;s methodology</a> for the source method.</p>
    </section>

    <section className="panel" aria-labelledby="benchalign-views-heading">
      <h2 id="benchalign-views-heading">What each view represents</h2>
      <p>Overall, Agentic, and Coding are validated BenchAlign views. Reasoning, Multimodal, and Knowledge are BenchLM-published category evidence lenses, not additional TokenBench rankings.</p>
      <p>Supported rows are source-published results eligible for their exact view. Reviewed estimated rows stay visibly estimated and appear after supported evidence where a route allows them; they are never silently promoted into a validated ranking. Missing measurements remain Unavailable, never zero.</p>
    </section>

    <section className="panel" aria-labelledby="benchalign-metrics-heading">
      <h2 id="benchalign-metrics-heading">Metrics and runtime</h2>
      <p>Weighted metrics affect the relevant BenchAlign method only. Display-only metrics add context without changing the published order. Runtime is a separate signal, not a substitute for capability evidence or a hidden ranking weight.</p>
    </section>

    <section className="panel" aria-labelledby="benchalign-refresh-heading">
      <h2 id="benchalign-refresh-heading">Method and refresh status</h2>
      <p>Published method version: <strong>{publishedBenchAlignMethodVersion(sourceMetadata)}</strong>.</p>
      <p>BenchLM refreshes its source output on its own schedule. TokenBench checks that source once daily within its broader Worker, which runs twice daily; a successful TokenBench check does not claim that BenchLM published a new method or result.</p>
    </section>
  </div>;
}
