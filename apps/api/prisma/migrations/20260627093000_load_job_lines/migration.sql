ALTER TABLE "load_jobs"
  ALTER COLUMN "container_id" DROP NOT NULL,
  ADD COLUMN "scheduled_departure_at" TIMESTAMP(3);

CREATE TABLE "load_job_lines" (
  "id" TEXT NOT NULL,
  "load_job_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "source_text" TEXT,
  "container_no" TEXT,
  "container_id" TEXT,
  "container_destination_id" TEXT,
  "destination_code" TEXT,
  "planned_pallets" INTEGER NOT NULL DEFAULT 0,
  "external_transfer" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "load_job_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "load_job_lines_load_job_id_sequence_key"
  ON "load_job_lines"("load_job_id", "sequence");

CREATE INDEX "load_job_lines_load_job_id_idx"
  ON "load_job_lines"("load_job_id");

CREATE INDEX "load_job_lines_container_id_idx"
  ON "load_job_lines"("container_id");

CREATE INDEX "load_job_lines_container_destination_id_idx"
  ON "load_job_lines"("container_destination_id");

CREATE INDEX "load_job_lines_destination_code_idx"
  ON "load_job_lines"("destination_code");

CREATE INDEX "load_job_lines_external_transfer_idx"
  ON "load_job_lines"("external_transfer");

ALTER TABLE "load_job_lines"
  ADD CONSTRAINT "load_job_lines_load_job_id_fkey"
  FOREIGN KEY ("load_job_id") REFERENCES "load_jobs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "load_job_lines"
  ADD CONSTRAINT "load_job_lines_container_id_fkey"
  FOREIGN KEY ("container_id") REFERENCES "containers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "load_job_lines"
  ADD CONSTRAINT "load_job_lines_container_destination_id_fkey"
  FOREIGN KEY ("container_destination_id") REFERENCES "container_destinations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
