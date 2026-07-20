-- PARSER-PROFILE-06 post-review remediation: immutable staged evidence,
-- separately persisted final results, and auditable match/execution failures.

ALTER TYPE "ParserProfileAuditEventCode"
  ADD VALUE IF NOT EXISTS 'REVIEW_MATCH_FAILED';
ALTER TYPE "ParserProfileAuditEventCode"
  ADD VALUE IF NOT EXISTS 'REVIEW_EXECUTION_FAILED';

ALTER TABLE "parser_profile_reviews"
  ADD COLUMN "final_result" JSONB,
  ADD COLUMN "final_destination_summary" JSONB,
  ADD COLUMN "final_report_preview" JSONB;
