-- A pre-migration repair can safely encode the verified winner id in the
-- superseded row when the replacement-audit table does not exist yet. Convert
-- those bounded markers into immutable audit rows after the table is present.

INSERT INTO "generated_file_replacements" (
  "id",
  "container_id",
  "file_type",
  "old_generated_file_id",
  "new_generated_file_id",
  "replaced_by_id",
  "reason_code",
  "created_at"
)
SELECT
  md5("old"."id" || ':CURRENT_ARTIFACT_REPAIR'),
  "old"."container_id",
  "old"."file_type",
  "old"."id",
  substring("old"."error_message" FROM 28),
  NULL,
  'VERIFIED_STORAGE_REPAIR',
  CURRENT_TIMESTAMP
FROM "generated_files" AS "old"
JOIN "generated_files" AS "winner"
  ON "winner"."id" = substring("old"."error_message" FROM 28)
 AND "winner"."container_id" = "old"."container_id"
 AND "winner"."file_type" = "old"."file_type"
 AND "winner"."status" = 'GENERATED'
WHERE "old"."status" = 'SUPERSEDED'
  AND "old"."file_type" IN ('EXCEL_REPORT', 'PALLET_LABEL_PDF')
  AND "old"."error_message" LIKE 'CURRENT_REPAIR_REPLACED_BY:%'
ON CONFLICT ("old_generated_file_id") DO NOTHING;

UPDATE "generated_files"
SET "error_message" = NULL
WHERE "status" = 'SUPERSEDED'
  AND "file_type" IN ('EXCEL_REPORT', 'PALLET_LABEL_PDF')
  AND "error_message" LIKE 'CURRENT_REPAIR_REPLACED_BY:%';
