-- LiveBench evidence is staged by an attempt-owned revision and is never made
-- public until its source manifest, immutable artifacts, relationships, and
-- independently verified license record are complete. This migration depends
-- on the additive pipeline foundation in 0013; it does not alter benchmark
-- publication state or existing facts.

-- The project owner has already reviewed and accepted this source-license
-- classification. Seed the canonical licence text so ingestion is reproducible
-- and does not depend on an operator-supplied runtime assertion.
-- LiveBench is distributed under Apache-2.0: the benchmark repository carries it
-- at its root, the paper and datasheet both state it, and the published
-- HuggingFace dataset is tagged with it. An earlier revision of this pipeline
-- recorded LiveBench as CDLA-Permissive-2.0, a licence LiveBench never adopted.
-- The CDLA row below is retained because the source contract still admits it for
-- other sources; nothing references it today.
--
-- Apache-2.0 carries two obligations we owe upstream: retain the attribution and
-- state that changes were made. TokenBench re-aggregates and re-prices LiveBench
-- evidence, so both are carried in the published attribution text.
INSERT INTO pipeline_license_registry (
  license_id, canonical_url, license_text, license_text_hash, observed_at
) VALUES (
  'Apache-2.0',
  'https://www.apache.org/licenses/LICENSE-2.0.txt',
  '
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don''t include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
',
  'sha256:cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30',
  '2026-08-24T00:00:00.000Z'
);

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
-- unverified licence assertions cannot become public even through direct SQL.
CREATE TRIGGER IF NOT EXISTS trg_livebench_pointer_insert_current_published
BEFORE INSERT ON livebench_publication_state
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM livebench_releases
  WHERE revision = NEW.active_revision
    AND release_kind = 'current'
    AND publication_state = 'published'
    AND license_id = 'Apache-2.0'
    AND license_verification_state = 'verified'
)
BEGIN
  SELECT RAISE(ABORT, 'LiveBench publication pointer requires a verified current published Apache-2.0 release');
END;

CREATE TRIGGER IF NOT EXISTS trg_livebench_pointer_update_current_published
BEFORE UPDATE OF active_revision ON livebench_publication_state
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM livebench_releases
  WHERE revision = NEW.active_revision
    AND release_kind = 'current'
    AND publication_state = 'published'
    AND license_id = 'Apache-2.0'
    AND license_verification_state = 'verified'
)
BEGIN
  SELECT RAISE(ABORT, 'LiveBench publication pointer requires a verified current published Apache-2.0 release');
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
