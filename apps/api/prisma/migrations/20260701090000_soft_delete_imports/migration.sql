-- Allow bad import records to be hidden without deleting the preserved source file.

ALTER TABLE "import_files" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "import_files" ADD COLUMN "deleted_by_id" TEXT;
ALTER TABLE "import_files" ADD COLUMN "delete_reason" TEXT;

CREATE INDEX "import_files_deleted_at_idx" ON "import_files"("deleted_at");
CREATE INDEX "import_files_deleted_by_id_idx" ON "import_files"("deleted_by_id");

ALTER TABLE "import_files"
  ADD CONSTRAINT "import_files_deleted_by_id_fkey"
  FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
