import { compareUtf8Binary } from '../../../src/benchmarks/contracts';
import {
  CANONICAL_COMPARISON_ROUTE,
  renderComparisonRequest,
} from '../../compare/[pair]';
import type { BenchmarkApiEnv } from '../../_shared/benchmark-db';

export interface CanonicalComparisonPair {
  readonly canonical: string;
  readonly left: string;
  readonly right: string;
  readonly redirected: boolean;
}

/** Stable-slug ordering is shared by selector, redirect, and server rendering. */
export function canonicalComparisonPair(first: string, second: string): CanonicalComparisonPair {
  const [left, right] = [first, second].sort(compareUtf8Binary);
  return {
    canonical: `${left}-vs-${right}`,
    left,
    right,
    redirected: first !== left || second !== right,
  };
}

export async function onRequestGet({
  request,
  env,
  params,
}: {
  request: Request;
  env: BenchmarkApiEnv;
  params?: { pair?: string };
}): Promise<Response> {
  return renderComparisonRequest({ request, env, params }, CANONICAL_COMPARISON_ROUTE);
}
