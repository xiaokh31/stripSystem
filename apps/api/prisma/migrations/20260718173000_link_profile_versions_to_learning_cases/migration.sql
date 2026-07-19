-- Preserve the provenance from an immutable profile version back to the
-- learning case that produced it without cascading either historical record.
ALTER TABLE "parser_profile_versions"
  ADD COLUMN "source_learning_case_id" TEXT;

ALTER TABLE "parser_profile_versions"
  ADD CONSTRAINT "parser_profile_versions_source_learning_case_id_fkey"
  FOREIGN KEY ("source_learning_case_id") REFERENCES "parser_learning_cases"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "parser_profile_versions_source_learning_case_id_idx"
  ON "parser_profile_versions"("source_learning_case_id");
