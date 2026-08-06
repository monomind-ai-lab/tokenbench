import { describe, expect, it } from 'vitest';
import type { BenchmarkModel } from '../benchmarks/contracts';
import {
  diffPublishedRevisions,
  type PublishedRevisionSnapshot,
} from './revision-diff';

type SnapshotModel = Pick<BenchmarkModel, 'modelKey' | 'evidenceStatus'>;
type SnapshotPrice = PublishedRevisionSnapshot['priceChecks'][number];

function model(
  modelKey: string,
  evidenceStatus: BenchmarkModel['evidenceStatus'] = 'supported',
): SnapshotModel {
  return { modelKey, evidenceStatus };
}

function price(overrides: Partial<SnapshotPrice> = {}): SnapshotPrice {
  return {
    modelKey: 'provider:alpha',
    providerId: 'provider',
    routeId: 'direct:alpha',
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 6,
    verificationStatus: 'primary',
    ...overrides,
  };
}

function snapshot(
  revision: string,
  models: readonly PublishedRevisionSnapshot['models'][number][],
  priceChecks: readonly SnapshotPrice[],
): PublishedRevisionSnapshot {
  return { revision, models, priceChecks };
}

describe('diffPublishedRevisions', () => {
  it('detects new models and verified price drops without conflating routes', () => {
    const previous = snapshot('revision-1', [
      model('provider:alpha'),
      model('provider:retained'),
    ], [
      price({ routeId: 'direct:alpha', inputUsdPerMillion: 2, outputUsdPerMillion: 6 }),
      price({ routeId: 'router:alpha', inputUsdPerMillion: 1, outputUsdPerMillion: 3 }),
    ]);
    const current = snapshot('revision-2', [
      model('provider:retained'),
      model('provider:new-model'),
      model('provider:alpha'),
    ], [
      price({ routeId: 'router:alpha', inputUsdPerMillion: 1, outputUsdPerMillion: 3 }),
      price({ routeId: 'direct:alpha', inputUsdPerMillion: 1.5, outputUsdPerMillion: 5 }),
    ]);

    const changes = diffPublishedRevisions(previous, current);

    expect(changes.fromRevision).toBe('revision-1');
    expect(changes.toRevision).toBe('revision-2');
    expect(changes.newModels).toEqual([{
      id: '["revision-2","new-model","provider:new-model","",""]',
      modelKey: 'provider:new-model',
    }]);
    expect(changes.priceDrops).toEqual([{
      id: '["revision-2","price-drop","provider:alpha","provider","direct:alpha"]',
      modelKey: 'provider:alpha',
      providerId: 'provider',
      routeId: 'direct:alpha',
      previousInputUsdPerMillion: 2,
      currentInputUsdPerMillion: 1.5,
      previousOutputUsdPerMillion: 6,
      currentOutputUsdPerMillion: 5,
    }]);
  });

  it('emits both exact route drops when distinct tuples contain NUL characters', () => {
    const previous = snapshot('revision-1', [model('a'), model('a\u0000b')], [
      price({ modelKey: 'a', providerId: 'b\u0000c', routeId: 'd', inputUsdPerMillion: 4, outputUsdPerMillion: 8 }),
      price({ modelKey: 'a\u0000b', providerId: 'c', routeId: 'd', inputUsdPerMillion: 6, outputUsdPerMillion: 10 }),
    ]);
    const current = snapshot('revision-2', [model('a'), model('a\u0000b')], [
      price({ modelKey: 'a', providerId: 'b\u0000c', routeId: 'd', inputUsdPerMillion: 3, outputUsdPerMillion: 8 }),
      price({ modelKey: 'a\u0000b', providerId: 'c', routeId: 'd', inputUsdPerMillion: 5, outputUsdPerMillion: 10 }),
    ]);

    const changes = diffPublishedRevisions(previous, current);

    expect(changes.priceDrops.map((fact) => [fact.modelKey, fact.providerId, fact.routeId])).toEqual([
      ['a', 'b\u0000c', 'd'],
      ['a\u0000b', 'c', 'd'],
    ]);
    expect(changes.priceDrops.map((fact) => fact.id)).toEqual([
      '["revision-2","price-drop","a","b\\u0000c","d"]',
      '["revision-2","price-drop","a\\u0000b","c","d"]',
    ]);
  });

  it('reports only primary finite non-negative rate decreases and preserves missing sides as unavailable', () => {
    const previous = snapshot('revision-1', [model('provider:alpha')], [
      price({ routeId: 'direct:drop-to-zero', inputUsdPerMillion: 0.5, outputUsdPerMillion: 2 }),
      price({ routeId: 'direct:partial', inputUsdPerMillion: 2, outputUsdPerMillion: 7 }),
      price({ routeId: 'direct:corroborating', inputUsdPerMillion: 4, outputUsdPerMillion: 8, verificationStatus: 'corroborating' }),
      price({ routeId: 'direct:negative', inputUsdPerMillion: 4, outputUsdPerMillion: 8 }),
      price({ routeId: 'direct:infinite', inputUsdPerMillion: 4, outputUsdPerMillion: 8 }),
    ]);
    const current = snapshot('revision-2', [model('provider:alpha')], [
      price({ routeId: 'direct:drop-to-zero', inputUsdPerMillion: 0, outputUsdPerMillion: 2 }),
      price({ routeId: 'direct:partial', inputUsdPerMillion: undefined, outputUsdPerMillion: 6 }),
      price({ routeId: 'direct:corroborating', inputUsdPerMillion: 1, outputUsdPerMillion: 2 }),
      price({ routeId: 'direct:negative', inputUsdPerMillion: -1, outputUsdPerMillion: 2 }),
      price({ routeId: 'direct:infinite', inputUsdPerMillion: Number.POSITIVE_INFINITY, outputUsdPerMillion: 2 }),
    ]);

    expect(diffPublishedRevisions(previous, current).priceDrops).toEqual([
      {
        id: '["revision-2","price-drop","provider:alpha","provider","direct:drop-to-zero"]',
        modelKey: 'provider:alpha',
        providerId: 'provider',
        routeId: 'direct:drop-to-zero',
        previousInputUsdPerMillion: 0.5,
        currentInputUsdPerMillion: 0,
        previousOutputUsdPerMillion: 2,
        currentOutputUsdPerMillion: 2,
      },
      {
        id: '["revision-2","price-drop","provider:alpha","provider","direct:partial"]',
        modelKey: 'provider:alpha',
        providerId: 'provider',
        routeId: 'direct:partial',
        previousInputUsdPerMillion: 2,
        currentInputUsdPerMillion: null,
        previousOutputUsdPerMillion: 7,
        currentOutputUsdPerMillion: 6,
      },
    ]);
  });

  it('does not infer a price drop from increases, unchanged rates, absent routes, or missing comparison values', () => {
    const previous = snapshot('revision-1', [model('provider:alpha')], [
      price({ routeId: 'direct:increase', inputUsdPerMillion: 2, outputUsdPerMillion: 6 }),
      price({ routeId: 'direct:unchanged', inputUsdPerMillion: 2, outputUsdPerMillion: 6 }),
      price({ routeId: 'direct:missing-before', inputUsdPerMillion: undefined, outputUsdPerMillion: 6 }),
      price({ routeId: 'direct:missing-after', inputUsdPerMillion: 2, outputUsdPerMillion: 6 }),
      price({ routeId: 'direct:absent-after', inputUsdPerMillion: 2, outputUsdPerMillion: 6 }),
    ]);
    const current = snapshot('revision-2', [model('provider:alpha')], [
      price({ routeId: 'direct:increase', inputUsdPerMillion: 3, outputUsdPerMillion: 7 }),
      price({ routeId: 'direct:unchanged', inputUsdPerMillion: 2, outputUsdPerMillion: 6 }),
      price({ routeId: 'direct:missing-before', inputUsdPerMillion: 1, outputUsdPerMillion: 7 }),
      price({ routeId: 'direct:missing-after', inputUsdPerMillion: undefined, outputUsdPerMillion: 6 }),
    ]);

    expect(diffPublishedRevisions(previous, current).priceDrops).toEqual([]);
  });

  it('treats estimated models as published model identities while independently requiring primary price evidence', () => {
    const previous = snapshot('revision-1', [model('provider:estimated', 'estimated')], [
      price({ modelKey: 'provider:estimated', routeId: 'direct:estimated', inputUsdPerMillion: 3, outputUsdPerMillion: 8 }),
    ]);
    const current = snapshot('revision-2', [
      model('provider:estimated', 'estimated'),
      model('provider:estimated-new', 'estimated'),
    ], [
      price({ modelKey: 'provider:estimated', routeId: 'direct:estimated', inputUsdPerMillion: 2, outputUsdPerMillion: 8 }),
      price({ modelKey: 'provider:estimated-new', routeId: 'direct:estimated-new', inputUsdPerMillion: 1, outputUsdPerMillion: 2 }),
    ]);

    const changes = diffPublishedRevisions(previous, current);

    expect(changes.newModels.map((fact) => fact.modelKey)).toEqual(['provider:estimated-new']);
    expect(changes.priceDrops.map((fact) => fact.modelKey)).toEqual(['provider:estimated']);
  });

  it('fails closed when duplicate primary rows disagree about one exact route', () => {
    const previous = snapshot('revision-1', [model('provider:alpha')], [
      price({ inputUsdPerMillion: 3, outputUsdPerMillion: 6 }),
    ]);
    const current = snapshot('revision-2', [model('provider:alpha')], [
      price({ inputUsdPerMillion: 2, outputUsdPerMillion: 6 }),
      price({ inputUsdPerMillion: 3, outputUsdPerMillion: 6 }),
    ]);

    expect(diffPublishedRevisions(previous, current).priceDrops).toEqual([]);
    expect(diffPublishedRevisions(
      previous,
      snapshot(current.revision, current.models, [...current.priceChecks].reverse()),
    ).priceDrops).toEqual([]);
  });

  it('deduplicates facts and orders them stably without mutating frozen snapshots', () => {
    const previous = snapshot('revision-1', [
      model('provider:zeta'),
      model('provider:alpha'),
      model('provider:alpha'),
    ], [
      price({ modelKey: 'provider:zeta', routeId: 'direct:zeta', inputUsdPerMillion: 6, outputUsdPerMillion: 9 }),
      price({ modelKey: 'provider:alpha', routeId: 'direct:z', inputUsdPerMillion: 4, outputUsdPerMillion: 9 }),
      price({ modelKey: 'provider:alpha', routeId: 'direct:a', inputUsdPerMillion: 3, outputUsdPerMillion: 8 }),
    ]);
    const current = snapshot('revision-2', [
      model('provider:new-z'),
      model('provider:alpha'),
      model('provider:new-a'),
      model('provider:new-a'),
      model('provider:zeta'),
    ], [
      price({ modelKey: 'provider:alpha', routeId: 'direct:z', inputUsdPerMillion: 3, outputUsdPerMillion: 9 }),
      price({ modelKey: 'provider:alpha', routeId: 'direct:a', inputUsdPerMillion: 2, outputUsdPerMillion: 8 }),
      price({ modelKey: 'provider:alpha', routeId: 'direct:a', inputUsdPerMillion: 2, outputUsdPerMillion: 8 }),
      price({ modelKey: 'provider:zeta', routeId: 'direct:zeta', inputUsdPerMillion: 6, outputUsdPerMillion: 9 }),
    ]);
    const previousBefore = structuredClone(previous);
    const currentBefore = structuredClone(current);

    const changes = diffPublishedRevisions(previous, current);
    const reordered = diffPublishedRevisions(
      snapshot(previous.revision, [...previous.models].reverse(), [...previous.priceChecks].reverse()),
      snapshot(current.revision, [...current.models].reverse(), [...current.priceChecks].reverse()),
    );

    expect(changes).toEqual(reordered);
    expect(changes.newModels.map((fact) => fact.modelKey)).toEqual(['provider:new-a', 'provider:new-z']);
    expect(changes.priceDrops.map((fact) => `${fact.modelKey}/${fact.providerId}/${fact.routeId}`)).toEqual([
      'provider:alpha/provider/direct:a',
      'provider:alpha/provider/direct:z',
    ]);
    expect(changes.newModels.map((fact) => fact.id)).toEqual([
      '["revision-2","new-model","provider:new-a","",""]',
      '["revision-2","new-model","provider:new-z","",""]',
    ]);
    expect(changes.priceDrops.map((fact) => fact.id)).toEqual([
      '["revision-2","price-drop","provider:alpha","provider","direct:a"]',
      '["revision-2","price-drop","provider:alpha","provider","direct:z"]',
    ]);
    expect(JSON.parse(changes.dedupeKey)).toEqual([
      'revision-1',
      'revision-2',
      '["revision-2","new-model","provider:new-a","",""]',
      '["revision-2","new-model","provider:new-z","",""]',
      '["revision-2","price-drop","provider:alpha","provider","direct:a"]',
      '["revision-2","price-drop","provider:alpha","provider","direct:z"]',
    ]);
    expect(previous).toEqual(previousBefore);
    expect(current).toEqual(currentBefore);
  });
});
