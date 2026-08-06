import { createHash } from 'node:crypto';
import { compareUtf8Binary } from '../benchmarks/contracts';
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
  readonly templateId: 'monthly-all-changes-v1';
  readonly factIds: readonly string[];
}

/** The only structured input an optional editorial helper may receive. */
export interface EditorialFactObject {
  readonly manifest: CampaignManifest;
  readonly changes: RevisionChanges;
}

export interface EditorialValidationResult {
  readonly valid: boolean;
  readonly reason?: 'invalid-fact-object' | 'invalid-selection' | 'unknown-template' | 'unknown-fact-id';
}

export interface CampaignArtifactUrls {
  readonly pdf: string;
  readonly csv: string;
}

const REQUIRED_ARTIFACTS = [
  'tokenbench-cheatsheet.csv',
  'tokenbench-cheatsheet.html',
  'tokenbench-cheatsheet-newsletter.html',
  'tokenbench-cheatsheet.pdf',
  'tokenbench-cheatsheet-subjects.json',
] as const;

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

function artifactUrl(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) {
    fail('artifact URL must be HTTPS');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail('artifact URL must be HTTPS');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !url.pathname.endsWith(`/${name}`)) {
    fail('artifact URL must be HTTPS');
  }
  return url.toString();
}

function validatedArtifactUrls(value: CampaignArtifactUrls): CampaignArtifactUrls {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('artifact URLs are required');
  return {
    pdf: artifactUrl(value.pdf, 'tokenbench-cheatsheet.pdf'),
    csv: artifactUrl(value.csv, 'tokenbench-cheatsheet.csv'),
  };
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

function reviewedFactIds(changes: RevisionChanges): readonly string[] {
  return [...changes.newModels.map((fact) => fact.id), ...changes.priceDrops.map((fact) => fact.id)]
    .sort(compareUtf8Binary);
}

/**
 * Permits editorial phrasing only when every fact-shaped token is already in
 * the frozen manifest/change object. It deliberately has no model/API call.
 */
export function validateEditorialVariant(
  variant: unknown,
  factObject: EditorialFactObject,
): EditorialValidationResult {
  const manifest = factObject?.manifest;
  const changes = factObject?.changes;
  if (!manifest || !changes || manifest.schemaVersion !== 'tokenbench-cheatsheet/v1'
    || !matchingChanges(manifest, changes)) {
    return invalidEditorial('invalid-fact-object');
  }
  if (!variant || typeof variant !== 'object' || Array.isArray(variant)) {
    return invalidEditorial('invalid-selection');
  }
  const selection = variant as Record<string, unknown>;
  if (Object.keys(selection).sort(compareUtf8Binary).join(',') !== 'factIds,templateId') {
    return invalidEditorial('invalid-selection');
  }
  if (selection.templateId !== 'monthly-all-changes-v1') {
    return invalidEditorial('unknown-template');
  }
  if (!Array.isArray(selection.factIds)) return invalidEditorial('invalid-selection');
  const supplied = selection.factIds;
  if (supplied.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 4_096
    || /[\u0000-\u001f\u007f]/u.test(id))) {
    return invalidEditorial('unknown-fact-id');
  }
  const expected = reviewedFactIds(changes);
  if (supplied.length !== expected.length || supplied.some((id, index) => id !== expected[index])) {
    return invalidEditorial('unknown-fact-id');
  }
  return { valid: true };
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function renderCampaignHtml(
  document: CheatsheetDocument,
  changes: RevisionChanges,
  urls: CampaignArtifactUrls,
): string {
  const downloads = `    <h2>Verified downloads</h2>\n    <p><a href="${htmlEscape(urls.pdf)}">PDF cheatsheet</a> · <a href="${htmlEscape(urls.csv)}">CSV data</a></p>\n`;
  return renderNewsletterHtml(document, changes).replace('  </main>', `${downloads}  </main>`);
}

/**
 * Projects a campaign only from a hash-verified frozen artifact bundle and the
 * revision diff used to generate it. Recipient list IDs remain unbound here so
 * the server-only Brevo adapter can resolve the one permitted audience.
 */
export function campaignFromArtifacts(
  bundle: CampaignArtifactBundle,
  changes: RevisionChanges,
  artifactUrls: CampaignArtifactUrls,
  editorialVariant: EditorialVariant = {
    templateId: 'monthly-all-changes-v1',
    factIds: reviewedFactIds(changes),
  },
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
  const urls = validatedArtifactUrls(artifactUrls);
  const editorial = validateEditorialVariant(editorialVariant, { manifest, changes });
  if (!editorial.valid) fail('campaign editorial selection is invalid');
  return {
    dedupeKey: changes.dedupeKey,
    audience: 'monthly-cheatsheet',
    name: campaignName(manifest, changes.dedupeKey),
    subject: variants[0]!.subject,
    previewText: variants[0]!.previewText,
    htmlContent: renderCampaignHtml(document, changes, urls),
    recipients: { listIds: [] },
    attachmentUrl: urls.pdf,
  };
}
