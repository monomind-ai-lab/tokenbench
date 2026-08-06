import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderNewsletterHtml, subjectPreviewSet, type CheatsheetDocument } from './cheatsheet';
import type { RevisionChanges } from './revision-diff';
import { campaignFromArtifacts, validateEditorialVariant } from './campaign';

const encoder = new TextEncoder();
const IMMUTABLE_ROOT = `https://artifacts.example.test/revisions/benchmark_fixture/sha256-${'a'.repeat(64)}/`;

function artifactUrls() {
  return {
    pdf: `${IMMUTABLE_ROOT}tokenbench-cheatsheet.pdf`,
    csv: `${IMMUTABLE_ROOT}tokenbench-cheatsheet.csv`,
  };
}

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function changes(): RevisionChanges {
  const newModelIds = [
    JSON.stringify(['benchmark_fixture', 'new-model', 'fixture:alpha', '', '']),
    JSON.stringify(['benchmark_fixture', 'new-model', 'fixture:bravo', '', '']),
  ];
  const priceDropId = JSON.stringify([
    'benchmark_fixture', 'price-drop', 'fixture:alpha', 'fixture', 'direct:alpha',
  ]);
  return {
    fromRevision: 'benchmark_previous',
    toRevision: 'benchmark_fixture',
    dedupeKey: JSON.stringify(['benchmark_previous', 'benchmark_fixture', ...newModelIds, priceDropId]),
    newModels: [
      { id: newModelIds[0], modelKey: 'fixture:alpha' },
      { id: newModelIds[1], modelKey: 'fixture:bravo' },
    ],
    priceDrops: [{
      id: priceDropId,
      modelKey: 'fixture:alpha',
      providerId: 'fixture',
      routeId: 'direct:alpha',
      previousInputUsdPerMillion: 2,
      currentInputUsdPerMillion: 1.5,
      previousOutputUsdPerMillion: 6,
      currentOutputUsdPerMillion: 5,
    }],
  };
}

function document(): CheatsheetDocument {
  return {
    revision: 'benchmark_fixture',
    catalogRevision: 'catalog_fixture',
    generatedAt: '2026-08-01T00:00:00.000Z',
    publishedAt: '2026-08-01T00:00:00.000Z',
    categories: [],
  };
}

function bundle(facts: RevisionChanges = changes()) {
  const newsletter = encoder.encode(renderNewsletterHtml(document(), facts));
  const subjects = encoder.encode(`${JSON.stringify(subjectPreviewSet(document(), facts), null, 2)}\n`);
  const files = [
    ['tokenbench-cheatsheet.csv', encoder.encode('modelKey\nfixture:alpha\n')],
    ['tokenbench-cheatsheet.html', encoder.encode('<!doctype html><title>cheatsheet</title>')],
    ['tokenbench-cheatsheet-newsletter.html', newsletter],
    ['tokenbench-cheatsheet.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46])],
    ['tokenbench-cheatsheet-subjects.json', subjects],
  ] as const;
  return {
    manifest: {
      schemaVersion: 'tokenbench-cheatsheet/v1' as const,
      revision: 'benchmark_fixture',
      catalogRevision: 'catalog_fixture',
      generatedAt: '2026-08-01T00:00:00.000Z',
      changes: {
        fromRevision: facts.fromRevision,
        toRevision: facts.toRevision,
        dedupeKey: facts.dedupeKey,
      },
      files: files.map(([name, bytes]) => ({ name, bytes: bytes.byteLength, sha256: digest(bytes) })),
    },
    artifacts: files.map(([name, bytes]) => ({ name, bytes })),
  };
}

describe('campaignFromArtifacts', () => {
  it('uses only hash-verified manifest and revision-change facts in campaign copy', () => {
    const draft = campaignFromArtifacts(
      bundle(),
      changes(),
      artifactUrls(),
    );

    expect(draft.subject).toBe('TokenBench August 2026: 2 new models and 1 verified price drop');
    expect(draft.previewText).toBe(
      'Frozen benchmark revision benchmark_fixture with validated ranks, evidence lenses, per-1M rates, and context windows.',
    );
    expect(draft.htmlContent).toContain('benchmark_fixture');
    expect(draft.htmlContent).toContain('fixture:bravo');
    expect(draft.htmlContent).not.toContain('best model for everyone');
    expect(draft.attachmentUrl).toBe(`${IMMUTABLE_ROOT}tokenbench-cheatsheet.pdf`);
    expect(draft.htmlContent).toContain(`${IMMUTABLE_ROOT}tokenbench-cheatsheet.csv`);
  });

  it('keeps a no-change revision factual and deterministic', () => {
    const noChanges: RevisionChanges = {
      fromRevision: 'benchmark_previous',
      toRevision: 'benchmark_fixture',
      dedupeKey: JSON.stringify(['benchmark_previous', 'benchmark_fixture']),
      newModels: [],
      priceDrops: [],
    };

    const draft = campaignFromArtifacts(
      bundle(noChanges),
      noChanges,
      artifactUrls(),
    );

    expect(draft.subject).toBe('TokenBench August 2026: no new models or verified price drops');
    expect(draft.htmlContent).toContain('Unavailable - no newly published model identities');
    expect(draft.htmlContent).toContain('Unavailable - no verified route price drops');
  });

  it('rejects a hash-valid newsletter artifact whose copy is not derivable from the facts', () => {
    const original = bundle();
    const injected = encoder.encode(`${new TextDecoder().decode(
      original.artifacts.find((artifact) => artifact.name === 'tokenbench-cheatsheet-newsletter.html')!.bytes,
    )}\n<p>best model for everyone</p>`);
    const altered = {
      manifest: {
        ...original.manifest,
        files: original.manifest.files.map((file) => file.name === 'tokenbench-cheatsheet-newsletter.html'
          ? { ...file, bytes: injected.byteLength, sha256: digest(injected) }
          : file),
      },
      artifacts: original.artifacts.map((artifact) => artifact.name === 'tokenbench-cheatsheet-newsletter.html'
        ? { ...artifact, bytes: injected }
        : artifact),
    };

    expect(() => campaignFromArtifacts(
      altered,
      changes(),
      artifactUrls(),
    )).toThrow(/frozen facts/i);
  });

  it('fails closed for non-HTTPS or ambiguous artifact base URLs', () => {
    expect(() => campaignFromArtifacts(bundle(), changes(), {
      ...artifactUrls(),
      pdf: 'http://artifacts.example.test/tokenbench-cheatsheet.pdf',
    }))
      .toThrow(/HTTPS/i);
    expect(() => campaignFromArtifacts(bundle(), changes(), {
      ...artifactUrls(),
      csv: 'https://user:password@artifacts.example.test/tokenbench-cheatsheet.csv',
    })).toThrow(/HTTPS/i);
  });

  it('preserves generated HTML escaping for factual model identities', () => {
    const modelKey = 'fixture:<alpha&bravo>';
    const id = JSON.stringify(['benchmark_fixture', 'new-model', modelKey, '', '']);
    const escapedChanges: RevisionChanges = {
      fromRevision: 'benchmark_previous',
      toRevision: 'benchmark_fixture',
      dedupeKey: JSON.stringify(['benchmark_previous', 'benchmark_fixture', id]),
      newModels: [{ id, modelKey }],
      priceDrops: [],
    };

    const draft = campaignFromArtifacts(
      bundle(escapedChanges),
      escapedChanges,
      artifactUrls(),
    );

    expect(draft.htmlContent).toContain('fixture:&lt;alpha&amp;bravo&gt;');
    expect(draft.htmlContent).not.toContain(modelKey);
  });
});

describe('validateEditorialVariant', () => {
  it('accepts only an allowlisted template with every required reviewed fact ID', () => {
    const reviewed = changes();
    const result = validateEditorialVariant(
      {
        templateId: 'monthly-all-changes-v1',
        factIds: [...reviewed.newModels.map((fact) => fact.id), ...reviewed.priceDrops.map((fact) => fact.id)],
      },
      { manifest: bundle().manifest, changes: reviewed },
    );

    expect(result).toEqual({ valid: true });
  });

  it.each([
    ['raw editorial prose', { subject: '2 new models', previewText: 'fixture:alpha is #1' }],
    ['an unknown template', { templateId: 'free-form-v1', factIds: [] }],
    ['a missing reviewed fact', { templateId: 'monthly-all-changes-v1', factIds: [changes().newModels[0]!.id] }],
    ['a duplicate reviewed fact', { templateId: 'monthly-all-changes-v1', factIds: [
      changes().newModels[0]!.id, changes().newModels[0]!.id,
    ] }],
    ['an injected fact ID', { templateId: 'monthly-all-changes-v1', factIds: ['fake\r\nclaim'] }],
  ])('rejects %s', (_label, variant) => {
    const result = validateEditorialVariant(
      variant,
      { manifest: bundle().manifest, changes: changes() },
    );

    expect(result.valid).toBe(false);
  });
});
