-- Add auditable BullMQ-backed async job tracking for parse/report/label/wage work.
CREATE TYPE "AsyncJobType" AS ENUM (
  'UNLOADING_PARSE',
  'UNLOADING_REPORT',
  'UNLOADING_LABELS',
  'ATTENDANCE_PARSE',
  'WAGE_RECORD_GENERATION'
);

CREATE TYPE "AsyncJobStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "async_jobs" (
  "id" TEXT NOT NULL,
  "job_type" "AsyncJobType" NOT NULL,
  "status" "AsyncJobStatus" NOT NULL DEFAULT 'QUEUED',
  "queue_name" TEXT NOT NULL,
  "bull_job_id" TEXT,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "import_file_id" TEXT,
  "container_id" TEXT,
  "attendance_import_id" TEXT,
  "generated_file_id" TEXT,
  "wage_generated_file_id" TEXT,
  "actor_user_id" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "last_error" TEXT,
  "result" JSONB,
  "metadata" JSONB,
  "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "async_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "async_jobs_import_file_id_fkey" FOREIGN KEY ("import_file_id") REFERENCES "import_files"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "async_jobs_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "async_jobs_attendance_import_id_fkey" FOREIGN KEY ("attendance_import_id") REFERENCES "attendance_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "async_jobs_generated_file_id_fkey" FOREIGN KEY ("generated_file_id") REFERENCES "generated_files"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "async_jobs_wage_generated_file_id_fkey" FOREIGN KEY ("wage_generated_file_id") REFERENCES "wage_generated_files"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "async_jobs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "async_jobs_job_type_idx" ON "async_jobs"("job_type");
CREATE INDEX "async_jobs_status_idx" ON "async_jobs"("status");
CREATE INDEX "async_jobs_target_type_target_id_idx" ON "async_jobs"("target_type", "target_id");
CREATE INDEX "async_jobs_idempotency_key_idx" ON "async_jobs"("idempotency_key");
CREATE INDEX "async_jobs_import_file_id_idx" ON "async_jobs"("import_file_id");
CREATE INDEX "async_jobs_container_id_idx" ON "async_jobs"("container_id");
CREATE INDEX "async_jobs_attendance_import_id_idx" ON "async_jobs"("attendance_import_id");
CREATE INDEX "async_jobs_generated_file_id_idx" ON "async_jobs"("generated_file_id");
CREATE INDEX "async_jobs_wage_generated_file_id_idx" ON "async_jobs"("wage_generated_file_id");
CREATE INDEX "async_jobs_actor_user_id_idx" ON "async_jobs"("actor_user_id");
CREATE INDEX "async_jobs_queued_at_idx" ON "async_jobs"("queued_at");

CREATE UNIQUE INDEX "async_jobs_active_idempotency_key_unique"
  ON "async_jobs"("idempotency_key")
  WHERE "status" IN ('QUEUED', 'RUNNING');
