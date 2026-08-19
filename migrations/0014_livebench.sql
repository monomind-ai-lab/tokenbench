-- LiveBench evidence is staged by an attempt-owned revision and is never made
-- public until its source manifest, immutable artifacts, relationships, and
-- independently verified license record are complete. This migration depends
-- on the additive pipeline foundation in 0013; it does not alter benchmark
-- publication state or existing facts.

-- The project owner has already reviewed and accepted this source-license
-- classification. Seed the canonical CDLA text so ingestion is reproducible
-- and does not depend on an operator-supplied runtime assertion.
INSERT INTO pipeline_license_registry (
  license_id, canonical_url, license_text, license_text_hash, observed_at
) VALUES (
  'CDLA-Permissive-2.0',
  'https://cdla.dev/permissive-2-0/',
  'Community Data License Agreement - Permissive - Version 2.0

This is the Community Data License Agreement - Permissive, Version 2.0 (the "agreement"). Data Provider(s) and Data Recipient(s) agree as follows:

1. Provision of the Data

1.1. A Data Recipient may use, modify, and share the Data made available by Data Provider(s) under this agreement if that Data Recipient follows the terms of this agreement.

1.2. This agreement does not impose any restriction on a Data Recipient''s use, modification, or sharing of any portions of the Data that are in the public domain or that may be used, modified, or shared under any other legal exception or limitation.

2. Conditions for Sharing Data

2.1. A Data Recipient may share Data, with or without modifications, so long as the Data Recipient makes available the text of this agreement with the shared Data.

3. No Restrictions on Results

3.1. This agreement does not impose any restriction or obligations with respect to the use, modification, or sharing of Results.

4. No Warranty; Limitation of Liability

4.1. All Data Recipients receive the Data subject to the following terms:

THE DATA IS PROVIDED ON AN "AS IS" BASIS, WITHOUT REPRESENTATIONS, WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS OR IMPLIED INCLUDING, WITHOUT LIMITATION, ANY WARRANTIES OR CONDITIONS OF TITLE, NON-INFRINGEMENT, MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.

NO DATA PROVIDER SHALL HAVE ANY LIABILITY FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING WITHOUT LIMITATION LOST PROFITS), HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE DATA OR RESULTS, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

5. Definitions

5.1. "Data" means the material received by a Data Recipient under this agreement.

5.2. "Data Provider" means any person who is the source of Data provided under this agreement and in reliance on a Data Recipient''s agreement to its terms.

5.3. "Data Recipient" means any person who receives Data directly or indirectly from a Data Provider and agrees to the terms of this agreement.

5.4. "Results" means any outcome obtained by computational analysis of Data, including for example machine learning models and models'' insights.
',
  'sha256:4531a67d443284d93ffed0803df5b10634aff21c3d77e381f2d48af01d875868',
  '2026-08-19T00:00:00.000Z'
) ON CONFLICT(license_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS livebench_releases (
  revision TEXT PRIMARY KEY CHECK (length(trim(revision)) > 0),
  source_release_id TEXT NOT NULL CHECK (length(trim(source_release_id)) > 0),
  release_kind TEXT NOT NULL CHECK (release_kind IN ('current', 'historical')),
  publication_state TEXT NOT NULL CHECK (publication_state IN ('staged', 'validated', 'published', 'superseded', 'failed')),
  staging_attempt_id TEXT NOT NULL CHECK (length(trim(staging_attempt_id)) > 0),
  source_domain TEXT NOT NULL DEFAULT 'benchmark' CHECK (source_domain = 'benchmark'),
  source_id TEXT NOT NULL DEFAULT 'livebench' CHECK (source_id = 'livebench'),
  source_revision TEXT NOT NULL CHECK (length(trim(source_revision)) > 0),
  source_commit TEXT NOT NULL CHECK (length(trim(source_commit)) > 0),
  source_manifest_key TEXT NOT NULL CHECK (length(trim(source_manifest_key)) > 0),
  source_manifest_hash TEXT NOT NULL CHECK (
    length(source_manifest_hash) = 71
    AND substr(source_manifest_hash, 1, 7) = 'sha256:'
    AND substr(source_manifest_hash, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  source_fingerprint TEXT NOT NULL CHECK (
    length(source_fingerprint) = 71
    AND substr(source_fingerprint, 1, 7) = 'sha256:'
    AND substr(source_fingerprint, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  observed_at TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  released_at TEXT NOT NULL,
  published_at TEXT,
  license_id TEXT NOT NULL REFERENCES pipeline_license_registry(license_id),
  license_verification_state TEXT NOT NULL CHECK (license_verification_state IN ('pending', 'verified', 'rejected')),
  license_verification_url TEXT,
  license_verified_at TEXT,
  license_verified_by TEXT,
  attribution_text TEXT NOT NULL CHECK (length(trim(attribution_text)) > 0),
  expected_artifact_count INTEGER NOT NULL CHECK (expected_artifact_count > 0),
  expected_category_count INTEGER NOT NULL CHECK (expected_category_count > 0),
  expected_task_count INTEGER NOT NULL CHECK (expected_task_count > 0),
  expected_model_count INTEGER NOT NULL CHECK (expected_model_count > 0),
  expected_score_count INTEGER NOT NULL CHECK (expected_score_count > 0),
  expected_economics_count INTEGER NOT NULL CHECK (expected_economics_count > 0),
  FOREIGN KEY (source_domain, source_id, source_revision)
    REFERENCES source_revision_manifests(domain, source_id, source_revision),
  CHECK (
    (license_verification_state = 'verified'
      AND license_verification_url LIKE 'https://%'
      AND license_verified_at IS NOT NULL
      AND license_verified_by IS NOT NULL
      AND length(trim(license_verified_by)) > 0)
    OR (license_verification_state <> 'verified')
  ),
  CHECK (release_kind = 'current' OR publication_state <> 'published'),
  CHECK ((publication_state = 'published' AND published_at IS NOT NULL) OR publication_state <> 'published'),
  CHECK (published_at IS NULL OR (release_kind = 'current' AND publication_state IN ('published', 'superseded')))
);

CREATE INDEX IF NOT EXISTS idx_livebench_releases_state_time
  ON livebench_releases (publication_state, checked_at DESC, released_at DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_livebench_releases_attempt
  ON livebench_releases (revision, staging_attempt_id)
  WHERE publication_state IN ('staged', 'validated');

-- These rows preserve the commit-pinned upstream artifact identity alongside
-- the common source_artifacts record. Every staged fact has one of these rows
-- as its provenance foreign key, so artifact gaps cannot be silently published.
CREATE TABLE IF NOT EXISTS livebench_release_artifacts (
  revision TEXT NOT NULL REFERENCES livebench_releases(revision),
  staging_attempt_id TEXT NOT NULL CHECK (length(trim(staging_attempt_id)) > 0),
  artifact_id TEXT NOT NULL CHECK (artifact_id IN ('table', 'categories', 'cost', 'model-links')),
  source_domain TEXT NOT NULL DEFAULT 'benchmark' CHECK (source_domain = 'benchmark'),
  source_id TEXT NOT NULL DEFAULT 'livebench' CHECK (source_id = 'livebench'),
  source_revision TEXT NOT NULL CHECK (length(trim(source_revision)) > 0),
  source_path TEXT NOT NULL CHECK (length(trim(source_path)) > 0),
  source_blob_id TEXT NOT NULL CHECK (length(trim(source_blob_id)) > 0),
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  PRIMARY KEY (revision, artifact_id),
  FOREIGN KEY (source_domain, source_id, source_revision, artifact_id)
    REFERENCES source_artifacts(domain, source_id, source_revision, artifact_id)
);

CREATE TABLE IF NOT EXISTS livebench_categories (
  revision TEXT NOT NULL REFERENCES livebench_releases(revision),
  staging_attempt_id TEXT NOT NULL CHECK (length(trim(staging_attempt_id)) > 0),
  category_id TEXT NOT NULL CHECK (length(trim(category_id)) > 0),
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  source_artifact_id TEXT NOT NULL CHECK (length(trim(source_artifact_id)) > 0),
  PRIMARY KEY (revision, category_id),
  FOREIGN KEY (revision, source_artifact_id)
    REFERENCES livebench_release_artifacts(revision, artifact_id)
);

CREATE TABLE IF NOT EXISTS livebench_tasks (
  revision TEXT NOT NULL REFERENCES livebench_releases(revision),
  staging_attempt_id TEXT NOT NULL CHECK (length(trim(staging_attempt_id)) > 0),
  task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0),
  category_id TEXT NOT NULL CHECK (length(trim(category_id)) > 0),
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  source_artifact_id TEXT NOT NULL CHECK (length(trim(source_artifact_id)) > 0),
  PRIMARY KEY (revision, task_id),
  FOREIGN KEY (revision, category_id)
    REFERENCES livebench_categories(revision, category_id),
  FOREIGN KEY (revision, source_artifact_id)
    REFERENCES livebench_release_artifacts(revision, artifact_id)
);
CREATE INDEX IF NOT EXISTS idx_livebench_tasks_revision_category
  ON livebench_tasks (revision, category_id, task_id);

-- configuration_id is the source configuration ID emitted by the parser.
-- canonical_configuration_id remains nullable on purpose: a proposal that has
-- not cleared identity review is stored as an explicit source-only identity,
-- never guessed into a canonical model.
CREATE TABLE IF NOT EXISTS livebench_model_configurations (
  revision TEXT NOT NULL REFERENCES livebench_releases(revision),
  staging_attempt_id TEXT NOT NULL CHECK (length(trim(staging_attempt_id)) > 0),
  configuration_id TEXT NOT NULL CHECK (length(trim(configuration_id)) > 0),
  source_id TEXT NOT NULL DEFAULT 'livebench' CHECK (source_id = 'livebench'),
  source_model_id TEXT NOT NULL CHECK (length(trim(source_model_id)) > 0),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  organization TEXT NOT NULL CHECK (length(trim(organization)) > 0),
  open_weights INTEGER CHECK (open_weights IS NULL OR open_weights IN (0, 1)),
  reasoner INTEGER CHECK (reasoner IS NULL OR reasoner IN (0, 1)),
  is_derivative_finetune INTEGER NOT NULL CHECK (is_derivative_finetune IN (0, 1)),
  base_configuration_id TEXT,
  lineage_source_url TEXT CHECK (lineage_source_url IS NULL OR lineage_source_url LIKE 'https://%'),
  canonical_configuration_id TEXT REFERENCES model_configurations(configuration_id),
  identity_match_kind TEXT NOT NULL CHECK (identity_match_kind IN ('exact', 'reviewed', 'proposal')),
  identity_review_status TEXT NOT NULL CHECK (identity_review_status IN ('verified', 'needs_review', 'rejected')),
  identity_reviewed_by TEXT,
  identity_evidence_url TEXT CHECK (identity_evidence_url IS NULL OR identity_evidence_url LIKE 'https://%'),
  source_artifact_id TEXT NOT NULL CHECK (length(trim(source_artifact_id)) > 0),
  PRIMARY KEY (revision, configuration_id),
  UNIQUE (revision, source_model_id),
  UNIQUE (revision, configuration_id, source_model_id),
  FOREIGN KEY (revision, source_artifact_id)
    REFERENCES livebench_release_artifacts(revision, artifact_id),
  CHECK (
    (canonical_configuration_id IS NULL
      AND (
        (identity_match_kind = 'proposal' AND identity_review_status = 'needs_review'
          AND identity_reviewed_by IS NULL AND identity_evidence_url IS NULL)
        OR (identity_match_kind = 'reviewed' AND identity_review_status = 'rejected'
          AND identity_reviewed_by IS NOT NULL AND length(trim(identity_reviewed_by)) > 0
          AND identity_evidence_url IS NOT NULL AND identity_evidence_url LIKE 'https://%')
      ))
    OR (canonical_configuration_id IS NOT NULL
      AND (
        (identity_match_kind = 'exact' AND identity_review_status = 'verified')
        OR (identity_match_kind = 'reviewed' AND identity_review_status = 'verified'
          AND identity_reviewed_by IS NOT NULL AND length(trim(identity_reviewed_by)) > 0
          AND identity_evidence_url IS NOT NULL AND identity_evidence_url LIKE 'https://%')
      ))
  )
);
CREATE INDEX IF NOT EXISTS idx_livebench_model_configurations_revision_source
  ON livebench_model_configurations (revision, source_id, source_model_id);

CREATE TABLE IF NOT EXISTS livebench_task_scores (
  revision TEXT NOT NULL REFERENCES livebench_releases(revision),
  staging_attempt_id TEXT NOT NULL CHECK (length(trim(staging_attempt_id)) > 0),
  configuration_id TEXT NOT NULL CHECK (length(trim(configuration_id)) > 0),
  source_model_id TEXT NOT NULL CHECK (length(trim(source_model_id)) > 0),
  task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0),
  source_id TEXT NOT NULL DEFAULT 'livebench' CHECK (source_id = 'livebench'),
  score REAL NOT NULL CHECK (
    typeof(score) IN ('integer', 'real') AND score = score
    AND score >= -1.7976931348623157e308 AND score <= 1.7976931348623157e308
  ),
  source_rank INTEGER CHECK (source_rank IS NULL OR (typeof(source_rank) = 'integer' AND source_rank > 0)),
  task_rank INTEGER CHECK (task_rank IS NULL OR (typeof(task_rank) = 'integer' AND task_rank > 0)),
  rank_field_size INTEGER CHECK (rank_field_size IS NULL OR (typeof(rank_field_size) = 'integer' AND rank_field_size > 0)),
  source_artifact_id TEXT NOT NULL CHECK (length(trim(source_artifact_id)) > 0),
  PRIMARY KEY (revision, configuration_id, task_id),
  FOREIGN KEY (revision, task_id) REFERENCES livebench_tasks(revision, task_id),
  FOREIGN KEY (revision, configuration_id, source_model_id)
    REFERENCES livebench_model_configurations(revision, configuration_id, source_model_id),
  FOREIGN KEY (revision, source_artifact_id)
    REFERENCES livebench_release_artifacts(revision, artifact_id),
  CHECK (rank_field_size IS NULL OR task_rank IS NULL OR task_rank <= rank_field_size)
);
CREATE INDEX IF NOT EXISTS idx_livebench_task_scores_revision_source_rank
  ON livebench_task_scores (revision, source_rank, source_model_id);
CREATE INDEX IF NOT EXISTS idx_livebench_task_scores_revision_task_rank
  ON livebench_task_scores (revision, task_id, task_rank, source_model_id);
CREATE INDEX IF NOT EXISTS idx_livebench_task_scores_revision_model_task_source
  ON livebench_task_scores (revision, source_model_id, task_id, source_id);

CREATE TABLE IF NOT EXISTS livebench_task_economics (
  revision TEXT NOT NULL REFERENCES livebench_releases(revision),
  staging_attempt_id TEXT NOT NULL CHECK (length(trim(staging_attempt_id)) > 0),
  configuration_id TEXT NOT NULL CHECK (length(trim(configuration_id)) > 0),
  source_model_id TEXT NOT NULL CHECK (length(trim(source_model_id)) > 0),
  task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0),
  source_id TEXT NOT NULL DEFAULT 'livebench' CHECK (source_id = 'livebench'),
  question_count INTEGER NOT NULL CHECK (typeof(question_count) = 'integer' AND question_count > 0),
  evaluation_cost_usd REAL NOT NULL CHECK (
    typeof(evaluation_cost_usd) IN ('integer', 'real') AND evaluation_cost_usd = evaluation_cost_usd
    AND evaluation_cost_usd >= 0 AND evaluation_cost_usd <= 1.7976931348623157e308
  ),
  input_price_usd_per_million REAL CHECK (input_price_usd_per_million IS NULL OR (
    typeof(input_price_usd_per_million) IN ('integer', 'real') AND input_price_usd_per_million = input_price_usd_per_million
    AND input_price_usd_per_million >= 0 AND input_price_usd_per_million <= 1.7976931348623157e308
  )),
  output_price_usd_per_million REAL CHECK (output_price_usd_per_million IS NULL OR (
    typeof(output_price_usd_per_million) IN ('integer', 'real') AND output_price_usd_per_million = output_price_usd_per_million
    AND output_price_usd_per_million >= 0 AND output_price_usd_per_million <= 1.7976931348623157e308
  )),
  mean_input_tokens REAL CHECK (mean_input_tokens IS NULL OR (
    typeof(mean_input_tokens) IN ('integer', 'real') AND mean_input_tokens = mean_input_tokens
    AND mean_input_tokens >= 0 AND mean_input_tokens <= 1.7976931348623157e308
  )),
  mean_output_tokens REAL CHECK (mean_output_tokens IS NULL OR (
    typeof(mean_output_tokens) IN ('integer', 'real') AND mean_output_tokens = mean_output_tokens
    AND mean_output_tokens >= 0 AND mean_output_tokens <= 1.7976931348623157e308
  )),
  source_artifact_id TEXT NOT NULL CHECK (length(trim(source_artifact_id)) > 0),
  PRIMARY KEY (revision, configuration_id, task_id),
  FOREIGN KEY (revision, task_id) REFERENCES livebench_tasks(revision, task_id),
  FOREIGN KEY (revision, configuration_id, source_model_id)
    REFERENCES livebench_model_configurations(revision, configuration_id, source_model_id),
  FOREIGN KEY (revision, source_artifact_id)
    REFERENCES livebench_release_artifacts(revision, artifact_id)
);
CREATE INDEX IF NOT EXISTS idx_livebench_task_economics_revision_model_task_source
  ON livebench_task_economics (revision, source_model_id, task_id, source_id);

CREATE TABLE IF NOT EXISTS livebench_publication_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  active_revision TEXT NOT NULL REFERENCES livebench_releases(revision),
  updated_at TEXT NOT NULL
);

-- A D1 foreign key proves a target revision exists, but these pointer guards
-- prove it is a verified, published *current* release. Historical releases and
-- unverified CDLA assertions cannot become public even through direct SQL.
CREATE TRIGGER IF NOT EXISTS trg_livebench_pointer_insert_current_published
BEFORE INSERT ON livebench_publication_state
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM livebench_releases
  WHERE revision = NEW.active_revision
    AND release_kind = 'current'
    AND publication_state = 'published'
    AND license_id = 'CDLA-Permissive-2.0'
    AND license_verification_state = 'verified'
)
BEGIN
  SELECT RAISE(ABORT, 'LiveBench publication pointer requires a verified current published CDLA release');
END;

CREATE TRIGGER IF NOT EXISTS trg_livebench_pointer_update_current_published
BEFORE UPDATE OF active_revision ON livebench_publication_state
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM livebench_releases
  WHERE revision = NEW.active_revision
    AND release_kind = 'current'
    AND publication_state = 'published'
    AND license_id = 'CDLA-Permissive-2.0'
    AND license_verification_state = 'verified'
)
BEGIN
  SELECT RAISE(ABORT, 'LiveBench publication pointer requires a verified current published CDLA release');
END;

-- New facts are insertable only while their parent candidate remains
-- attempt-owned and staged. This protects validation from a late worker replay
-- changing rows in a validated candidate between its completeness check and
-- final pointer batch.
CREATE TRIGGER IF NOT EXISTS trg_livebench_artifacts_stage_only
BEFORE INSERT ON livebench_release_artifacts
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM livebench_releases
  WHERE revision = NEW.revision
    AND staging_attempt_id = NEW.staging_attempt_id
    AND publication_state = 'staged'
)
BEGIN
  SELECT RAISE(ABORT, 'LiveBench artifacts require the owning staged attempt');
END;

CREATE TRIGGER IF NOT EXISTS trg_livebench_categories_stage_only
BEFORE INSERT ON livebench_categories
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM livebench_releases
  WHERE revision = NEW.revision
    AND staging_attempt_id = NEW.staging_attempt_id
    AND publication_state = 'staged'
)
BEGIN
  SELECT RAISE(ABORT, 'LiveBench categories require the owning staged attempt');
END;

CREATE TRIGGER IF NOT EXISTS trg_livebench_tasks_stage_only
BEFORE INSERT ON livebench_tasks
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM livebench_releases
  WHERE revision = NEW.revision
    AND staging_attempt_id = NEW.staging_attempt_id
    AND publication_state = 'staged'
)
BEGIN
  SELECT RAISE(ABORT, 'LiveBench tasks require the owning staged attempt');
END;

CREATE TRIGGER IF NOT EXISTS trg_livebench_models_stage_only
BEFORE INSERT ON livebench_model_configurations
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM livebench_releases
  WHERE revision = NEW.revision
    AND staging_attempt_id = NEW.staging_attempt_id
    AND publication_state = 'staged'
)
BEGIN
  SELECT RAISE(ABORT, 'LiveBench models require the owning staged attempt');
END;

CREATE TRIGGER IF NOT EXISTS trg_livebench_scores_stage_only
BEFORE INSERT ON livebench_task_scores
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM livebench_releases
  WHERE revision = NEW.revision
    AND staging_attempt_id = NEW.staging_attempt_id
    AND publication_state = 'staged'
)
BEGIN
  SELECT RAISE(ABORT, 'LiveBench scores require the owning staged attempt');
END;

CREATE TRIGGER IF NOT EXISTS trg_livebench_economics_stage_only
BEFORE INSERT ON livebench_task_economics
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM livebench_releases
  WHERE revision = NEW.revision
    AND staging_attempt_id = NEW.staging_attempt_id
    AND publication_state = 'staged'
)
BEGIN
  SELECT RAISE(ABORT, 'LiveBench economics require the owning staged attempt');
END;
