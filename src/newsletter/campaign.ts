import { createHash } from 'node:crypto';
import {
  renderNewsletterHtml,
  subjectPreviewSet,
  type CheatsheetDocument,
  type SubjectPreview,
} from './cheatsheet';
import type { RevisionChanges } from './revision-diff';

export interface CampaignArtifactFile {
  readonly name: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface CampaignManifest {
  readonly schemaVersion: 'tokenbench-cheatsheet/v1';
  readonly revision: string;
  readonly catalogRevision: string;
  readonly generatedAt: string;
  readonly changes: {
    readonly fromRevision: string;
    readonly toRevision: string;
    readonly dedupeKey: string;
  };
  readonly files: readonly CampaignArtifactFile[];
}

export interface CampaignArtifactBundle {
  readonly manifest: CampaignManifest;
  readonly artifacts: readonly {
    readonly name: string;
    readonly bytes: Uint8Array;
  }[];
}

export interface CampaignDraft {
  readonly dedupeKey: string;
  readonly audience: 'monthly-cheatsheet';
  readonly name: string;
  readonly subject: string;
  readonly previewText: string;
  readonly htmlContent: string;
  /** Resolved to the configured monthly list at the server-only Brevo boundary. */
  readonly recipients: { readonly listIds: readonly number[] };
  readonly attachmentUrl: string;
}

export interface EditorialVariant {
  readonly subject: string;
  readonly previewText: string;
  /** Optional citations supplied by an editorial tool for its selected facts. */
  readonly factIds?: readonly string[];
}

/** The only structured input an optional editorial helper may receive. */
export interface EditorialFactObject {
  readonly manifest: CampaignManifest;
  readonly changes: RevisionChanges;
}

export interface EditorialValidationResult {
  readonly valid: boolean;
  readonly reason?: 'invalid-fact-object' | 'invalid-text' | 'unknown-fact-id' | 'unknown-model' | 'unreviewed-number' | 'rank-claim' | 'unknown-revision';
}

const REQUIRED_ARTIFACTS = [
  'tokenbench-cheatsheet.csv',
  'tokenbench-cheatsheet.html',
  'tokenbench-cheatsheet-newsletter.html',
  'tokenbench-cheatsheet.pdf',
  'tokenbench-cheatsheet-subjects.json',
] as const;

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

function fail(message: string): never {
  throw new RangeError(message);
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function expectedDocument(manifest: CampaignManifest): CheatsheetDocument {
  return {
    revision: manifest.revision,
    catalogRevision: manifest.catalogRevision,
    generatedAt: manifest.generatedAt,
    publishedAt: manifest.generatedAt,
    categories: [],
  };
}

function verifiedArtifacts(bundle: CampaignArtifactBundle): ReadonlyMap<string, Uint8Array> {
  const manifestFiles = new Map<string, CampaignArtifactFile>();
  for (const file of bundle.manifest.files) {
    if (!file || typeof file.name !== 'string' || manifestFiles.has(file.name)) {
      fail('campaign manifest must contain unique artifact names');
    }
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^sha256:[a-f0-9]{64}$/u.test(file.sha256)) {
      fail('campaign manifest contains an invalid artifact digest');
    }
    manifestFiles.set(file.name, file);
  }
  for (const name of REQUIRED_ARTIFACTS) {
    if (!manifestFiles.has(name)) fail('campaign manifest is missing a required artifact');
  }

  const artifacts = new Map<string, Uint8Array>();
  for (const artifact of bundle.artifacts) {
    if (!artifact || typeof artifact.name !== 'string' || artifacts.has(artifact.name)) {
      fail('campaign bundle must contain unique artifacts');
    }
    const expected = manifestFiles.get(artifact.name);
    if (!expected || expected.bytes !== artifact.bytes.byteLength || expected.sha256 !== sha256(artifact.bytes)) {
      fail('campaign artifact does not match its manifest digest');
    }
    artifacts.set(artifact.name, artifact.bytes);
  }
  if (artifacts.size !== manifestFiles.size) fail('campaign bundle is missing a manifest artifact');
  return artifacts;
}

function artifactBaseUrl(value: string): URL {
  if (typeof value !== 'string' || value.length === 0) fail('artifact base URL is required');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail('artifact base URL must be HTTPS');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) {
    fail('artifact base URL must be an HTTPS directory URL');
  }
  return url;
}

function parseSubjectPreviews(bytes: Uint8Array): readonly SubjectPreview[] {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail('campaign subject variants must be valid JSON');
  }
  if (!Array.isArray(value) || value.some((variant) => !variant
    || typeof variant !== 'object'
    || typeof (variant as SubjectPreview).subject !== 'string'
    || typeof (variant as SubjectPreview).previewText !== 'string')) {
    fail('campaign subject variants are invalid');
  }
  return value as readonly SubjectPreview[];
}

function campaignName(manifest: CampaignManifest, dedupeKey: string): string {
  const suffix = createHash('sha256').update(dedupeKey).digest('hex').slice(0, 16);
  return `TokenBench monthly cheatsheet ${manifest.revision} ${suffix}`;
}

function invalidEditorial(reason: Exclude<EditorialValidationResult['reason'], undefined>): EditorialValidationResult {
  return { valid: false, reason };
}

function matchingChanges(manifest: CampaignManifest, changes: RevisionChanges): boolean {
  return manifest.revision === changes.toRevision
    && manifest.changes.fromRevision === changes.fromRevision
    && manifest.changes.toRevision === changes.toRevision
    && manifest.changes.dedupeKey === changes.dedupeKey;
}

function numericFacts(manifest: CampaignManifest, changes: RevisionChanges): ReadonlySet<string> {
  const values = new Set<string>([
    String(changes.newModels.length),
    String(changes.priceDrops.length),
  ]);
  for (const value of manifest.generatedAt.match(/\d+/gu) ?? []) values.add(String(Number(value)));
  for (const price of changes.priceDrops) {
    for (const value of [
      price.previousInputUsdPerMillion,
      price.currentInputUsdPerMillion,
      price.previousOutputUsdPerMillion,
      price.currentOutputUsdPerMillion,
    ]) {
      if (value !== null) values.add(String(value));
    }
  }
  return values;
}

function writtenNumber(value: string): string | null {
  const normalized = value.toLowerCase();
  if (Object.hasOwn(NUMBER_WORDS, normalized)) return String(NUMBER_WORDS[normalized]!);
  return /^\d+(?:\.\d+)?$/u.test(value) ? String(Number(value)) : null;
}

/**
 * Permits editorial phrasing only when every fact-shaped token is already in
 * the frozen manifest/change object. It deliberately has no model/API call.
 */
export function validateEditorialVariant(
  variant: EditorialVariant,
  factObject: EditorialFactObject,
): EditorialValidationResult {
  const manifest = factObject?.manifest;
  const changes = factObject?.changes;
  if (!manifest || !changes || manifest.schemaVersion !== 'tokenbench-cheatsheet/v1'
    || !matchingChanges(manifest, changes)) {
    return invalidEditorial('invalid-fact-object');
  }
  if (typeof variant?.subject !== 'string' || typeof variant.previewText !== 'string'
    || variant.subject.trim().length === 0 || variant.previewText.trim().length === 0
    || /[<>\u0000-\u001f]/u.test(variant.subject) || /[<>\u0000-\u001f]/u.test(variant.previewText)) {
    return invalidEditorial('invalid-text');
  }
  const text = `${variant.subject}\n${variant.previewText}`;
  if (variant.factIds !== undefined) {
    const reviewedFactIds = new Set([
      ...changes.newModels.map((fact) => fact.id),
      ...changes.priceDrops.map((fact) => fact.id),
    ]);
    if (!Array.isArray(variant.factIds) || variant.factIds.length === 0
      || variant.factIds.some((id) => typeof id !== 'string' || !reviewedFactIds.has(id))) {
      return invalidEditorial('unknown-fact-id');
    }
  }
  if (/\b(?:rank|ranking|top\s*\d+|number\s+\d+)\b|#\s*\d+/iu.test(text)) {
    return invalidEditorial('rank-claim');
  }

  const knownModelOrRouteIds = new Set([
    ...changes.newModels.map((fact) => fact.modelKey),
    ...changes.priceDrops.flatMap((fact) => [fact.modelKey, fact.routeId]),
  ]);
  for (const candidate of text.match(/[A-Za-z0-9][A-Za-z0-9._-]*:[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?/gu) ?? []) {
    if (!knownModelOrRouteIds.has(candidate)) return invalidEditorial('unknown-model');
  }
  const namedModelPatterns = [
    /\b([A-Z][A-Za-z0-9._-]*)\s+(?:is|was|became)\s+(?:a\s+)?(?:new\s+)?model\b/gu,
    /\b(?:new\s+)?model\s+(?:named\s+|called\s+)?([A-Z][A-Za-z0-9._-]*)\b/gu,
  ] as const;
  for (const pattern of namedModelPatterns) {
    for (const match of text.matchAll(pattern)) {
      if (!knownModelOrRouteIds.has(match[1]!)) return invalidEditorial('unknown-model');
    }
  }

  const revisions = new Set([
    manifest.revision,
    manifest.catalogRevision,
    changes.fromRevision,
    changes.toRevision,
  ]);
  for (const candidate of text.match(/\b(?:benchmark|catalog)[A-Za-z0-9_.-]+\b/giu) ?? []) {
    if (!revisions.has(candidate)) return invalidEditorial('unknown-revision');
  }

  const allowedNumbers = numericFacts(manifest, changes);
  for (const candidate of text.match(/(?<![A-Za-z0-9_-])\d+(?:\.\d+)?(?![A-Za-z0-9_-])/gu) ?? []) {
    if (!allowedNumbers.has(String(Number(candidate)))) return invalidEditorial('unreviewed-number');
  }
  const expectedNewModels = String(changes.newModels.length);
  const expectedPriceDrops = String(changes.priceDrops.length);
  for (const [, amount, kind] of text.matchAll(/\b(\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:new\s+)?(models?|verified\s+price\s+drops?)\b/giu)) {
    const expected = /model/iu.test(kind!) ? expectedNewModels : expectedPriceDrops;
    if (writtenNumber(amount!) !== expected) return invalidEditorial('unreviewed-number');
  }
  for (const [, amount] of text.matchAll(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:USD|dollars?)\b/giu)) {
    const value = writtenNumber(amount!);
    if (!value || !allowedNumbers.has(value)) return invalidEditorial('unreviewed-number');
  }
  return { valid: true };
}

/**
 * Projects a campaign only from a hash-verified frozen artifact bundle and the
 * revision diff used to generate it. Recipient list IDs remain unbound here so
 * the server-only Brevo adapter can resolve the one permitted audience.
 */
export function campaignFromArtifacts(
  bundle: CampaignArtifactBundle,
  changes: RevisionChanges,
  baseUrl: string,
): CampaignDraft {
  const manifest = bundle?.manifest;
  if (!manifest || manifest.schemaVersion !== 'tokenbench-cheatsheet/v1') {
    fail('campaign manifest schema is invalid');
  }
  if (!matchingChanges(manifest, changes)) {
    fail('campaign manifest does not match revision changes');
  }
  const artifacts = verifiedArtifacts(bundle);
  const newsletter = new TextDecoder().decode(artifacts.get('tokenbench-cheatsheet-newsletter.html'));
  const document = expectedDocument(manifest);
  if (newsletter !== renderNewsletterHtml(document, changes)) {
    fail('campaign newsletter HTML does not match frozen facts');
  }
  const generatedVariants = subjectPreviewSet(document, changes);
  const variants = parseSubjectPreviews(artifacts.get('tokenbench-cheatsheet-subjects.json')!);
  if (JSON.stringify(variants) !== JSON.stringify(generatedVariants) || variants.length === 0) {
    fail('campaign subject variants do not match frozen facts');
  }
  const url = artifactBaseUrl(baseUrl);
  const attachmentUrl = new URL('tokenbench-cheatsheet.pdf', url).toString();
  return {
    dedupeKey: changes.dedupeKey,
    audience: 'monthly-cheatsheet',
    name: campaignName(manifest, changes.dedupeKey),
    subject: variants[0]!.subject,
    previewText: variants[0]!.previewText,
    htmlContent: newsletter,
    recipients: { listIds: [] },
    attachmentUrl,
  };
}
