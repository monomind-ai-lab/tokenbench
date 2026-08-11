import { SITE_CONFIG } from '../../src/brand/site-config';
import { compareUtf8Binary } from '../../src/benchmarks/contracts';
import { modelPath, parseModelDirectoryRecord, type ModelDirectoryRecord } from '../../src/benchmarks/model-directory';
import { parseModelProfileSnapshotData } from '../../src/benchmarks/model-profile';
import type { BenchmarkApiEnv, D1Database } from '../_shared/benchmark-db';
import { escapeXmlText } from '../_shared/html';

const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const DIRECTORY_PAGE_SIZE = 500;
const PROFILE_HISTORY_LIMIT = 10;
const SITEMAP_URL_LIMIT = 50_000;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function directoryRecord(value: unknown): ModelDirectoryRecord | null {
  const row = record(value);
  if (!row) return null;
  return parseModelDirectoryRecord({
    modelKey: row.model_key,
    canonicalSlug: row.canonical_slug,
    displayName: row.display_name,
    creator: row.creator,
    sourceType: row.source_type,
    reasoningType: row.reasoning_type,
    familyId: row.family_id,
    variantId: row.variant_id,
    firstSeenRevision: row.first_seen_revision,
    firstSeenAt: row.first_seen_at,
    lastSeenRevision: row.last_seen_revision,
    lastSeenAt: row.last_seen_at,
    latestProfileRevision: row.latest_profile_revision,
    status: row.status,
    sourceId: row.source_id,
    sourceModelId: row.source_model_id,
    updatedAt: row.updated_at,
  });
}

async function all(db: D1Database, sql: string, ...values: unknown[]): Promise<unknown[]> {
  return (await db.prepare(sql).bind(...values).all()).results;
}

async function directoryPage(db: D1Database, offset: number): Promise<ModelDirectoryRecord[]> {
  const rows = await all(db, `
    SELECT * FROM benchmark_model_directory
    ORDER BY canonical_slug ASC, model_key ASC
    LIMIT ? OFFSET ?
  `, DIRECTORY_PAGE_SIZE, offset);
  return rows.map(directoryRecord).filter((row): row is ModelDirectoryRecord => row !== null);
}

async function validEntriesForPage(db: D1Database, directories: readonly ModelDirectoryRecord[]) {
  if (directories.length === 0) return [];
  const keys = directories.map((directory) => directory.modelKey);
  const rows = await all(db, `
    SELECT model_key, revision, profile_json, generated_at, profile_order
    FROM (
      SELECT snapshots.*,
        ROW_NUMBER() OVER (
          PARTITION BY snapshots.model_key
          ORDER BY snapshots.generated_at DESC, snapshots.revision DESC
        ) AS profile_order
      FROM benchmark_model_profile_snapshots AS snapshots
      WHERE snapshots.model_key IN (SELECT value FROM json_each(?))
    )
    WHERE profile_order <= ${PROFILE_HISTORY_LIMIT}
    ORDER BY model_key ASC, profile_order ASC
  `, JSON.stringify(keys));
  const byKey = new Map<string, Array<{ revision: string; profileJson: string; generatedAt: string; order: number }>>();
  rows.forEach((candidate) => {
    const row = record(candidate);
    if (!row || typeof row.model_key !== 'string' || typeof row.revision !== 'string' || typeof row.profile_json !== 'string' || typeof row.generated_at !== 'string') return;
    const current = byKey.get(row.model_key) ?? [];
    current.push({
      revision: row.revision,
      profileJson: row.profile_json,
      generatedAt: row.generated_at,
      order: Number.isSafeInteger(row.profile_order) ? Number(row.profile_order) : Number.MAX_SAFE_INTEGER,
    });
    byKey.set(row.model_key, current);
  });
  return directories.flatMap((directory) => {
    const candidates = (byKey.get(directory.modelKey) ?? []).slice().sort((left, right) => {
      if (left.revision === directory.latestProfileRevision && right.revision !== directory.latestProfileRevision) return -1;
      if (right.revision === directory.latestProfileRevision && left.revision !== directory.latestProfileRevision) return 1;
      return left.order - right.order || compareUtf8Binary(right.revision, left.revision);
    });
    for (const candidate of candidates) {
      const profile = parseModelProfileSnapshotData(candidate.profileJson);
      if (!profile
        || profile.identity.modelKey !== directory.modelKey
        || profile.identity.slug !== directory.canonicalSlug
        || profile.revision.revision !== candidate.revision) continue;
      return [{ slug: directory.canonicalSlug, lastModified: profile.revision.checkedAt }];
    }
    return [];
  });
}

async function readSitemapEntries(db: D1Database) {
  const entries: Array<{ slug: string; lastModified: string }> = [];
  for (let offset = 0; offset < SITEMAP_URL_LIMIT; offset += DIRECTORY_PAGE_SIZE) {
    const directories = await directoryPage(db, offset);
    entries.push(...await validEntriesForPage(db, directories));
    if (directories.length < DIRECTORY_PAGE_SIZE) break;
  }
  if (entries.length >= SITEMAP_URL_LIMIT) throw new Error('model sitemap requires partitioning');
  return entries.sort((left, right) => compareUtf8Binary(left.slug, right.slug));
}

function sitemap(entries: readonly { slug: string; lastModified: string }[]): string {
  const urls = entries.map((entry) => `  <url><loc>${escapeXmlText(`${SITE_CONFIG.origin}${modelPath(entry.slug)}`)}</loc><lastmod>${escapeXmlText(entry.lastModified)}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NAMESPACE}">\n${urls.join('\n')}${urls.length ? '\n' : ''}</urlset>\n`;
}

function response(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': status === 200 ? 'public, max-age=0, must-revalidate' : 'no-store',
      'Content-Type': 'application/xml; charset=utf-8',
      Vary: 'Accept-Encoding',
    },
  });
}

/** Emits every current or retained model whose latest reachable profile validates. */
export async function onRequestGet({ env }: { request?: Request; env: BenchmarkApiEnv }): Promise<Response> {
  if (!env.CATALOG_DB) return response(sitemap([]), 503);
  try { return response(sitemap(await readSitemapEntries(env.CATALOG_DB))); }
  catch { return response(sitemap([]), 503); }
}
