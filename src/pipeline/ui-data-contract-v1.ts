export * from './ui-data-contract-v1-core';
export * from './ui-data-contract-v1-models';
export * from './ui-data-contract-v1-rankings';
export * from './ui-data-contract-v1-subscription';
export * from './ui-data-contract-v1-schema';

import type { ValidateFunction } from 'ajv';
import {
  UiDataContractValidationError,
  validateUiDataContractV1EnvelopeCore,
  type UiDataContractV1Envelope,
  type UiDataContractV1Method,
} from './ui-data-contract-v1-core';
import {
  normalizeComparisonRequest,
  normalizeLifecycleRequest,
  normalizeModelsRequest,
  normalizeProfileRequest,
  validateModelMethodData,
  type ComparisonData,
  type ComparisonRequest,
  type LifecycleData,
  type LifecycleRequest,
  type ModelsData,
  type ModelsRequest,
  type ProfileData,
  type ProfileRequest,
} from './ui-data-contract-v1-models';
import {
  normalizeRankingsRequest,
  validateRankingsData,
  validateRankingsDataIntrinsic,
  type RankingDimensionSet,
  type RankingsData,
  type RankingsRequest,
  type RankingsValidationAuthority,
} from './ui-data-contract-v1-rankings';
import {
  normalizeSubscriptionRequest,
  validateSubscriptionData,
  type SubscriptionData,
  type SubscriptionRequest,
} from './ui-data-contract-v1-subscription';
import { createUiDataContractV1SchemaValidator } from './ui-data-contract-v1-schema';

export type UiDataContractV1RequestByMethod = {
  readonly models: ModelsRequest;
  readonly profile: ProfileRequest;
  readonly lifecycle: LifecycleRequest;
  readonly rankings: RankingsRequest;
  readonly comparison: ComparisonRequest;
  readonly subscription: SubscriptionRequest;
};

export type UiDataContractV1DataByMethod = {
  readonly models: ModelsData;
  readonly profile: ProfileData;
  readonly lifecycle: LifecycleData;
  readonly rankings: RankingsData;
  readonly comparison: ComparisonData;
  readonly subscription: SubscriptionData;
};

export type UiDataContractV1ResponseByMethod = {
  readonly [M in UiDataContractV1Method]: UiDataContractV1Envelope<
    M,
    UiDataContractV1RequestByMethod[M],
    UiDataContractV1DataByMethod[M]
  >;
};

function schemaFailure(validate: ValidateFunction): never {
  const error = validate.errors?.[0];
  const path = error?.instancePath === undefined || error.instancePath.length === 0
    ? '$'
    : `$${error.instancePath}`;
  const format = error?.keyword === 'format'
    ? (error.params as { readonly format?: unknown }).format
    : undefined;
  const code = format === 'date-time'
    ? 'invalid_timestamp'
    : format === 'date'
      ? 'invalid_calendar_date'
      : 'invalid_response';
  throw new UiDataContractValidationError(
    code,
    path,
    error?.message ?? 'must satisfy the ui-data-contract/v1 schema',
  );
}

const UI_DATA_CONTRACT_V1_METHODS = new Set<UiDataContractV1Method>([
  'models', 'profile', 'lifecycle', 'rankings', 'comparison', 'subscription',
]);

function rawRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function precheckUiDataContractV1(
  candidate: unknown,
  expectedMethod?: UiDataContractV1Method,
): UiDataContractV1Method | null {
  const record = rawRecord(candidate);
  if (record === null) return null;
  if ('contractVersion' in record && record.contractVersion !== 'ui-data-contract/v1') {
    throw new UiDataContractValidationError(
      'unsupported_contract_version',
      '$/contractVersion',
      'must be ui-data-contract/v1',
    );
  }
  const method = record.method;
  if (typeof method !== 'string' || !UI_DATA_CONTRACT_V1_METHODS.has(method as UiDataContractV1Method)) {
    return null;
  }
  if (expectedMethod !== undefined && method !== expectedMethod) {
    throw new UiDataContractValidationError('method_mismatch', '$/method', `must match ${expectedMethod}`);
  }
  return method as UiDataContractV1Method;
}

export function validateUiDataContractV1WithAjv<M extends UiDataContractV1Method>(
  candidate: unknown,
  expectedMethod?: M,
): void {
  const record = rawRecord(candidate);
  const declaredMethod = typeof record?.method === 'string' && UI_DATA_CONTRACT_V1_METHODS.has(record.method as UiDataContractV1Method)
    ? record.method as UiDataContractV1Method
    : null;
  const validate = createUiDataContractV1SchemaValidator(
    expectedMethod === undefined && declaredMethod === null ? '' : `#/$defs/${expectedMethod ?? declaredMethod}Envelope`,
  );
  if (validate(candidate)) return;
  if (record !== null && 'contractVersion' in record && record.contractVersion !== 'ui-data-contract/v1') {
    throw new UiDataContractValidationError(
      'unsupported_contract_version',
      '$/contractVersion',
      'must be ui-data-contract/v1',
    );
  }
  if (expectedMethod !== undefined && declaredMethod !== null && declaredMethod !== expectedMethod) {
    throw new UiDataContractValidationError('method_mismatch', '$/method', `must match ${expectedMethod}`);
  }
  schemaFailure(validate);
}

function intrinsicRankingDimensionSet(value: unknown): RankingDimensionSet {
  const request = rawRecord(value);
  const weights = rawRecord(request?.weights);
  const revision = typeof request?.dimensionSetRevision === 'string'
    ? request.dimensionSetRevision
    : '';
  return {
    revision,
    transformationVersion: 'intrinsic-request-v1',
    dimensions: Object.keys(weights ?? {}).map((dimensionId) => ({
      dimensionId,
      label: dimensionId,
      kind: 'benchmark',
      unit: 'score',
      utilityAnchor: { best: 100, worst: 0, transform: 'identity' },
    })),
  };
}

export function parseUiDataContractV1Runtime<M extends UiDataContractV1Method>(
  candidate: unknown,
  expectedMethod?: M,
  rankingsAuthority?: RankingsValidationAuthority,
): UiDataContractV1ResponseByMethod[M] {
  precheckUiDataContractV1(candidate, expectedMethod);
  const envelope = validateUiDataContractV1EnvelopeCore(candidate, expectedMethod);
  switch (envelope.method) {
    case 'models': {
      const request = normalizeModelsRequest(envelope.request);
      if (envelope.status !== 'unavailable') {
        validateModelMethodData('models', envelope.data, request, envelope.sources);
      }
      break;
    }
    case 'profile': {
      const request = normalizeProfileRequest(envelope.request);
      if (envelope.status !== 'unavailable') {
        validateModelMethodData('profile', envelope.data, request, envelope.sources);
      }
      break;
    }
    case 'lifecycle': {
      const request = normalizeLifecycleRequest(envelope.request);
      if (envelope.status !== 'unavailable') {
        validateModelMethodData('lifecycle', envelope.data, request, envelope.sources);
      }
      break;
    }
    case 'comparison': {
      const request = normalizeComparisonRequest(envelope.request);
      if (envelope.status !== 'unavailable') {
        validateModelMethodData('comparison', envelope.data, request, envelope.sources);
      }
      break;
    }
    case 'subscription': {
      const request = normalizeSubscriptionRequest(envelope.request);
      if (envelope.status !== 'unavailable') {
        validateSubscriptionData(request, envelope.data, envelope.sources);
      }
      break;
    }
    case 'rankings': {
      const request = envelope.request as { readonly operation?: unknown };
      const dimensionSet = request.operation === 'custom'
        ? rankingsAuthority?.operation === 'custom'
          ? rankingsAuthority.dimensionSet
          : intrinsicRankingDimensionSet(envelope.request)
        : undefined;
      const normalized = normalizeRankingsRequest(envelope.request, dimensionSet);
      if (envelope.status !== 'unavailable') {
        if (rankingsAuthority === undefined) {
          validateRankingsDataIntrinsic(normalized, envelope.data, envelope.sources);
        } else {
          validateRankingsData(normalized, envelope.data, envelope.sources, rankingsAuthority);
        }
      }
      break;
    }
  }

  return candidate as UiDataContractV1ResponseByMethod[M];
}

export function parseUiDataContractV1<M extends UiDataContractV1Method>(
  candidate: unknown,
  expectedMethod?: M,
  rankingsAuthority?: RankingsValidationAuthority,
): UiDataContractV1ResponseByMethod[M] {
  validateUiDataContractV1WithAjv(candidate, expectedMethod);
  return parseUiDataContractV1Runtime(candidate, expectedMethod, rankingsAuthority);
}
