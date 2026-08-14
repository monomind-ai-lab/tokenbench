import type { LeaderboardEntry } from './leaderboards';
import type { LeaderboardKey } from '../routing/routes';

export const V21_LEADERBOARD_SLUGS = [
  'overall', 'coding', 'agentic', 'math', 'reasoning', 'multimodal', 'sla', 'custom',
] as const;

export type V21LeaderboardSlug = typeof V21_LEADERBOARD_SLUGS[number];

export interface V21LeaderboardDefinition {
  readonly slug: V21LeaderboardSlug;
  readonly label: string;
  readonly definition: string;
  readonly version: string;
  readonly legacyKey: LeaderboardKey | null;
  readonly unavailableMessage: string;
}

/**
 * The V2.1 facade is deliberately a map over exact, already-published source
 * lenses. It never combines nearby category scores to fill a missing lens.
 */
export const V21_LEADERBOARDS = [
  {
    slug: 'overall', label: 'Overall', definition: 'Published BenchLM overall capability score.', version: 'BenchLM', legacyKey: 'llm-overall',
    unavailableMessage: 'Unavailable until comparable published evidence is available.',
  },
  {
    slug: 'coding', label: 'Coding', definition: 'Published BenchLM coding capability score.', version: 'BenchLM', legacyKey: 'llm-coding',
    unavailableMessage: 'Unavailable until comparable published evidence is available.',
  },
  {
    slug: 'agentic', label: 'Agentic', definition: 'Published BenchLM agentic capability score.', version: 'BenchLM', legacyKey: 'llm-agentic',
    unavailableMessage: 'Unavailable until comparable published evidence is available.',
  },
  {
    slug: 'math', label: 'Math', definition: 'A comparable published mathematics metric when one is available.', version: 'BenchLM', legacyKey: null,
    unavailableMessage: 'Unavailable until comparable published evidence is available.',
  },
  {
    slug: 'reasoning', label: 'Reasoning', definition: 'Published BenchLM reasoning evidence lens.', version: 'BenchLM', legacyKey: 'llm-reasoning',
    unavailableMessage: 'Unavailable until comparable published evidence is available.',
  },
  {
    slug: 'multimodal', label: 'Multimodal', definition: 'Published BenchLM multimodal evidence lens.', version: 'BenchLM', legacyKey: 'multimodal-vision-documents',
    unavailableMessage: 'Unavailable until comparable published evidence is available.',
  },
  {
    slug: 'sla', label: 'SLA', definition: 'Service-level evidence from published provider commitments.', version: 'Provider evidence', legacyKey: null,
    unavailableMessage: 'Unavailable until comparable published evidence is available.',
  },
  {
    slug: 'custom', label: 'Custom', definition: 'A saved evaluation for a specific workload.', version: 'Your evaluation', legacyKey: null,
    unavailableMessage: 'Build a custom evaluation to compare models for your workload.',
  },
] as const satisfies readonly V21LeaderboardDefinition[];

export const V21_OVERVIEW_LEADERBOARDS = V21_LEADERBOARDS.filter((definition) => definition.slug !== 'custom');

export function v21Leaderboard(slug: string): V21LeaderboardDefinition | null {
  return V21_LEADERBOARDS.find((definition) => definition.slug === slug) ?? null;
}

export function v21LeaderboardForLegacyKey(key: LeaderboardKey): V21LeaderboardDefinition | null {
  return V21_LEADERBOARDS.find((definition) => definition.legacyKey === key) ?? null;
}

export function buildTopEntries(entries: readonly LeaderboardEntry[], limit = 20): readonly LeaderboardEntry[] {
  const boundedLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : 20;
  return entries
    .filter((entry) => entry.metric !== null && Number.isFinite(entry.metric.value))
    .slice(0, boundedLimit);
}

export interface V21CategoryView {
  readonly definition: V21LeaderboardDefinition;
  readonly availability: 'available' | 'unavailable';
  readonly entries: readonly LeaderboardEntry[];
}

/** Returns an explicit unavailable state instead of substituting a nearby score. */
export function categoryViewFor(slug: V21LeaderboardSlug, entries: readonly LeaderboardEntry[]): V21CategoryView {
  const definition = v21Leaderboard(slug);
  if (!definition) throw new Error(`Unknown V2.1 leaderboard category: ${slug}`);
  const topEntries = definition.legacyKey === null ? [] : buildTopEntries(entries);
  return {
    definition,
    availability: topEntries.length > 0 ? 'available' : 'unavailable',
    entries: topEntries,
  };
}
