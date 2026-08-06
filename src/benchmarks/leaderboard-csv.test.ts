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

  it('blocks a formula prefix hidden after a UTF-8 BOM and ASCII controls', () => {
    expect(csvCell('\uFEFF\t=1+1')).toBe("'\uFEFF\t=1+1");
  });

  it('keeps finite numbers numeric while protecting formula-looking strings', () => {
    expect(csvCell(-42)).toBe('-42');
    expect(csvCell('-42')).toBe("'-42");
  });

  it('accepts a cell at the byte cap and rejects the next byte', () => {
    expect(new TextEncoder().encode(csvCell('x'.repeat(65_536))).byteLength).toBe(65_536);
    expect(() => csvCell('x'.repeat(65_537))).toThrow(/CSV cell exceeds/i);
  });

  it('accepts a serialized row at the byte cap and rejects the next byte', () => {
    const rowAtLimit = entry({ modelKey: 'alpha', name: 'Alpha', provider: 'Provider A', score: 90 });
    const wideModel = {
      ...rowAtLimit.model,
      name: 'n'.repeat(65_536),
      creator: 'p'.repeat(65_536),
      modelKey: 'k'.repeat(65_536),
      slug: 's'.repeat(65_446),
    };
    const exact = leaderboardCsv(leaderboardResult('llm-coding', [{ ...rowAtLimit, model: wideModel }]), FILTERS);

    expect(new TextEncoder().encode(exact.split('\r\n')[1] ?? '').byteLength).toBe(262_144);
    expect(() => leaderboardCsv(leaderboardResult('llm-coding', [{
      ...rowAtLimit,
      model: { ...wideModel, slug: `${wideModel.slug}s` },
    }]), FILTERS)).toThrow(/CSV row exceeds/i);
  });

  it('accepts total output at the byte cap and rejects the next byte', () => {
    const header = 'rank,model,provider,evidence_status,score,unit,metric_key,methodology,price_usd_per_million,context_window_tokens,model_key,slug,source_type';
    const targetBytes = 8 * 1024 * 1024;
    const rowAtBytes = (rank: number, bytes: number): LeaderboardEntry => {
      const fixture = entry({ modelKey: `model-${rank}`, name: 'Model', provider: 'Provider', score: 90 });
      let remaining = bytes - 89 - String(rank).length;
      const lengths = [0, 0, 0, 0].map(() => {
        const length = Math.min(65_536, remaining);
        remaining -= length;
        return length;
      });
      const padded = (prefix: string, character: string, length: number) => `${prefix}${character.repeat(length - prefix.length)}`;
      return {
        ...fixture,
        model: {
          ...fixture.model,
          name: 'n'.repeat(lengths[0] ?? 0),
          creator: 'p'.repeat(lengths[1] ?? 0),
          modelKey: padded(`k${String(rank).padStart(2, '0')}`, 'k', lengths[2] ?? 0),
          slug: padded(`m${String(rank).padStart(2, '0')}`, 's', lengths[3] ?? 0),
        },
      };
    };
    const firstRows = Array.from({ length: 31 }, (_, index) => rowAtBytes(index + 1, 262_144));
    const headerBytes = new TextEncoder().encode(header).byteLength;
    const finalRowBytes = targetBytes - headerBytes - 2 - 31 * (262_144 + 2) - 2;
    const lastRow = rowAtBytes(32, finalRowBytes);
    const exact = leaderboardCsv(leaderboardResult('llm-coding', [...firstRows, lastRow]), FILTERS);

    expect(new TextEncoder().encode(exact).byteLength).toBe(targetBytes);
    expect(() => leaderboardCsv(leaderboardResult('llm-coding', [
      ...firstRows,
      { ...lastRow, model: { ...lastRow.model, slug: `${lastRow.model.slug}s` } },
    ]), FILTERS)).toThrow(/CSV output exceeds/i);
  });

  it('uses RFC 4180 quoting without damaging Unicode or embedded newlines', () => {
    expect(csvCell('模型, "quoted"\r\nnext')).toBe('"模型, ""quoted""\r\nnext"');
    expect(csvCell('=HYPERLINK("https://bad")')).toBe('"\'=HYPERLINK(""https://bad"")"');
  });
});
