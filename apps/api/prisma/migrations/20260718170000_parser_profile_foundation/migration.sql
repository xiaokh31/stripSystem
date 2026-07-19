-- Parser-profile learning linkage, immutable profile definitions, evidence,
-- audit history, source identity, review status, and default RBAC grants.

ALTER TYPE "ParseStatus" ADD VALUE IF NOT EXISTS 'REVIEW_REQUIRED';

CREATE TYPE "ParserSourceKind" AS ENUM ('BUILT_IN', 'MANUAL', 'PROFILE');
CREATE TYPE "ParserProfileLifecycle" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'RETIRED');
CREATE TYPE "ParserProfileTrustState" AS ENUM ('REVIEW_REQUIRED', 'TRUSTED');
CREATE TYPE "ParserLearningCaseStatus" AS ENUM ('DRAFT', 'LINKED', 'CLOSED');
CREATE TYPE "ParserProfileEvidenceOutcome" AS ENUM ('ACCEPTED', 'MATERIAL_CORRECTION');
CREATE TYPE "ParserProfileAuditEventCode" AS ENUM (
  'PROFILE_CREATED',
  'CASE_CREATED',
  'CONTAINER_LINKED',
  'CONTAINER_UNLINKED',
  'MAPPING_SAVED',
  'SUBMITTED',
  'REPLAYED',
  'PROFILE_APPROVED',
  'EVIDENCE_ACCEPTED',
  'EVIDENCE_MATERIAL_CORRECTION',
  'PROFILE_TRUSTED',
  'PROFILE_PAUSED',
  'PROFILE_RETIRED',
  'CASE_CLOSED',
  'IMPORT_DELETE_BLOCKED'
);

CREATE TABLE "parser_profile_families" (
  "id" TEXT NOT NULL,
  "stable_name" TEXT NOT NULL,
  "customer_label" TEXT,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parser_profile_families_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "parser_profile_families_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "parser_profile_versions" (
  "id" TEXT NOT NULL,
  "family_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "lifecycle" "ParserProfileLifecycle" NOT NULL DEFAULT 'DRAFT',
  "trust_state" "ParserProfileTrustState" NOT NULL DEFAULT 'REVIEW_REQUIRED',
  "mapping_definition" JSONB NOT NULL,
  "fingerprint_definition" JSONB NOT NULL,
  "matcher_version" TEXT NOT NULL,
  "mapping_version" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "approved_by_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parser_profile_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "parser_profile_versions_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "parser_profile_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_versions_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_versions_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_versions_approval_pair_check"
    CHECK (("approved_by_id" IS NULL) = ("approved_at" IS NULL))
);

ALTER TABLE "containers"
  ADD COLUMN "parser_source_kind" "ParserSourceKind" NOT NULL DEFAULT 'BUILT_IN',
  ADD COLUMN "parser_profile_version_id" TEXT;

UPDATE "containers"
SET "parser_source_kind" = 'MANUAL'
WHERE "import_file_id" IS NULL
  AND "parser_version" = 'manual-entry-v1';

ALTER TABLE "containers"
  ADD CONSTRAINT "containers_parser_profile_version_id_fkey"
  FOREIGN KEY ("parser_profile_version_id") REFERENCES "parser_profile_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "containers_parser_source_identity_check"
  CHECK (
    ("parser_source_kind" = 'PROFILE' AND "parser_profile_version_id" IS NOT NULL)
    OR ("parser_source_kind" <> 'PROFILE' AND "parser_profile_version_id" IS NULL)
  );

CREATE TABLE "parser_learning_cases" (
  "id" TEXT NOT NULL,
  "source_import_id" TEXT,
  "source_import_reference_id" TEXT NOT NULL,
  "source_file_sha256" TEXT NOT NULL,
  "linked_container_id" TEXT,
  "status" "ParserLearningCaseStatus" NOT NULL DEFAULT 'DRAFT',
  "draft_definition" JSONB,
  "completion_snapshot" JSONB,
  "replay_summary" JSONB,
  "created_by_id" TEXT NOT NULL,
  "updated_by_id" TEXT NOT NULL,
  "closed_by_id" TEXT,
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parser_learning_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "parser_learning_cases_source_import_id_fkey"
    FOREIGN KEY ("source_import_id") REFERENCES "import_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_learning_cases_linked_container_id_fkey"
    FOREIGN KEY ("linked_container_id") REFERENCES "containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_learning_cases_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_learning_cases_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_learning_cases_closed_by_id_fkey"
    FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_learning_cases_state_check"
    CHECK (
      ("status" = 'CLOSED' AND "source_import_id" IS NULL AND "linked_container_id" IS NULL AND "closed_by_id" IS NOT NULL AND "closed_at" IS NOT NULL)
      OR ("status" = 'LINKED' AND "source_import_id" IS NOT NULL AND "linked_container_id" IS NOT NULL AND "closed_by_id" IS NULL AND "closed_at" IS NULL)
      OR ("status" = 'DRAFT' AND "source_import_id" IS NOT NULL AND "linked_container_id" IS NULL AND "closed_by_id" IS NULL AND "closed_at" IS NULL)
    )
);

CREATE TABLE "parser_profile_evidence" (
  "id" TEXT NOT NULL,
  "profile_version_id" TEXT NOT NULL,
  "import_file_id" TEXT NOT NULL,
  "outcome" "ParserProfileEvidenceOutcome" NOT NULL,
  "accepted" BOOLEAN NOT NULL DEFAULT false,
  "material_correction" BOOLEAN NOT NULL DEFAULT false,
  "result_snapshot" JSONB,
  "correction_diff" JSONB,
  "reviewed_by_id" TEXT NOT NULL,
  "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parser_profile_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "parser_profile_evidence_profile_version_id_fkey"
    FOREIGN KEY ("profile_version_id") REFERENCES "parser_profile_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_evidence_import_file_id_fkey"
    FOREIGN KEY ("import_file_id") REFERENCES "import_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_evidence_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_evidence_outcome_check"
    CHECK (
      ("outcome" = 'ACCEPTED' AND "accepted" = true AND "material_correction" = false)
      OR ("outcome" = 'MATERIAL_CORRECTION' AND "accepted" = false AND "material_correction" = true)
    )
);

CREATE TABLE "parser_profile_audit_events" (
  "id" TEXT NOT NULL,
  "event_code" "ParserProfileAuditEventCode" NOT NULL,
  "actor_id" TEXT NOT NULL,
  "profile_family_id" TEXT,
  "profile_version_id" TEXT,
  "learning_case_id" TEXT,
  "import_file_id" TEXT,
  "container_id" TEXT,
  "metadata" JSONB,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parser_profile_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "parser_profile_audit_events_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_audit_events_profile_family_id_fkey"
    FOREIGN KEY ("profile_family_id") REFERENCES "parser_profile_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_audit_events_profile_version_id_fkey"
    FOREIGN KEY ("profile_version_id") REFERENCES "parser_profile_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_audit_events_learning_case_id_fkey"
    FOREIGN KEY ("learning_case_id") REFERENCES "parser_learning_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_audit_events_import_file_id_fkey"
    FOREIGN KEY ("import_file_id") REFERENCES "import_files"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_audit_events_container_id_fkey"
    FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "parser_profile_families_stable_name_key" ON "parser_profile_families"("stable_name");
CREATE INDEX "parser_profile_families_created_by_id_idx" ON "parser_profile_families"("created_by_id");
CREATE INDEX "parser_profile_families_created_at_idx" ON "parser_profile_families"("created_at");

CREATE UNIQUE INDEX "parser_profile_versions_family_id_version_key" ON "parser_profile_versions"("family_id", "version");
CREATE INDEX "parser_profile_versions_lifecycle_trust_state_idx" ON "parser_profile_versions"("lifecycle", "trust_state");
CREATE INDEX "parser_profile_versions_created_by_id_idx" ON "parser_profile_versions"("created_by_id");
CREATE INDEX "parser_profile_versions_approved_by_id_idx" ON "parser_profile_versions"("approved_by_id");
CREATE INDEX "parser_profile_versions_created_at_idx" ON "parser_profile_versions"("created_at");

CREATE INDEX "containers_parser_source_kind_idx" ON "containers"("parser_source_kind");
CREATE INDEX "containers_parser_profile_version_id_idx" ON "containers"("parser_profile_version_id");

CREATE UNIQUE INDEX "parser_learning_cases_source_import_id_key" ON "parser_learning_cases"("source_import_id");
CREATE UNIQUE INDEX "parser_learning_cases_linked_container_id_key" ON "parser_learning_cases"("linked_container_id");
CREATE INDEX "parser_learning_cases_source_import_reference_id_idx" ON "parser_learning_cases"("source_import_reference_id");
CREATE INDEX "parser_learning_cases_source_file_sha256_idx" ON "parser_learning_cases"("source_file_sha256");
CREATE INDEX "parser_learning_cases_status_idx" ON "parser_learning_cases"("status");
CREATE INDEX "parser_learning_cases_created_by_id_idx" ON "parser_learning_cases"("created_by_id");
CREATE INDEX "parser_learning_cases_updated_by_id_idx" ON "parser_learning_cases"("updated_by_id");
CREATE INDEX "parser_learning_cases_closed_by_id_idx" ON "parser_learning_cases"("closed_by_id");
CREATE INDEX "parser_learning_cases_created_at_idx" ON "parser_learning_cases"("created_at");

CREATE UNIQUE INDEX "parser_profile_evidence_profile_version_id_import_file_id_key"
  ON "parser_profile_evidence"("profile_version_id", "import_file_id");
CREATE INDEX "parser_profile_evidence_import_file_id_idx" ON "parser_profile_evidence"("import_file_id");
CREATE INDEX "parser_profile_evidence_outcome_idx" ON "parser_profile_evidence"("outcome");
CREATE INDEX "parser_profile_evidence_reviewed_by_id_idx" ON "parser_profile_evidence"("reviewed_by_id");
CREATE INDEX "parser_profile_evidence_reviewed_at_idx" ON "parser_profile_evidence"("reviewed_at");

CREATE INDEX "parser_profile_audit_events_event_code_idx" ON "parser_profile_audit_events"("event_code");
CREATE INDEX "parser_profile_audit_events_actor_id_idx" ON "parser_profile_audit_events"("actor_id");
CREATE INDEX "parser_profile_audit_events_profile_family_id_idx" ON "parser_profile_audit_events"("profile_family_id");
CREATE INDEX "parser_profile_audit_events_profile_version_id_idx" ON "parser_profile_audit_events"("profile_version_id");
CREATE INDEX "parser_profile_audit_events_learning_case_id_idx" ON "parser_profile_audit_events"("learning_case_id");
CREATE INDEX "parser_profile_audit_events_import_file_id_idx" ON "parser_profile_audit_events"("import_file_id");
CREATE INDEX "parser_profile_audit_events_container_id_idx" ON "parser_profile_audit_events"("container_id");
CREATE INDEX "parser_profile_audit_events_occurred_at_idx" ON "parser_profile_audit_events"("occurred_at");

CREATE FUNCTION "prevent_parser_profile_definition_update"() RETURNS trigger AS $$
BEGIN
  IF NEW."mapping_definition" IS DISTINCT FROM OLD."mapping_definition"
     OR NEW."fingerprint_definition" IS DISTINCT FROM OLD."fingerprint_definition"
     OR NEW."matcher_version" IS DISTINCT FROM OLD."matcher_version"
     OR NEW."mapping_version" IS DISTINCT FROM OLD."mapping_version"
     OR NEW."family_id" IS DISTINCT FROM OLD."family_id"
     OR NEW."version" IS DISTINCT FROM OLD."version" THEN
    RAISE EXCEPTION 'PARSER_PROFILE_DEFINITION_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "parser_profile_versions_definition_immutable"
BEFORE UPDATE ON "parser_profile_versions"
FOR EACH ROW EXECUTE FUNCTION "prevent_parser_profile_definition_update"();

WITH permission_rows(id, code, description) AS (
  VALUES
    ('permission_parser_profiles_read', 'parser_profiles.read', 'Read parser profiles and learning cases.'),
    ('permission_parser_profiles_train', 'parser_profiles.train', 'Create and link parser learning cases.'),
    ('permission_parser_profiles_review', 'parser_profiles.review', 'Review parser-profile parse evidence.'),
    ('permission_parser_profiles_approve', 'parser_profiles.approve', 'Approve and govern parser profiles.')
)
INSERT INTO "permissions" ("id", "code", "category", "description", "is_system", "created_at", "updated_at")
SELECT id, code, 'parser_profiles', description, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM permission_rows
ON CONFLICT ("code") DO UPDATE SET
  "category" = EXCLUDED."category",
  "description" = EXCLUDED."description",
  "is_system" = true,
  "updated_at" = CURRENT_TIMESTAMP;

WITH role_permission_codes(role_code, permission_code) AS (
  VALUES
    ('ADMIN', 'parser_profiles.read'),
    ('ADMIN', 'parser_profiles.train'),
    ('ADMIN', 'parser_profiles.review'),
    ('ADMIN', 'parser_profiles.approve'),
    ('OFFICE', 'parser_profiles.read'),
    ('OFFICE', 'parser_profiles.train'),
    ('OFFICE', 'parser_profiles.review')
)
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at", "updated_at")
SELECT
  'rp_' || md5(role_permission_codes.role_code || ':' || role_permission_codes.permission_code),
  roles."id",
  permissions."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM role_permission_codes
JOIN "roles" roles ON roles."code" = role_permission_codes.role_code
JOIN "permissions" permissions ON permissions."code" = role_permission_codes.permission_code
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
