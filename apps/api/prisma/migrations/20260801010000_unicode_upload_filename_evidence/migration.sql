ALTER TABLE "import_files"
  ADD COLUMN "transport_filename" TEXT,
  ADD COLUMN "filename_codec_version" TEXT NOT NULL DEFAULT 'upload-filename-v1',
  ADD COLUMN "filename_review_code" TEXT,
  ADD COLUMN "storage_basename" TEXT;

ALTER TABLE "attendance_imports"
  ADD COLUMN "transport_filename" TEXT,
  ADD COLUMN "filename_codec_version" TEXT NOT NULL DEFAULT 'upload-filename-v1',
  ADD COLUMN "filename_review_code" TEXT,
  ADD COLUMN "storage_basename" TEXT;

UPDATE "import_files"
SET
  "transport_filename" = "original_filename",
  "filename_codec_version" = 'legacy-unclassified-v0',
  "storage_basename" = regexp_replace("stored_path", '^.*/', '');

UPDATE "attendance_imports"
SET
  "transport_filename" = "original_filename",
  "filename_codec_version" = 'legacy-unclassified-v0',
  "storage_basename" = regexp_replace("stored_path", '^.*/', '');

ALTER TABLE "import_files"
  ALTER COLUMN "storage_basename" SET NOT NULL;

ALTER TABLE "attendance_imports"
  ALTER COLUMN "storage_basename" SET NOT NULL;
