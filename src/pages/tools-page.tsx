import { ArrowRight, CircleDollarSign } from 'lucide-react';
import { ROUTE_PATHS } from '../routing/routes';

export function ToolsPage() {
  return (
    <div className="content-stack tools-page">
      <section className="panel tools-hero" aria-labelledby="tools-heading">
        <span className="eyebrow">TokenBench tools</span>
        <h1 id="tools-heading">AI cost decision tools</h1>
        <p className="muted">Use observed workload inputs and explicit provider evidence to decide whether a paid subscription or API route deserves a closer look.</p>
      </section>

      <section className="tools-directory-section" aria-labelledby="available-tools-heading">
        <div className="panel-heading"><div><span className="eyebrow">Available now</span><h2 id="available-tools-heading">Start with the costs you can verify</h2></div></div>
        <div className="tools-directory-grid" role="list" aria-label="Available TokenBench tools">
          <article className="panel" role="listitem">
            <CircleDollarSign aria-hidden="true" size={24} />
            <h3>Subscription vs. API calculator</h3>
            <p className="muted">Compare an individual subscription with a selected provider, plan, model mix, input/output ratio, and expected monthly token volume. Unpublished capacity remains explicit rather than being converted into a synthetic limit.</p>
            <a className="button" href={ROUTE_PATHS.calculator}>Open subscription vs. API calculator <ArrowRight aria-hidden="true" size={16} /></a>
          </article>
        </div>
      </section>
    </div>
  );
}
