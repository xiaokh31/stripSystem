ALTER TABLE "containers" DROP CONSTRAINT "containers_import_file_id_fkey";

ALTER TABLE "containers"
  ALTER COLUMN "import_file_id" DROP NOT NULL;

ALTER TABLE "containers"
  ADD CONSTRAINT "containers_import_file_id_fkey"
  FOREIGN KEY ("import_file_id") REFERENCES "import_files"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
