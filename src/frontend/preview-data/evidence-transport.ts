import comparisonEvidence from '../../../contracts/ui-data-contract/v1/evidence/responses/comparison.json' with { type: 'json' };
import lifecycleEvidence from '../../../contracts/ui-data-contract/v1/evidence/responses/lifecycle.json' with { type: 'json' };
import modelsEvidence from '../../../contracts/ui-data-contract/v1/evidence/responses/models.json' with { type: 'json' };
import profileEvidence from '../../../contracts/ui-data-contract/v1/evidence/responses/profile.json' with { type: 'json' };
import unavailableProfileEvidence from '../../../contracts/ui-data-contract/v1/evidence/responses/profile.unavailable.json' with { type: 'json' };
import leaderboardRankingsEvidence from '../../../contracts/ui-data-contract/v1/evidence/responses/rankings.json' with { type: 'json' };
import mixedSourceRankingsEvidence from '../../../contracts/ui-data-contract/v1/evidence/responses/rankings.mixed-source.json' with { type: 'json' };
import subscriptionEvidence from '../../../contracts/ui-data-contract/v1/evidence/responses/subscription.json' with { type: 'json' };
import type { PreviewDataTransport } from './api-adapter';
import type { UiDataContractV1Method } from './contract-v1';

export interface EvidenceTransportOptions {
  readonly profile?: 'primary' | 'unavailable';
  readonly rankings?: 'leaderboard' | 'mixed-source';
}

/**
 * Deterministic preview/test transport. Its inputs are explicit retained
 * evidence artifacts; it does not know about fixtures or HTTP fallbacks.
 */
export function createEvidenceTransport(options: EvidenceTransportOptions = {}): PreviewDataTransport {
  const responses: Readonly<Record<UiDataContractV1Method, unknown>> = {
    models: modelsEvidence,
    profile: options.profile === 'unavailable' ? unavailableProfileEvidence : profileEvidence,
    lifecycle: lifecycleEvidence,
    rankings: options.rankings === 'mixed-source' ? mixedSourceRankingsEvidence : leaderboardRankingsEvidence,
    comparison: comparisonEvidence,
    subscription: subscriptionEvidence,
  };
  return {
    request(method) {
      return Promise.resolve(structuredClone(responses[method]));
    },
  };
}
