import { describe, expect, it } from 'vitest';

import type {
  CompareData,
  PreviewModel,
  PreviewModelProfileData,
  Provenance,
  UiDataContractV1,
} from './preview-data/contracts';
import {
  parseRouteEvidencePair,
  projectRouteEvidencePair,
  projectRouteEvidenceProfile,
  routeEvidencePairPath,
  routeEvidenceQueryState,
  routeEvidenceValueState,
} from './route-evidence-projectors';

const previewProvenance: Provenance = {
  id: 'fixture:route-evidence',
  label: 'Accepted preview evidence',
  kind: 'illustrative_prototype',
  effectiveAt: '2026-08-18T00:00:00.000Z',
  note: 'Preview only.',
};

function model(slug: string): PreviewModel {
  return {
    id: slug,
    identity: { availability: 'available', value: { slug, name: slug.toUpperCase(), provider: 'Provider' }, provenance: previewProvenance },
  } as PreviewModel;
}

function envelope<T>(data: T | null): UiDataContractV1<T> {
  return {
    contractVersion: 'ui-data-contract/v1',
    status: data === null ? 'unavailable' : 'partial',
    ...(data === null ? { reason: 'No accepted evidence.' } : {}),
    fetchedAt: '2026-08-18T00:00:00.000Z',
    effectiveAt: previewProvenance.effectiveAt,
    data,
    provenance: data === null ? [] : [previewProvenance],
  };
}

describe('route evidence projectors', () => {
  it('parses only ordered, distinct pair route slugs and preserves the matching query', () => {
    const pair = parseRouteEvidencePair('alpha-vs-beta');
    expect(pair).toEqual({ left: 'alpha', right: 'beta', slug: 'alpha-vs-beta' });
    expect(routeEvidencePairPath(pair!)).toBe('/compare/alpha-vs-beta?models=alpha,beta');
    expect(routeEvidenceQueryState('alpha,beta', pair!)).toBe('matches');
    expect(routeEvidenceQueryState('beta,alpha', pair!)).toBe('mismatch');
    expect(parseRouteEvidencePair('alpha-vs-alpha')).toBeNull();
    expect(parseRouteEvidencePair('alpha-vs-beta-vs-gamma')).toBeNull();
    expect(parseRouteEvidencePair('alpha/beta-vs-gamma')).toBeNull();
  });

  it('does not substitute a missing profile or pair member with another model', () => {
    const profile = projectRouteEvidenceProfile(envelope<PreviewModelProfileData>(null));
    expect(profile.model).toBeNull();
    expect(profile.reason).toBe('No accepted evidence.');

    const pair = parseRouteEvidencePair('alpha-vs-beta')!;
    const comparison = projectRouteEvidencePair(envelope<CompareData>({
      models: [model('alpha')],
      unavailableModelIds: [{ availability: 'unavailable', reason: 'No accepted evidence for beta.' }],
    }), pair);
    expect(comparison.models).toEqual([expect.objectContaining({ id: 'alpha' }), null]);
    expect(comparison.unavailableIds).toEqual(['No accepted evidence for beta.']);
  });

  it('labels retained preview evidence as not verified instead of as a published fact', () => {
    expect(routeEvidenceValueState({ availability: 'available', value: 1, provenance: previewProvenance }))
      .toBe('Preview-only · not verified');
    expect(routeEvidenceValueState({ availability: 'unavailable', reason: 'Missing' })).toBe('Unavailable');
  });
});
