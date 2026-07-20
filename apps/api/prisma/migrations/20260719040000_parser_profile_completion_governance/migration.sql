-- PARSER-PROFILE-05: immutable completion evidence and profile governance.

ALTER TYPE "ParserProfileAuditEventCode" ADD VALUE IF NOT EXISTS 'PROFILE_RESUMED';
ALTER TYPE "ParserProfileAuditEventCode" ADD VALUE IF NOT EXISTS 'PROFILE_VERSION_FORKED';

ALTER TABLE "parser_profile_versions"
  ADD COLUMN "approval_reason" TEXT,
  ADD COLUMN "lifecycle_reason" TEXT,
  ADD COLUMN "lifecycle_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "trust_streak" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "parser_profile_versions_lifecycle_revision_check"
    CHECK ("lifecycle_revision" >= 0),
  ADD CONSTRAINT "parser_profile_versions_trust_streak_check"
    CHECK ("trust_streak" >= 0 AND "trust_streak" <= 3),
  ADD CONSTRAINT "parser_profile_versions_approval_state_check"
    CHECK (
      (
        "lifecycle" = 'DRAFT'
        AND "approved_by_id" IS NULL
        AND "approved_at" IS NULL
        AND "approval_reason" IS NULL
        AND "trust_streak" = 0
      )
      OR (
        "lifecycle" <> 'DRAFT'
        AND "approved_by_id" IS NOT NULL
        AND "approved_at" IS NOT NULL
        AND "approval_reason" IS NOT NULL
      )
    );

ALTER TABLE "parser_learning_cases"
  ADD COLUMN "completion_snapshot_at" TIMESTAMP(3),
  ADD COLUMN "completion_replay_job_id" TEXT,
  ADD CONSTRAINT "parser_learning_cases_completion_snapshot_check"
    CHECK (
      ("completion_snapshot" IS NULL AND "completion_snapshot_at" IS NULL)
      OR ("completion_snapshot" IS NOT NULL AND "completion_snapshot_at" IS NOT NULL)
    ),
  ADD CONSTRAINT "parser_learning_cases_completion_replay_job_id_fkey"
    FOREIGN KEY ("completion_replay_job_id") REFERENCES "async_jobs"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "parser_learning_cases_completion_replay_job_id_key"
  ON "parser_learning_cases"("completion_replay_job_id");

-- Lifecycle mutations may update governance state, but definitions remain protected
-- by prevent_parser_profile_definition_update(). Active definitions can never be
-- edited in place.
