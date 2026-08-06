import {
  compareUtf8Binary,
  type BenchmarkModel,
  type BenchmarkPriceCheck,
} from '../benchmarks/contracts';

export type PublishedRevisionModel = Pick<BenchmarkModel, 'modelKey'>;

/**
 * The exact route fields a published snapshot needs for alert diffs. Rates are
 * optional here because a frozen upstream record can explicitly omit a side;
 * omissions stay unavailable and never become synthetic zeroes.
 */
export type PublishedRevisionPriceCheck = Pick<
  BenchmarkPriceCheck,
  'modelKey' | 'providerId' | 'routeId' | 'verificationStatus'
> & Partial<Pick<BenchmarkPriceCheck, 'inputUsdPerMillion' | 'outputUsdPerMillion'>>;

/** One already-published, immutable snapshot supplied by the caller. */
export interface PublishedRevisionSnapshot {
  readonly revision: string;
  readonly models: readonly PublishedRevisionModel[];
  readonly priceChecks: readonly PublishedRevisionPriceCheck[];
}

export interface NewModelFact {
  /** Revision-scoped deterministic identity for receipt and fact deduplication. */
  readonly id: string;
  readonly modelKey: string;
}

export interface PriceDropFact {
  /** Revision-scoped deterministic identity for receipt and fact deduplication. */
  readonly id: string;
  readonly modelKey: string;
  readonly providerId: string;
  readonly routeId: string;
  readonly previousInputUsdPerMillion: number | null;
  readonly currentInputUsdPerMillion: number | null;
  readonly previousOutputUsdPerMillion: number | null;
  readonly currentOutputUsdPerMillion: number | null;
}

export interface RevisionChanges {
  readonly fromRevision: string;
  readonly toRevision: string;
  /** Stable receipt identity from the revision pair and sorted deduplicated fact IDs. */
  readonly dedupeKey: string;
  readonly newModels: readonly NewModelFact[];
  readonly priceDrops: readonly PriceDropFact[];
}

interface RoutePrice {
  readonly modelKey: string;
  readonly providerId: string;
  readonly routeId: string;
  readonly inputUsdPerMillion: number | null;
  readonly outputUsdPerMillion: number | null;
  readonly fingerprint: string;
}

interface CollectedRoutePrice {
  readonly price: RoutePrice;
  readonly ambiguous: boolean;
}

interface NormalizedRate {
  readonly value: number | null;
  readonly invalid: boolean;
}

function compareText(left: string, right: string): number {
  return compareUtf8Binary(left, right);
}

function isFiniteNonNegativeRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeRate(value: unknown): NormalizedRate {
  if (value === null || value === undefined) return { value: null, invalid: false };
  return isFiniteNonNegativeRate(value)
    ? { value, invalid: false }
    : { value: null, invalid: true };
}

function routeIdentity(modelKey: string, providerId: string, routeId: string): string {
  return JSON.stringify([modelKey, providerId, routeId]);
}

function factId(
  toRevision: string,
  kind: 'new-model' | 'price-drop',
  modelKey: string,
  providerId: string,
  routeId: string,
): string {
  return JSON.stringify([toRevision, kind, modelKey, providerId, routeId]);
}

function routePrice(price: PublishedRevisionPriceCheck): RoutePrice | null {
  const input = normalizeRate(price.inputUsdPerMillion);
  const output = normalizeRate(price.outputUsdPerMillion);
  if (input.invalid || output.invalid) return null;
  const inputUsdPerMillion = input.value;
  const outputUsdPerMillion = output.value;
  return {
    modelKey: price.modelKey,
    providerId: price.providerId,
    routeId: price.routeId,
    inputUsdPerMillion,
    outputUsdPerMillion,
    fingerprint: JSON.stringify([inputUsdPerMillion, outputUsdPerMillion]),
  };
}

/**
 * A frozen snapshot should not contain conflicting rows for one exact route.
 * Identical duplicates are harmless and collapse; conflicting duplicates fail
 * closed rather than choosing one price and inventing an alert.
 */
function primaryPricesByRoute(
  priceChecks: readonly PublishedRevisionPriceCheck[],
): ReadonlyMap<string, RoutePrice> {
  const collected = new Map<string, CollectedRoutePrice>();

  for (const priceCheck of priceChecks) {
    if (priceCheck.verificationStatus !== 'primary') continue;
    const normalized = routePrice(priceCheck);
    if (!normalized) continue;
    const identity = routeIdentity(normalized.modelKey, normalized.providerId, normalized.routeId);
    const existing = collected.get(identity);
    if (!existing) {
      collected.set(identity, { price: normalized, ambiguous: false });
      continue;
    }
    if (existing.price.fingerprint !== normalized.fingerprint) {
      collected.set(identity, { price: existing.price, ambiguous: true });
    }
  }

  const prices = new Map<string, RoutePrice>();
  for (const [identity, entry] of collected) {
    if (!entry.ambiguous) prices.set(identity, entry.price);
  }
  return prices;
}

function decreases(previous: number | null, current: number | null): boolean {
  return previous !== null && current !== null && current < previous;
}

function compareNewModelFacts(left: NewModelFact, right: NewModelFact): number {
  const modelOrder = compareText(left.modelKey, right.modelKey);
  return modelOrder !== 0 ? modelOrder : compareText(left.id, right.id);
}

function comparePriceDropFacts(left: PriceDropFact, right: PriceDropFact): number {
  const modelOrder = compareText(left.modelKey, right.modelKey);
  if (modelOrder !== 0) return modelOrder;
  const providerOrder = compareText(left.providerId, right.providerId);
  if (providerOrder !== 0) return providerOrder;
  const routeOrder = compareText(left.routeId, right.routeId);
  return routeOrder !== 0 ? routeOrder : compareText(left.id, right.id);
}

function campaignDedupeKey(
  fromRevision: string,
  toRevision: string,
  newModels: readonly NewModelFact[],
  priceDrops: readonly PriceDropFact[],
): string {
  const factIds = [...newModels.map((fact) => fact.id), ...priceDrops.map((fact) => fact.id)]
    .sort(compareText);
  return JSON.stringify([fromRevision, toRevision, ...factIds]);
}

/**
 * Produces campaign-safe facts from two immutable published revisions. The
 * caller's snapshots remain untouched; only exact model and route identities
 * are compared.
 */
export function diffPublishedRevisions(
  previous: PublishedRevisionSnapshot,
  current: PublishedRevisionSnapshot,
): RevisionChanges {
  const previousModelKeys = new Set(previous.models.map((model) => model.modelKey));
  const newModelsById = new Map<string, NewModelFact>();
  for (const model of current.models) {
    if (previousModelKeys.has(model.modelKey)) continue;
    const id = factId(current.revision, 'new-model', model.modelKey, '', '');
    if (!newModelsById.has(id)) newModelsById.set(id, { id, modelKey: model.modelKey });
  }

  const previousPrices = primaryPricesByRoute(previous.priceChecks);
  const currentPrices = primaryPricesByRoute(current.priceChecks);
  const priceDropsById = new Map<string, PriceDropFact>();
  for (const [identity, currentPrice] of currentPrices) {
    const previousPrice = previousPrices.get(identity);
    if (!previousPrice) continue;
    if (!decreases(previousPrice.inputUsdPerMillion, currentPrice.inputUsdPerMillion)
      && !decreases(previousPrice.outputUsdPerMillion, currentPrice.outputUsdPerMillion)) {
      continue;
    }

    const id = factId(
      current.revision,
      'price-drop',
      currentPrice.modelKey,
      currentPrice.providerId,
      currentPrice.routeId,
    );
    if (!priceDropsById.has(id)) {
      priceDropsById.set(id, {
        id,
        modelKey: currentPrice.modelKey,
        providerId: currentPrice.providerId,
        routeId: currentPrice.routeId,
        previousInputUsdPerMillion: previousPrice.inputUsdPerMillion,
        currentInputUsdPerMillion: currentPrice.inputUsdPerMillion,
        previousOutputUsdPerMillion: previousPrice.outputUsdPerMillion,
        currentOutputUsdPerMillion: currentPrice.outputUsdPerMillion,
      });
    }
  }

  const newModels = [...newModelsById.values()].sort(compareNewModelFacts);
  const priceDrops = [...priceDropsById.values()].sort(comparePriceDropFacts);
  return {
    fromRevision: previous.revision,
    toRevision: current.revision,
    dedupeKey: campaignDedupeKey(previous.revision, current.revision, newModels, priceDrops),
    newModels,
    priceDrops,
  };
}
