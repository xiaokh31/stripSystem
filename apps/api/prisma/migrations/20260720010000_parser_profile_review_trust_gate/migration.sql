-- PARSER-PROFILE-06: staged review boundary, material decisions, and the
-- three-distinct-import trust gate.

ALTER TYPE "ParserProfileEvidenceOutcome" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "ParserProfileAuditEventCode" ADD VALUE IF NOT EXISTS 'EVIDENCE_REJECTED';

CREATE TYPE "ParserProfileReviewStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'CORRECTED',
  'REJECTED'
);

ALTER TABLE "parser_profile_evidence"
  ADD COLUMN "streak_after" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reason" TEXT,
  ADD CONSTRAINT "parser_profile_evidence_streak_after_check"
    CHECK ("streak_after" >= 0 AND "streak_after" <= 3);

ALTER TABLE "parser_profile_evidence"
  DROP CONSTRAINT "parser_profile_evidence_outcome_check";

ALTER TABLE "parser_profile_evidence"
  ADD CONSTRAINT "parser_profile_evidence_outcome_check"
    CHECK (
      ("outcome" = 'ACCEPTED' AND "accepted" = true AND "material_correction" = false)
      OR (
        "outcome" IN ('MATERIAL_CORRECTION', 'REJECTED')
        AND "accepted" = false
        AND "material_correction" = true
      )
    );

CREATE TABLE "parser_profile_reviews" (
  "id" TEXT NOT NULL,
  "import_file_id" TEXT NOT NULL,
  "profile_version_id" TEXT NOT NULL,
  "source_file_sha256" TEXT NOT NULL,
  "status" "ParserProfileReviewStatus" NOT NULL DEFAULT 'PENDING',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "fingerprint_hash" TEXT NOT NULL,
  "matcher_version" TEXT NOT NULL,
  "mapping_version" TEXT NOT NULL,
  "worker_version" TEXT NOT NULL,
  "parser_version" TEXT NOT NULL,
  "built_in_evidence" JSONB,
  "match_evidence" JSONB NOT NULL,
  "source_preview" JSONB,
  "staged_result" JSONB NOT NULL,
  "destination_summary" JSONB NOT NULL,
  "report_preview" JSONB NOT NULL,
  "warnings" JSONB,
  "errors" JSONB,
  "provenance" JSONB,
  "correction_diff" JSONB,
  "decision_reason" TEXT,
  "accepted_container_id" TEXT,
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parser_profile_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "parser_profile_reviews_import_file_id_fkey"
    FOREIGN KEY ("import_file_id") REFERENCES "import_files"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_reviews_profile_version_id_fkey"
    FOREIGN KEY ("profile_version_id") REFERENCES "parser_profile_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_reviews_accepted_container_id_fkey"
    FOREIGN KEY ("accepted_container_id") REFERENCES "containers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_reviews_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parser_profile_reviews_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "parser_profile_reviews_decision_check" CHECK (
    (
      "status" = 'PENDING'
      AND "accepted_container_id" IS NULL
      AND "reviewed_by_id" IS NULL
      AND "reviewed_at" IS NULL
    )
    OR (
      "status" IN ('ACCEPTED', 'CORRECTED')
      AND "accepted_container_id" IS NOT NULL
      AND "reviewed_by_id" IS NOT NULL
      AND "reviewed_at" IS NOT NULL
    )
    OR (
      "status" = 'REJECTED'
      AND "accepted_container_id" IS NULL
      AND "reviewed_by_id" IS NOT NULL
      AND "reviewed_at" IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX "parser_profile_reviews_import_file_id_key"
  ON "parser_profile_reviews"("import_file_id");
CREATE UNIQUE INDEX "parser_profile_reviews_accepted_container_id_key"
  ON "parser_profile_reviews"("accepted_container_id");
CREATE INDEX "parser_profile_reviews_profile_version_id_status_idx"
  ON "parser_profile_reviews"("profile_version_id", "status");
CREATE INDEX "parser_profile_reviews_source_file_sha256_idx"
  ON "parser_profile_reviews"("source_file_sha256");
CREATE INDEX "parser_profile_reviews_reviewed_by_id_idx"
  ON "parser_profile_reviews"("reviewed_by_id");
CREATE INDEX "parser_profile_reviews_reviewed_at_idx"
  ON "parser_profile_reviews"("reviewed_at");
