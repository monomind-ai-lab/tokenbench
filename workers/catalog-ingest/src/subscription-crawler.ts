import type {
  CatalogResponse,
  EntitlementEvidence,
  PlanOffer,
  SourceProvenance,
} from '../../../src/catalog/contracts';
import type { ParsedSource } from './index';

/**
 * This is deliberately an allowlist. A subscription page is data input only;
 * it is never treated as an instruction to discover an authenticated API.
 */
export const SUBSCRIPTION_SOURCE_CONFIGS = [
  {
    sourceId: 'openai-subscription', providerId: 'openai',
    url: 'https://chatgpt.com/pricing/',
  },
  {
    sourceId: 'anthropic-subscription', providerId: 'anthropic',
    url: 'https://claude.com/pricing/',
  },
  {
    sourceId: 'google-subscription', providerId: 'google',
    url: 'https://one.google.com/about/plans',
  },
  {
    sourceId: 'xai-subscription', providerId: 'xai',
    url: 'https://x.ai/pricing',
  },
  {
    sourceId: 'zai-subscription', providerId: 'zai',
    url: 'https://z.ai/subscribe',
  },
  {
    sourceId: 'perplexity-subscription', providerId: 'perplexity',
    url: 'https://www.perplexity.ai/pro',
  },
  {
    sourceId: 'microsoft-subscription', providerId: 'microsoft',
    url: 'https://www.microsoft.com/en-us/microsoft-365-copilot/personal',
  },
] as const;

export type SubscriptionSourceConfig = typeof SUBSCRIPTION_SOURCE_CONFIGS[number];
export type SubscriptionCrawlState = 'baseline' | 'unchanged' | 'changed' | 'blocked' | 'failed' | 'needs_review';

export interface SubscriptionPriceObservation {
  readonly displayName: string;
  readonly monthlyCostMicroDollars: number;
  readonly currency: 'USD';
  readonly billingCycle: 'monthly' | 'annual' | 'other';
  /** Present only when the page explicitly prints an annual effective-monthly value. */
  readonly effectiveMonthlyCostMicroDollars?: number;
  readonly evidenceLocator: string;
}

export interface SubscriptionCrawlValidator {
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly priorSnapshotKey: string | null;
}

export interface SubscriptionCrawlRecord {
  readonly sourceId: string;
  readonly providerId: string;
  readonly url: string;
  readonly observedAt: string;
  readonly state: SubscriptionCrawlState;
  readonly statusCode: number | null;
  readonly contentHash: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly snapshotKey?: string;
  readonly priceObservations: readonly SubscriptionPriceObservation[];
  readonly reason?: string;
}

export interface SubscriptionCrawlArtifact {
  readonly schemaVersion: 1;
  readonly parserVersion: 'subscription-html-v1';
  readonly observedAt: string;
  readonly records: readonly SubscriptionCrawlRecord[];
}

export interface SubscriptionCrawlResult {
  readonly record: SubscriptionCrawlRecord;
  readonly rawBytes?: Uint8Array;
}

export interface SubscriptionCrawlInput {
  readonly config: SubscriptionSourceConfig;
  readonly observedAt: string;
  readonly validator?: SubscriptionCrawlValidator;
  readonly previousSource?: SourceProvenance;
  readonly fetchImpl?: typeof fetch;
}

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const PARSER_VERSION = 'subscription-html-v1' as const;

async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function responseHeader(response: Response, name: string): string | null {
  const value = response.headers.get(name);
  return value && value.length > 0 ? value : null;
}

function originRobotsUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}/robots.txt`;
}

function pathForRobots(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

function robotsAllows(robots: string, targetUrl: string): { allowed: true } | { allowed: false; reason: string } {
  if (/content-signal\s*:\s*[^\r\n]*ai-input\s*=\s*no/i.test(robots)) {
    return { allowed: false, reason: 'robots policy declares ai-input=no' };
  }
  const targetPath = pathForRobots(targetUrl);
  let applies = false;
  let disallowed = false;
  let currentAgents: string[] = [];
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) {
      currentAgents = [];
      continue;
    }
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === 'user-agent') {
      currentAgents.push(value.toLowerCase());
      continue;
    }
    if (field !== 'disallow' || !currentAgents.includes('*')) continue;
    applies = true;
    if (value && targetPath.startsWith(value)) disallowed = true;
  }
  if (applies && disallowed) return { allowed: false, reason: `robots disallows ${targetPath}` };
  return { allowed: true };
}

async function readBounded(response: Response, label: string): Promise<Uint8Array> {
  const length = response.headers.get('content-length');
  if (length !== null && /^\d+$/.test(length) && Number(length) > MAX_HTML_BYTES) {
    throw new Error(`${label} response exceeds ${MAX_HTML_BYTES} byte limit`);
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_HTML_BYTES) throw new Error(`${label} response exceeds ${MAX_HTML_BYTES} byte limit`);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      const chunk = part.value instanceof Uint8Array ? part.value : new Uint8Array(part.value);
      total += chunk.byteLength;
      if (total > MAX_HTML_BYTES) throw new Error(`${label} response exceeds ${MAX_HTML_BYTES} byte limit`);
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseUsdMicroDollars(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value * 1_000_000);
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/,/g, '').trim();
  const match = normalized.match(/(?:USD\s*)?\$?\s*(\d+(?:\.\d{1,6})?)/i);
  if (!match) return null;
  const dollars = Number(match[1]);
  if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1_000_000) return null;
  return Math.round(dollars * 1_000_000);
}

function offerCycle(value: Record<string, unknown>, context: string): SubscriptionPriceObservation['billingCycle'] {
  const text = `${String(value.name ?? '')} ${String(value.description ?? '')} ${context}`.toLowerCase();
  if (/annual|yearly|per\s+year|\/yr|\byear\b/.test(text)) return 'annual';
  if (/monthly|per\s+month|\/mo|\bmonth\b/.test(text) || value.price !== undefined) return 'monthly';
  return 'other';
}

function explicitEffectiveMonthly(value: Record<string, unknown>): number | undefined {
  const text = `${String(value.name ?? '')} ${String(value.description ?? '')}`;
  const match = text.match(/\$\s*(\d+(?:\.\d{1,6})?)\s*(?:\/\s*month|per\s+month)/i);
  const parsed = match ? parseUsdMicroDollars(match[1]) : null;
  return parsed ?? undefined;
}

function jsonLdValues(value: unknown, context = '', inheritedName = ''): SubscriptionPriceObservation[] {
  if (Array.isArray(value)) return value.flatMap((entry) => jsonLdValues(entry, context, inheritedName));
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const type = Array.isArray(record['@type']) ? record['@type'].map(String).join(' ') : String(record['@type'] ?? '');
  const name = inheritedName || (typeof record.name === 'string' && record.name.trim() ? record.name.trim() : '');
  const nextContext = `${context} ${name} ${type}`;
  const observations: SubscriptionPriceObservation[] = [];
  const offers = record.offers;
  const billingCycle = offerCycle(record, nextContext);
  if (billingCycle !== 'other') {
    const amount = parseUsdMicroDollars(record.price);
    const currency = String(record.priceCurrency ?? '').toUpperCase();
    if (amount !== null && currency === 'USD' && name) {
      observations.push({
        displayName: name,
        monthlyCostMicroDollars: amount,
        currency: 'USD',
        billingCycle,
        ...(billingCycle === 'annual' && explicitEffectiveMonthly(record) !== undefined
          ? { effectiveMonthlyCostMicroDollars: explicitEffectiveMonthly(record) }
          : {}),
        evidenceLocator: 'JSON-LD Product/Offer price',
      });
    }
  }
  if (offers !== undefined) observations.push(...jsonLdValues(offers, nextContext, name));
  for (const [key, child] of Object.entries(record)) {
    if (key === 'offers' || key === 'price') continue;
    if (child && typeof child === 'object') observations.push(...jsonLdValues(child, nextContext, name));
  }
  return observations;
}

export function extractSubscriptionPriceObservations(html: string): SubscriptionPriceObservation[] {
  const observations: SubscriptionPriceObservation[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      observations.push(...jsonLdValues(JSON.parse(match[1])));
    } catch {
      // A malformed JSON-LD block is not evidence. Continue with other blocks.
    }
  }
  const seen = new Set<string>();
  return observations.filter((observation) => {
    const key = `${observation.displayName.toLowerCase()}|${observation.monthlyCostMicroDollars}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyRecord(
  config: SubscriptionSourceConfig,
  observedAt: string,
  state: SubscriptionCrawlState,
  reason: string,
  statusCode: number | null = null,
): SubscriptionCrawlRecord {
  return {
    sourceId: config.sourceId,
    providerId: config.providerId,
    url: config.url,
    observedAt,
    state,
    statusCode,
    contentHash: null,
    etag: null,
    lastModified: null,
    priceObservations: [],
    reason,
  };
}

export async function crawlSubscriptionSource(input: SubscriptionCrawlInput): Promise<SubscriptionCrawlResult> {
  const fetchImpl = input.fetchImpl ?? ((request, init) => globalThis.fetch(request, init));
  let robotsResponse: Response;
  try {
    robotsResponse = await fetchImpl(originRobotsUrl(input.config.url));
  } catch (error) {
    return { record: emptyRecord(input.config, input.observedAt, 'failed', `robots fetch failed: ${error instanceof Error ? error.message : String(error)}`) };
  }
  if (robotsResponse.status !== 404 && !robotsResponse.ok) {
    return { record: emptyRecord(input.config, input.observedAt, 'failed', `robots HTTP ${robotsResponse.status}`, robotsResponse.status) };
  }
  if (robotsResponse.ok) {
    let robots: string;
    try {
      robots = new TextDecoder('utf-8', { fatal: true }).decode(await readBounded(robotsResponse, `${input.config.sourceId} robots`));
    } catch (error) {
      return { record: emptyRecord(input.config, input.observedAt, 'failed', `robots body invalid: ${error instanceof Error ? error.message : String(error)}`, robotsResponse.status) };
    }
    const policy = robotsAllows(robots, input.config.url);
    if ('reason' in policy) return { record: emptyRecord(input.config, input.observedAt, 'blocked', policy.reason, robotsResponse.status) };
  }

  let response: Response;
  try {
    const headers = new Headers();
    if (input.validator?.etag) headers.set('If-None-Match', input.validator.etag);
    if (input.validator?.lastModified) headers.set('If-Modified-Since', input.validator.lastModified);
    response = await fetchImpl(input.config.url, { headers });
  } catch (error) {
    return { record: emptyRecord(input.config, input.observedAt, 'failed', `page fetch failed: ${error instanceof Error ? error.message : String(error)}`) };
  }
  if (response.status === 304) {
    if (!input.validator?.priorSnapshotKey) {
      return { record: emptyRecord(input.config, input.observedAt, 'needs_review', '304 received without a prior subscription snapshot', response.status) };
    }
    return {
      record: {
        sourceId: input.config.sourceId,
        providerId: input.config.providerId,
        url: input.config.url,
        observedAt: input.observedAt,
        state: 'unchanged',
        statusCode: response.status,
        contentHash: input.previousSource?.contentHash ?? null,
        etag: responseHeader(response, 'etag') ?? input.validator.etag,
        lastModified: responseHeader(response, 'last-modified') ?? input.validator.lastModified,
        snapshotKey: input.validator.priorSnapshotKey,
        priceObservations: [],
      },
    };
  }
  if (!response.ok) return { record: emptyRecord(input.config, input.observedAt, 'failed', `page HTTP ${response.status}`, response.status) };

  let rawBytes: Uint8Array;
  try {
    rawBytes = await readBounded(response, input.config.sourceId);
  } catch (error) {
    return { record: emptyRecord(input.config, input.observedAt, 'failed', error instanceof Error ? error.message : String(error), response.status) };
  }
  let html: string;
  try {
    html = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
  } catch (error) {
    return { record: emptyRecord(input.config, input.observedAt, 'needs_review', `HTML is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`, response.status) };
  }
  const contentHash = await hashBytes(rawBytes);
  const prices = extractSubscriptionPriceObservations(html);
  const state: SubscriptionCrawlState = input.previousSource?.contentHash === contentHash
    ? 'unchanged'
    : input.previousSource
      ? 'changed'
      : 'baseline';
  return {
    rawBytes,
    record: {
      sourceId: input.config.sourceId,
      providerId: input.config.providerId,
      url: input.config.url,
      observedAt: input.observedAt,
      state,
      statusCode: response.status,
      contentHash,
      etag: responseHeader(response, 'etag'),
      lastModified: responseHeader(response, 'last-modified'),
      priceObservations: prices,
      ...(prices.length === 0 ? { reason: 'No explicit monthly JSON-LD price facts were recognized.' } : {}),
    },
  };
}

function staleEvidence(evidence: EntitlementEvidence, reason: string, observedAt: string): EntitlementEvidence {
  return {
    ...evidence,
    status: 'stale',
    staleReason: reason,
    source: { ...evidence.source, accessedAt: observedAt },
  };
}

function sourceForRecord(
  current: SourceProvenance | undefined,
  record: SubscriptionCrawlRecord,
  reviewStatus: SourceProvenance['reviewStatus'],
): SourceProvenance {
  return {
    id: record.sourceId,
    providerId: record.providerId,
    sourceUrl: record.url,
    observedAt: record.observedAt,
    sourceKind: 'official_html',
    confidence: 'official',
    ...(record.snapshotKey ? { snapshotKey: record.snapshotKey } : current?.snapshotKey ? { snapshotKey: current.snapshotKey } : {}),
    ...(record.contentHash ? { contentHash: record.contentHash } : current?.contentHash ? { contentHash: current.contentHash } : {}),
    parserVersion: PARSER_VERSION,
    ...(record.priceObservations.length > 0 ? { evidenceLocator: record.priceObservations[0].evidenceLocator } : current?.evidenceLocator ? { evidenceLocator: current.evidenceLocator } : {}),
    reviewStatus,
  };
}

function matchObservation(plan: PlanOffer, observations: readonly SubscriptionPriceObservation[]): SubscriptionPriceObservation | undefined {
  const normalized = plan.displayName.trim().toLowerCase();
  const monthly = observations.filter((observation) => observation.billingCycle === 'monthly');
  return monthly.find((observation) => observation.displayName.trim().toLowerCase() === normalized)
    ?? monthly.find((observation) => normalized.includes(observation.displayName.trim().toLowerCase()) || observation.displayName.trim().toLowerCase().includes(normalized));
}

function mergeChangedSource(
  current: ParsedSource,
  record: SubscriptionCrawlRecord,
): ParsedSource {
  const reason = record.priceObservations.length === 0
    ? 'The provider page changed but no explicit monthly price facts were recognized; entitlement facts require review.'
    : 'The provider page changed; parsed prices are retained as observations, but entitlement limits require review before recommendation use.';
  return {
    source: sourceForRecord(current.source, record, 'needs_review'),
    plans: current.plans.map((plan) => {
      const observation = matchObservation(plan, record.priceObservations);
      return {
        ...plan,
        ...(observation ? { monthlyCostMicroDollars: observation.monthlyCostMicroDollars } : {}),
        entitlementEvidence: staleEvidence(plan.entitlementEvidence, reason, record.observedAt),
      };
    }),
    modelOffers: current.modelOffers,
  };
}

/**
 * Applies crawl receipts to a candidate catalog without inventing missing
 * plans. Existing manual facts remain intact for blocked/failed sources.
 */
export function mergeSubscriptionCrawlIntoSources(
  catalog: CatalogResponse,
  records: readonly SubscriptionCrawlRecord[],
): ParsedSource[] {
  const currentBySource = new Map<string, ParsedSource>();
  for (const source of catalog.provenance) {
    currentBySource.set(source.id, {
      source,
      plans: catalog.plans.filter((plan) => plan.sourceId === source.id),
      modelOffers: catalog.modelOffers.filter((model) => model.sourceId === source.id),
    });
  }
  return records.flatMap((record): ParsedSource[] => {
    const current = currentBySource.get(record.sourceId);
    if (record.state === 'blocked' || record.state === 'failed') return current ? [current] : [];
    if (record.state === 'unchanged') return current ? [current] : [];
    if (!current) {
      return [{
        source: sourceForRecord(undefined, record, 'needs_review'),
        plans: [],
        modelOffers: [],
      }];
    }
    if (record.state === 'changed' || record.state === 'needs_review') return [mergeChangedSource(current, record)];
    return [{
      source: sourceForRecord(current.source, record, 'verified'),
      plans: current.plans,
      modelOffers: current.modelOffers,
    }];
  });
}

export function subscriptionCrawlArtifact(records: readonly SubscriptionCrawlRecord[], observedAt: string): SubscriptionCrawlArtifact {
  return { schemaVersion: 1, parserVersion: PARSER_VERSION, observedAt, records };
}

export function subscriptionSourceConfig(sourceId: string): SubscriptionSourceConfig | undefined {
  return SUBSCRIPTION_SOURCE_CONFIGS.find((config) => config.sourceId === sourceId);
}
