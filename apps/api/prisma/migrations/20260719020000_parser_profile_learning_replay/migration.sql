-- PARSER-PROFILE-03: resumable mapping revisions, replay jobs/artifacts, and
-- stable learning-case workflow states.

ALTER TABLE "parser_learning_cases"
  DROP CONSTRAINT "parser_learning_cases_state_check";

ALTER TABLE "parser_learning_cases"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "ParserLearningCaseStatus" RENAME TO "ParserLearningCaseStatus_old";

CREATE TYPE "ParserLearningCaseStatus" AS ENUM (
  'OPEN',
  'MAPPING',
  'READY_FOR_REPLAY',
  'REPLAY_FAILED',
  'AWAITING_COMPLETION',
  'AWAITING_APPROVAL',
  'CLOSED'
);

ALTER TABLE "parser_learning_cases"
  ALTER COLUMN "status" TYPE "ParserLearningCaseStatus"
  USING (
    CASE
      WHEN "status"::text = 'CLOSED' THEN 'CLOSED'
      ELSE 'OPEN'
    END
  )::"ParserLearningCaseStatus";

DROP TYPE "ParserLearningCaseStatus_old";

ALTER TABLE "parser_learning_cases"
  ALTER COLUMN "status" SET DEFAULT 'OPEN',
  ADD COLUMN "draft_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "active_replay_token" TEXT,
  ADD COLUMN "last_error_code" TEXT,
  ADD CONSTRAINT "parser_learning_cases_draft_revision_check"
    CHECK ("draft_revision" >= 0),
  ADD CONSTRAINT "parser_learning_cases_state_check"
    CHECK (
      (
        "status" = 'CLOSED'
        AND "source_import_id" IS NULL
        AND "linked_container_id" IS NULL
        AND "closed_by_id" IS NOT NULL
        AND "closed_at" IS NOT NULL
        AND "active_replay_token" IS NULL
      )
      OR (
        "status" <> 'CLOSED'
        AND "source_import_id" IS NOT NULL
        AND "closed_by_id" IS NULL
        AND "closed_at" IS NULL
        AND (
          "status" IN ('OPEN', 'MAPPING')
          OR "linked_container_id" IS NOT NULL
        )
      )
    );

ALTER TYPE "GeneratedFileType" ADD VALUE IF NOT EXISTS 'PARSER_PROFILE_REPLAY_JSON';
ALTER TYPE "GeneratedFileStatus" ADD VALUE IF NOT EXISTS 'GENERATING';
ALTER TYPE "AsyncJobType" ADD VALUE IF NOT EXISTS 'PARSER_PROFILE_REPLAY';

ALTER TABLE "parser_profile_versions"
  ADD COLUMN "source_draft_revision" INTEGER;

ALTER TABLE "parser_profile_versions"
  ADD CONSTRAINT "parser_profile_versions_source_draft_revision_check"
    CHECK ("source_draft_revision" IS NULL OR "source_draft_revision" >= 1);

CREATE UNIQUE INDEX "parser_profile_versions_source_learning_case_id_source_draft_revision_key"
  ON "parser_profile_versions"("source_learning_case_id", "source_draft_revision");

ALTER TABLE "generated_files"
  ADD COLUMN "parser_learning_case_id" TEXT,
  ADD COLUMN "idempotency_key" TEXT,
  ADD CONSTRAINT "generated_files_parser_learning_case_id_fkey"
    FOREIGN KEY ("parser_learning_case_id") REFERENCES "parser_learning_cases"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "generated_files_idempotency_key_key"
  ON "generated_files"("idempotency_key");
CREATE INDEX "generated_files_parser_learning_case_id_idx"
  ON "generated_files"("parser_learning_case_id");

ALTER TABLE "async_jobs"
  ADD COLUMN "parser_learning_case_id" TEXT,
  ADD CONSTRAINT "async_jobs_parser_learning_case_id_fkey"
    FOREIGN KEY ("parser_learning_case_id") REFERENCES "parser_learning_cases"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "async_jobs_parser_learning_case_id_idx"
  ON "async_jobs"("parser_learning_case_id");

CREATE OR REPLACE FUNCTION "prevent_parser_profile_definition_update"() RETURNS trigger AS $$
BEGIN
  IF NEW."mapping_definition" IS DISTINCT FROM OLD."mapping_definition"
     OR NEW."fingerprint_definition" IS DISTINCT FROM OLD."fingerprint_definition"
     OR NEW."matcher_version" IS DISTINCT FROM OLD."matcher_version"
     OR NEW."mapping_version" IS DISTINCT FROM OLD."mapping_version"
     OR NEW."family_id" IS DISTINCT FROM OLD."family_id"
     OR NEW."version" IS DISTINCT FROM OLD."version"
     OR NEW."source_learning_case_id" IS DISTINCT FROM OLD."source_learning_case_id"
     OR NEW."source_draft_revision" IS DISTINCT FROM OLD."source_draft_revision" THEN
    RAISE EXCEPTION 'PARSER_PROFILE_DEFINITION_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
