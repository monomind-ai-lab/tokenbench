import type {
  CompareData,
  EvidenceValue,
  PreviewModel,
  PreviewModelProfileData,
  Provenance,
  UiDataContractV1,
} from './preview-data/contracts';

export type RouteEvidencePair = Readonly<{
  left: string;
  right: string;
  slug: string;
}>;

export type RouteEvidenceQueryState = 'absent' | 'matches' | 'mismatch';

export type RouteEvidenceProfileProjection = Readonly<{
  mode: 'preview' | 'published';
  model: PreviewModel | null;
  reason: string | null;
  status: UiDataContractV1<PreviewModelProfileData>['status'];
  provenance: readonly Provenance[];
}>;

export type RouteEvidencePairProjection = Readonly<{
  mode: 'preview' | 'published';
  models: readonly [PreviewModel | null, PreviewModel | null];
  reason: string | null;
  status: UiDataContractV1<CompareData>['status'];
  unavailableIds: readonly string[];
  provenance: readonly Provenance[];
}>;

const ROUTE_EVIDENCE_SLUG = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;
const PAIR_SEPARATOR = '-vs-';

export function isRouteEvidenceSlug(value: string): boolean {
  return ROUTE_EVIDENCE_SLUG.test(value);
}

export function parseRouteEvidencePair(value: string): RouteEvidencePair | null {
  const separator = value.indexOf(PAIR_SEPARATOR);
  if (separator <= 0 || separator !== value.lastIndexOf(PAIR_SEPARATOR)) return null;
  const left = value.slice(0, separator);
  const right = value.slice(separator + PAIR_SEPARATOR.length);
  if (!isRouteEvidenceSlug(left) || !isRouteEvidenceSlug(right) || left === right) return null;
  return { left, right, slug: `${left}${PAIR_SEPARATOR}${right}` };
}

export function routeEvidenceModelPath(slug: string): string {
  return `/models/${encodeURIComponent(slug)}/`;
}

export function routeEvidencePairPath(pair: RouteEvidencePair): string {
  const models = [pair.left, pair.right].map((slug) => encodeURIComponent(slug)).join(',');
  return `/compare/${encodeURIComponent(pair.slug)}?models=${models}`;
}

export function routeEvidenceQueryState(
  models: string | readonly string[] | undefined,
  pair: RouteEvidencePair,
): RouteEvidenceQueryState {
  if (models === undefined) return 'absent';
  if (typeof models !== 'string') return models.length === 1
    ? routeEvidenceQueryState(models[0], pair)
    : 'mismatch';
  const values = models.split(',').map((value) => value.trim()).filter(Boolean);
  return values.length === 2 && values[0] === pair.left && values[1] === pair.right
    ? 'matches'
    : 'mismatch';
}

function evidenceMode(provenance: readonly Provenance[]): 'preview' | 'published' {
  return provenance.some((source) => source.kind === 'illustrative_prototype')
    ? 'preview'
    : 'published';
}

function modelSlug(model: PreviewModel): string | null {
  return model.identity.availability === 'available' ? model.identity.value.slug : null;
}

function unavailableIds(data: CompareData | null): readonly string[] {
  return data?.unavailableModelIds
    .map((value) => value.availability === 'unavailable' ? value.reason : '')
    .filter(Boolean) ?? [];
}

export function projectRouteEvidenceProfile(
  envelope: UiDataContractV1<PreviewModelProfileData>,
): RouteEvidenceProfileProjection {
  return {
    mode: evidenceMode(envelope.provenance),
    model: envelope.data?.model ?? null,
    reason: envelope.reason ?? null,
    status: envelope.status,
    provenance: envelope.provenance,
  };
}

export function projectRouteEvidencePair(
  envelope: UiDataContractV1<CompareData>,
  pair: RouteEvidencePair,
): RouteEvidencePairProjection {
  const models = new Map((envelope.data?.models ?? []).flatMap((model) => {
    const slug = modelSlug(model);
    return slug === null ? [] : [[slug, model] as const];
  }));
  return {
    mode: evidenceMode(envelope.provenance),
    models: [models.get(pair.left) ?? null, models.get(pair.right) ?? null],
    reason: envelope.reason ?? null,
    status: envelope.status,
    unavailableIds: unavailableIds(envelope.data),
    provenance: envelope.provenance,
  };
}

export function routeEvidenceValueState<T>(value: EvidenceValue<T>): string {
  if (value.availability === 'unavailable') return 'Unavailable';
  return value.provenance.kind === 'illustrative_prototype'
    ? 'Preview-only · not verified'
    : 'Published data';
}

export function collectRouteEvidenceProvenance(
  ...values: readonly EvidenceValue<unknown>[]
): readonly Provenance[] {
  const sources = new Map<string, Provenance>();
  for (const value of values) {
    if (value.availability === 'available') sources.set(value.provenance.id, value.provenance);
    else if (value.provenance) sources.set(value.provenance.id, value.provenance);
  }
  return [...sources.values()];
}
