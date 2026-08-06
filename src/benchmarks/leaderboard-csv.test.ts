import { describe, expect, it } from 'vitest';
import { LEADERBOARD_DEFINITIONS, type LeaderboardEntry, type LeaderboardResult } from './leaderboards';
import type { LeaderboardQueryState } from './leaderboard-query';
import { csvCell, leaderboardCsv } from './leaderboard-csv';

const FILTERS: LeaderboardQueryState = {
  query: '',
  profile: 'balanced',
  priceMode: 'representative',
  metricKey: null,
  sort: 'score-desc',
  providers: [],
  sourceTypes: [],
  evidence: null,
  priceMinimum: null,
  priceMaximum: null,
  includeEstimated: true,
};

function entry({
  modelKey,
  name,
  provider,
  score,
  evidenceStatus = 'supported',
}: {
  readonly modelKey: string;
  readonly name: string;
  readonly provider: string;
  readonly score: number;
  readonly evidenceStatus?: 'supported' | 'estimated';
}): LeaderboardEntry {
  const metric = {
    modelKey,
    metricKey: 'benchlm:category:coding',
    category: 'coding',
    value: score,
    rank: null,
    lower: null,
    upper: null,
    voteCount: null,
    unit: 'score' as const,
    sourceId: 'benchlm' as const,
    sourceUpdatedAt: '2026-08-06T00:00:00.000Z',
    sourceModelId: modelKey,
    sourceArtifactId: 'benchlm-coding',
    rankingEligible: evidenceStatus === 'supported',
    methodology: 'benchlm_raw_composite' as const,
    observationCount: null,
    sessionCount: null,
  };
  return {
    model: {
      modelKey,
      slug: modelKey,
      name,
      creator: provider,
      sourceType: 'Proprietary',
      reasoningType: null,
      releaseDate: null,
      contextWindowTokens: 128_000,
      evidenceStatus,
      rankingEligible: evidenceStatus === 'supported',
      confidenceLower: null,
      confidenceUpper: null,
      benchmarkCount: 1,
      sourceId: 'benchlm',
      sourceModelId: modelKey,
      sourceArtifactId: 'benchlm-models',
    },
    metric,
    metrics: [metric],
    primaryPrice: evidenceStatus === 'estimated' ? null : {
      modelKey,
      sourceId: 'openrouter',
      providerId: 'openrouter',
      inputUsdPerMillion: 1,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: 5,
      contextWindowTokens: 128_000,
      verificationStatus: 'primary',
      routeId: `openrouter:${modelKey}`,
      sourceModelId: modelKey,
      canonicalSlug: modelKey,
      maxInputTokens: null,
      maxOutputTokens: null,
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportedParameters: null,
      sourceArtifactId: 'openrouter-models',
    },
    blendedCostPerMillion: evidenceStatus === 'estimated' ? null : 3,
    contextWindowTokens: 128_000,
    sourceRank: null,
    onValueFrontier: false,
  };
}

function leaderboardResult(
  key: keyof typeof LEADERBOARD_DEFINITIONS,
  entries: readonly LeaderboardEntry[],
): LeaderboardResult {
  return {
    key,
    profile: 'balanced',
    definition: LEADERBOARD_DEFINITIONS[key],
    entries,
  };
}

describe('leaderboard CSV', () => {
  it('serializes the complete active order with ranked and estimated rows', () => {
    const csv = leaderboardCsv(leaderboardResult('llm-coding', [
      entry({ modelKey: 'estimate', name: 'Estimated model', provider: 'Provider B', score: 99, evidenceStatus: 'estimated' }),
      entry({ modelKey: 'alpha', name: 'Alpha', provider: 'Provider A', score: 90 }),
    ]), FILTERS);

    expect(csv).toBe([
      'rank,model,provider,evidence_status,score,unit,metric_key,methodology,price_usd_per_million,context_window_tokens,model_key,slug,source_type',
      '1,Alpha,Provider A,supported,90,score,benchlm:category:coding,benchlm_raw_composite,3,128000,alpha,alpha,Proprietary',
      ',Estimated model,Provider B,estimated,99,score,benchlm:category:coding,benchlm_raw_composite,,128000,estimate,estimate,Proprietary',
      '',
    ].join('\r\n'));
  });

  it('uses a stable semantic schema for every leaderboard kind', () => {
    const entryFixture = entry({ modelKey: 'alpha', name: 'Alpha', provider: 'Provider A', score: 90 });
    const header = (key: keyof typeof LEADERBOARD_DEFINITIONS) => leaderboardCsv(leaderboardResult(key, [entryFixture]), FILTERS).split('\r\n')[0];

    expect(header('llm-human-preference')).toBe(
      'rank,model,provider,evidence_status,score,unit,metric_key,methodology,source_rank,price_usd_per_million,context_window_tokens,model_key,slug,source_type',
    );
    expect(header('llm-value')).toBe(
      'rank,model,provider,evidence_status,score,unit,metric_key,methodology,value_frontier,workload_profile,price_usd_per_million,input_usd_per_million,output_usd_per_million,context_window_tokens,route_id,model_key,slug,source_type',
    );
    expect(header('llm-pricing-context')).toBe(
      'rank,model,provider,evidence_status,workload_profile,route_id,input_usd_per_million,cached_input_usd_per_million,output_usd_per_million,price_usd_per_million,context_window_tokens,model_key,slug,source_type',
    );
    expect(header('multimodal-vision-documents')).toBe(
      'rank,model,provider,evidence_status,score,unit,metric_key,methodology,source_rank,benchlm_category_multimodal_score,benchlm_category_multimodal_unit,benchlm_category_multimodal_methodology,benchlm_category_multimodal_source_rank,lmarena_vision_style_control_overall_score,lmarena_vision_style_control_overall_unit,lmarena_vision_style_control_overall_methodology,lmarena_vision_style_control_overall_source_rank,lmarena_document_style_control_overall_score,lmarena_document_style_control_overall_unit,lmarena_document_style_control_overall_methodology,lmarena_document_style_control_overall_source_rank,price_usd_per_million,context_window_tokens,model_key,slug,source_type',
    );
  });

  it('makes nullable values empty and blocks formula prefixes after whitespace or controls', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell(' \t@SUM(A1:A2)')).toBe("' \t@SUM(A1:A2)");
    expect(csvCell('\u001f-42')).toBe("'\u001f-42");
  });

  it('uses RFC 4180 quoting without damaging Unicode or embedded newlines', () => {
    expect(csvCell('模型, "quoted"\r\nnext')).toBe('"模型, ""quoted""\r\nnext"');
    expect(csvCell('=HYPERLINK("https://bad")')).toBe('"\'=HYPERLINK(""https://bad"")"');
  });
});
