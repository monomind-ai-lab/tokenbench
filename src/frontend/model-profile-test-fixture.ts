import type { ModelProfileViewModel } from './model-profile-contracts';

const AT = '2026-08-11T18:00:00.000Z';

export function modelProfileViewModelFixture(overrides: Partial<ModelProfileViewModel> = {}): ModelProfileViewModel {
  const viewModel: ModelProfileViewModel = {
    revision: 'rev-2',
    publishedAt: AT,
    freshness: { status: 'fresh', checkedAt: AT },
    attribution: [{ sourceId: 'benchlm', label: 'BenchLM public leaderboard', url: 'https://benchlm.ai/models/gpt-5-6-sol', updatedAt: AT }],
    directory: {
      modelKey: 'benchlm:openai:gpt-5-6-sol', canonicalSlug: 'gpt-5-6-sol', displayName: 'GPT-5.6 Sol', creator: 'OpenAI',
      sourceType: 'Proprietary', reasoningType: 'hybrid', familyId: 'gpt-5-6', variantId: 'sol',
      firstSeenRevision: 'rev-1', firstSeenAt: AT, lastSeenRevision: 'rev-2', lastSeenAt: AT,
      latestProfileRevision: 'rev-2', status: 'current', sourceId: 'benchlm', sourceModelId: 'openai/gpt-5-6-sol', updatedAt: AT,
    },
    profile: {
      identity: {
        modelKey: 'benchlm:openai:gpt-5-6-sol', slug: 'gpt-5-6-sol', displayName: 'GPT-5.6 Sol', creator: 'OpenAI',
        sourceType: 'Proprietary', reasoningType: 'hybrid', familyId: 'gpt-5-6', variantId: 'sol', releaseDate: '2026-08-01',
      },
      revision: { revision: 'rev-2', generatedAt: AT, publishedAt: AT, checkedAt: AT },
      summary: {
        overallScore: 81.48, overallRank: 4, evidenceStatus: 'supported', benchmarkCount: 8,
        coverage: { benchmarkCount: 8, categoryCount: 3, rankedCategoryCount: 2, sourceCount: 2 },
        generatedAt: AT, publishedAt: AT, checkedAt: AT,
        strongestEvidence: 'Public overall score 81.48 at source rank #4.',
        validateBeforeChoosing: 'Validate route pricing and evidence freshness before choosing.',
      },
      radar: [
        { key: 'overall', label: 'Overall', percentile: 90, rank: 4, fieldSize: 31 },
        { key: 'coding', label: 'Coding', percentile: 93.333, rank: 3, fieldSize: 31 },
        { key: 'multimodal', label: 'Multimodal', percentile: null, rank: null, fieldSize: null },
      ],
      categories: [
        { key: 'overall', metricKey: 'benchlm:overall:raw', label: 'Overall', score: 81.48, rawScore: 81, rank: 4, fieldSize: 31, percentile: 90, evidenceStatus: 'supported', benchmarkCount: 8, rankingEligible: true, unit: 'score', sourceId: 'benchlm' },
        { key: 'coding', metricKey: 'benchlm:category:coding', label: 'Coding', score: 77.95, rawScore: null, rank: 3, fieldSize: 31, percentile: 93.333, evidenceStatus: 'supported', benchmarkCount: 8, rankingEligible: true, unit: 'score', sourceId: 'benchlm' },
        { key: 'multimodal', metricKey: 'benchlm:category:multimodal', label: 'Multimodal', score: 61, rawScore: null, rank: null, fieldSize: null, percentile: null, evidenceStatus: 'source_only', benchmarkCount: 1, rankingEligible: false, unit: 'score', sourceId: 'benchlm' },
      ],
      priceRoutes: [{
        sourceId: 'openrouter', providerId: 'openai', routeId: 'openrouter:openai/gpt-5-6-sol', sourceModelId: 'openai/gpt-5-6-sol',
        canonicalSlug: 'gpt-5-6-sol', inputUsdPerMillion: 5, cachedInputUsdPerMillion: null, cacheWriteUsdPerMillion: null, outputUsdPerMillion: 30,
        contextWindowTokens: 400_000, maxInputTokens: null, maxOutputTokens: 32_000,
        inputModalities: ['text', 'image'], outputModalities: ['text'], supportedParameters: ['tools'],
        createdAt: null, expirationDate: null, knowledgeCutoff: null, tokenizer: null,
        instructionFormat: null, isModerated: null, perRequestLimitsJson: null,
        verificationStatus: 'primary', sourceArtifactId: 'openrouter-models', sourceUrl: 'https://openrouter.ai/models/openai/gpt-5-6-sol', observedAt: AT,
      }],
      specifications: {
        contextWindowTokens: 400_000, maxInputTokens: null, maxOutputTokens: 32_000,
        inputModalities: ['text', 'image'], outputModalities: ['text'], supportedParameters: ['tools'],
        releaseDate: '2026-08-01', sourceType: 'Proprietary', selfHostingAvailable: false,
      },
      ledger: [
        { metricKey: 'benchlm:overall:raw', category: 'overall', benchmarkName: 'Overall', displayValue: 81.48, rawValue: 81, unit: 'score', rank: 4, bestVerifiedComparison: null, gap: null, weight: null, evidenceStatus: 'supported', observedAt: AT, sourceId: 'benchlm', sourceArtifactId: 'benchlm-models', sourceUrl: 'https://benchlm.ai/models/gpt-5-6-sol' },
        { metricKey: 'benchlm:category:coding', category: 'coding', benchmarkName: 'Coding', displayValue: 77.95, rawValue: null, unit: 'score', rank: 3, bestVerifiedComparison: null, gap: null, weight: null, evidenceStatus: 'supported', observedAt: AT, sourceId: 'benchlm', sourceArtifactId: 'benchlm-models', sourceUrl: 'https://benchlm.ai/models/gpt-5-6-sol' },
      ],
      comparisons: [{ pairSlug: 'gpt-5-6-sol-vs-alpha', path: '/compare/gpt-5-6-sol-vs-alpha/', indexable: true, eligibilityReason: 'Reviewed comparison', featuredRank: 1, sharedMetricCount: 2 }],
      sources: [
        { sourceId: 'benchlm', artifactId: 'benchlm-models', sourceUrl: 'https://benchlm.ai/models/gpt-5-6-sol', observedAt: AT, attributionText: 'BenchLM public leaderboard' },
        { sourceId: 'openrouter', artifactId: 'openrouter-models', sourceUrl: 'https://openrouter.ai/models/openai/gpt-5-6-sol', observedAt: AT, attributionText: 'OpenRouter route catalog' },
      ],
    },
    selectedRevision: 'rev-2',
    fallback: 'none',
    aliasFrom: null,
  };
  return { ...viewModel, ...overrides };
}
