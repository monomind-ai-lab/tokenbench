import { trackTokenBenchEvent, type TokenBenchEventDetail } from './analytics';

export interface EditorialCtaProps {
  readonly eligible: boolean;
  readonly route: string;
  readonly precedingAction: TokenBenchEventDetail['editorial_cta_clicked']['precedingAction'];
  readonly subjectId?: string;
  readonly variant?: TokenBenchEventDetail['editorial_cta_clicked']['variant'];
}

export function EditorialCta({ eligible, route, precedingAction, subjectId, variant = 'contextual' }: EditorialCtaProps) {
  if (!eligible) return null;

  const onClick = () => trackTokenBenchEvent('editorial_cta_clicked', {
    route, precedingAction, ...(subjectId ? { subjectId } : {}), variant,
  });

  return <aside className="editorial-cta panel" aria-label="MonoMind AI Lab editorial CTA">
    <p className="eyebrow">MonoMind AI Lab</p>
    <h2>Turn this evidence into a deployment plan</h2>
    <p>Get a focused review of model, cost, and evaluation trade-offs for your production constraints.</p>
    <a className="button" href="https://monomind.ai/" onClick={onClick}>Talk to MonoMind AI Lab</a>
  </aside>;
}
