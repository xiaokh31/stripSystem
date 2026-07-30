-- UNLOAD-REPORT-04: immutable replacement audit plus one current office
-- report/label per container and business file type.

CREATE TABLE "generated_file_replacements" (
  "id" TEXT NOT NULL,
  "container_id" TEXT NOT NULL,
  "file_type" "GeneratedFileType" NOT NULL,
  "old_generated_file_id" TEXT NOT NULL,
  "new_generated_file_id" TEXT NOT NULL,
  "replaced_by_id" TEXT,
  "reason_code" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generated_file_replacements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "generated_file_replacements_old_generated_file_id_key"
ON "generated_file_replacements"("old_generated_file_id");
CREATE INDEX "generated_file_replacements_container_id_file_type_created_at_idx"
ON "generated_file_replacements"("container_id", "file_type", "created_at");
CREATE INDEX "generated_file_replacements_new_generated_file_id_idx"
ON "generated_file_replacements"("new_generated_file_id");
CREATE INDEX "generated_file_replacements_replaced_by_id_idx"
ON "generated_file_replacements"("replaced_by_id");

ALTER TABLE "generated_file_replacements"
ADD CONSTRAINT "generated_file_replacements_old_generated_file_id_fkey"
FOREIGN KEY ("old_generated_file_id") REFERENCES "generated_files"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generated_file_replacements"
ADD CONSTRAINT "generated_file_replacements_new_generated_file_id_fkey"
FOREIGN KEY ("new_generated_file_id") REFERENCES "generated_files"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generated_file_replacements"
ADD CONSTRAINT "generated_file_replacements_replaced_by_id_fkey"
FOREIGN KEY ("replaced_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "generated_files"
    WHERE "container_id" IS NOT NULL
      AND "status" = 'GENERATED'
      AND "file_type" IN ('EXCEL_REPORT', 'PALLET_LABEL_PDF')
    GROUP BY "container_id", "file_type"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'CURRENT_GENERATED_FILE_REPAIR_REQUIRED',
      HINT = 'Run the default-dry-run repair-current-generated-files tool, apply it explicitly, then retry the migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX "generated_files_one_current_business_artifact_key"
ON "generated_files"("container_id", "file_type")
WHERE "container_id" IS NOT NULL
  AND "status" = 'GENERATED'
  AND "file_type" IN ('EXCEL_REPORT', 'PALLET_LABEL_PDF');
