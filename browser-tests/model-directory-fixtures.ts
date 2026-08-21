import type { ModelDirectoryEntry, ModelDirectoryEnvelope } from '../src/frontend/model-directory-contracts';
import { filterModelDirectoryEntries, type ModelDirectoryQueryState } from '../src/frontend/model-directory-state';
import type { ModelProfileViewModel } from '../src/frontend/model-profile-contracts';
import { modelProfileViewModelFixture } from '../src/frontend/model-profile-test-fixture';

const AT = '2026-08-11T18:00:00.000Z';
const WEEK_START = '2026-08-10T00:00:00.000Z';
const REVISION = 'local-model-directory-r1';

function directoryEntry(index: number): ModelDirectoryEntry {
  const isGpt = index === 1;
  const canonicalSlug = isGpt ? 'gpt-5-6-sol' : `sample-model-${String(index).padStart(3, '0')}`;
  const displayName = isGpt ? 'GPT-5.6 Sol' : `Sample Model ${index}`;
  const modelKey = isGpt ? 'benchlm:openai:gpt-5-6-sol' : `benchlm:sample:model-${index}`;
  const creator = isGpt ? 'OpenAI' : index % 2 === 0 ? 'LOCAL SAMPLE Labs' : 'Fixture Research';
  const weeklyRank = index <= 100 ? index : null;
  const overallScore = isGpt ? 81.48 : Math.max(40, 92 - index / 2);
  const categoryRank = weeklyRank;
  const categoryFieldSize = weeklyRank === null ? null : 100;
  const categoryPercentile = weeklyRank === null ? null : 100 * (100 - weeklyRank) / 99;
  const categories = [
    {
      key: 'overall',
      metricKey: 'benchlm:overall:raw',
      label: 'Overall',
      score: overallScore,
      rawScore: null,
      rank: categoryRank,
      fieldSize: categoryFieldSize,
      percentile: categoryPercentile,
      evidenceStatus: 'supported' as const,
      benchmarkCount: 8,
      rankingEligible: true,
      unit: 'score' as const,
      sourceId: 'benchlm' as const,
    },
    {
      key: 'coding',
      metricKey: 'benchlm:category:coding',
      label: 'Coding',
      score: isGpt ? 77.95 : Math.max(35, 91 - index / 2),
      rawScore: null,
      rank: categoryRank,
      fieldSize: categoryFieldSize,
      percentile: categoryPercentile,
      evidenceStatus: 'supported' as const,
      benchmarkCount: 8,
      rankingEligible: true,
      unit: 'score' as const,
      sourceId: 'benchlm' as const,
    },
  ];
  return {
    modelKey,
    canonicalSlug,
    displayName,
    creator,
    sourceType: index % 7 === 0 ? 'Open Weight' : 'Proprietary',
    reasoningType: isGpt ? 'hybrid' : null,
    familyId: isGpt ? 'gpt-5-6' : null,
    variantId: isGpt ? 'sol' : null,
    firstSeenRevision: REVISION,
    firstSeenAt: AT,
    lastSeenRevision: REVISION,
    lastSeenAt: AT,
    latestProfileRevision: REVISION,
    status: 'current',
    sourceId: 'benchlm',
    sourceModelId: isGpt ? 'openai/gpt-5-6-sol' : `sample/model-${index}`,
    updatedAt: AT,
    weeklyRank,
    overallScore,
    overallRank: weeklyRank,
    categories,
    strongestCategory: categories[1]!,
    representativePrice: {
      sourceId: 'openrouter',
      providerId: isGpt ? 'openai' : 'local-sample',
      routeId: `openrouter:${canonicalSlug}`,
      sourceModelId: isGpt ? 'openai/gpt-5-6-sol' : `sample/model-${index}`,
      canonicalSlug,
      inputUsdPerMillion: isGpt ? 5 : 0.5 + index / 100,
      cachedInputUsdPerMillion: null,
      cacheWriteUsdPerMillion: null,
      outputUsdPerMillion: isGpt ? 30 : 2 + index / 50,
      contextWindowTokens: 128_000,
      maxInputTokens: 120_000,
      maxOutputTokens: 8_000,
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportedParameters: ['tools'],
      createdAt: null,
      expirationDate: null,
      knowledgeCutoff: null,
      tokenizer: null,
      instructionFormat: null,
      isModerated: null,
      perRequestLimitsJson: null,
      verificationStatus: 'primary',
      sourceArtifactId: 'local-sample-openrouter',
      sourceUrl: `https://openrouter.ai/models/${canonicalSlug}`,
      observedAt: AT,
    },
    evidenceStatus: 'supported',
    profileRevision: REVISION,
    profileFallback: 'none',
    profilePublishedAt: AT,
    profileCheckedAt: AT,
  };
}

const CURRENT_ENTRIES = Array.from({ length: 101 }, (_, index) => directoryEntry(index + 1));

const RETAINED_ENTRY: ModelDirectoryEntry = {
  ...directoryEntry(101),
  modelKey: 'benchlm:fixture:retained',
  canonicalSlug: 'retained-fixture',
  displayName: 'Retained Fixture',
  creator: 'Archive Lab',
  sourceModelId: 'fixture/retained',
  latestProfileRevision: 'local-retained-r1',
  status: 'archived',
  overallScore: 72.25,
  overallRank: null,
  categories: [],
  strongestCategory: null,
  representativePrice: null,
  evidenceStatus: 'source_only',
  profileRevision: 'local-retained-r1',
  profileFallback: 'prior-profile',
};

export const LOCAL_MODEL_DIRECTORY_ENTRIES = [...CURRENT_ENTRIES, RETAINED_ENTRY] as const;

export function localModelDirectoryEnvelope(
  query: ModelDirectoryQueryState,
  limit = 100,
): ModelDirectoryEnvelope {
  const filtered = filterModelDirectoryEntries(LOCAL_MODEL_DIRECTORY_ENTRIES, query);
  return {
    revision: REVISION,
    publishedAt: AT,
    freshness: {
      status: 'fresh',
      checkedAt: AT,
      message: 'LOCAL SAMPLE PREVIEW — synthetic durable model profiles for release verification only.',
    },
    attribution: [
      { sourceId: 'benchlm', label: 'LOCAL SAMPLE BenchLM model order', url: 'https://benchlm.ai/', updatedAt: AT },
      { sourceId: 'openrouter', label: 'LOCAL SAMPLE OpenRouter routes', url: 'https://openrouter.ai/models', updatedAt: AT },
    ],
    data: {
      week: {
        weekStart: WEEK_START,
        benchmarkRevision: REVISION,
        sourceSnapshotId: 'local-model-directory-snapshot',
        methodologyVersion: 'bench-align-v5',
        generatedAt: AT,
      },
      models: filtered.slice(0, limit),
      nextCursor: filtered.length > limit ? 'local_more_models' : null,
    },
  };
}

function currentProfile(): ModelProfileViewModel {
  const base = modelProfileViewModelFixture();
  const primary = base.profile.priceRoutes[0]!;
  return {
    ...base,
    profile: {
      ...base.profile,
      priceRoutes: [
        primary,
        {
          ...primary,
          providerId: 'openai-direct',
          routeId: 'direct:openai/gpt-5-6-sol',
          inputUsdPerMillion: 4.5,
          outputUsdPerMillion: 28,
          verificationStatus: 'conflict',
          sourceId: 'benchlm',
          sourceArtifactId: 'benchlm-direct-pricing',
          sourceUrl: 'https://benchlm.ai/models/gpt-5-6-sol',
        },
      ],
    },
  };
}

function retainedProfile(): ModelProfileViewModel {
  const base = modelProfileViewModelFixture();
  const revision = 'local-retained-r1';
  const modelKey = RETAINED_ENTRY.modelKey;
  const slug = RETAINED_ENTRY.canonicalSlug;
  return {
    ...base,
    revision,
    publishedAt: AT,
    freshness: {
      status: 'stale',
      checkedAt: AT,
      message: 'Showing the prior valid durable profile because the latest snapshot did not validate.',
    },
    attribution: [{ sourceId: 'benchlm', label: 'Retained LOCAL SAMPLE evidence', url: 'https://benchlm.ai/', updatedAt: AT }],
    directory: {
      ...RETAINED_ENTRY,
      latestProfileRevision: revision,
    },
    profile: {
      ...base.profile,
      identity: {
        ...base.profile.identity,
        modelKey,
        slug,
        displayName: RETAINED_ENTRY.displayName,
        creator: RETAINED_ENTRY.creator,
        reasoningType: null,
        familyId: null,
        variantId: null,
      },
      revision: { revision, generatedAt: AT, publishedAt: AT, checkedAt: AT },
      summary: {
        ...base.profile.summary,
        overallScore: RETAINED_ENTRY.overallScore,
        overallRank: null,
        evidenceStatus: 'source_only',
        strongestEvidence: 'Latest valid retained source score 72.25.',
        validateBeforeChoosing: 'This archived model is retained for historical comparison only.',
      },
      radar: [
        { key: 'overall', label: 'Overall', percentile: null, rank: null, fieldSize: null },
        { key: 'coding', label: 'Coding', percentile: null, rank: null, fieldSize: null },
      ],
      categories: [{
        ...base.profile.categories[0]!,
        score: 72.25,
        rawScore: null,
        rank: null,
        fieldSize: null,
        percentile: null,
        evidenceStatus: 'source_only',
        rankingEligible: false,
      }],
      priceRoutes: [],
      comparisons: [],
      ledger: [{
        ...base.profile.ledger[0]!,
        displayValue: 72.25,
        rawValue: null,
        rank: null,
        evidenceStatus: 'source_only',
        sourceUrl: 'https://benchlm.ai/',
      }],
      sources: [{ sourceId: 'benchlm', artifactId: 'retained-local-sample', sourceUrl: 'https://benchlm.ai/', observedAt: AT, attributionText: 'Retained LOCAL SAMPLE evidence' }],
    },
    selectedRevision: revision,
    fallback: 'prior-profile',
    aliasFrom: null,
  };
}

const PROFILE_BY_SLUG = new Map<string, ModelProfileViewModel>([
  ['gpt-5-6-sol', currentProfile()],
  ['retained-fixture', retainedProfile()],
]);

export const LOCAL_MODEL_SLUG_ALIASES = new Map<string, string>([['legacy-sol', 'gpt-5-6-sol']]);

export function localModelProfile(slug: string): ModelProfileViewModel | null {
  return PROFILE_BY_SLUG.get(slug) ?? null;
}
