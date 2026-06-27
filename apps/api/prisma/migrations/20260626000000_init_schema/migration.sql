-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OFFICE', 'WAREHOUSE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'DUPLICATE', 'FAILED');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('NOT_PARSED', 'PARSING', 'PARSED', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "FileFormat" AS ENUM ('UNLOADING_PLAN_CN', 'BESTAR_RECEIVING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ContainerStatus" AS ENUM ('IMPORTED', 'PARSED', 'CORRECTED', 'REPORT_GENERATED', 'LABELS_GENERATED', 'LOADING_IN_PROGRESS', 'LOADED', 'ERROR');

-- CreateEnum
CREATE TYPE "GeneratedFileType" AS ENUM ('PARSED_JSON', 'EXCEL_REPORT', 'PALLET_LABEL_PDF', 'TASK_REPORT_HTML', 'CORRECTIONS_JSON');

-- CreateEnum
CREATE TYPE "GeneratedFileStatus" AS ENUM ('GENERATED', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PalletStatus" AS ENUM ('PLANNED', 'LABEL_PRINTED', 'LOADING', 'LOADED', 'CANCELLED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "LoadJobStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PalletEventType" AS ENUM ('CREATED', 'LABEL_PRINTED', 'SCANNED', 'LOADED', 'DUPLICATE_SCAN', 'INVALID_SCAN', 'STATUS_CHANGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CorrectionTargetType" AS ENUM ('IMPORT_FILE', 'CONTAINER', 'CONTAINER_LINE', 'CONTAINER_DESTINATION', 'PALLET', 'GENERATED_FILE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OFFICE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_files" (
    "id" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "stored_path" TEXT NOT NULL,
    "file_sha256" TEXT NOT NULL,
    "mime_type" TEXT,
    "file_size_bytes" BIGINT,
    "format" "FileFormat" NOT NULL DEFAULT 'UNKNOWN',
    "import_status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "parse_status" "ParseStatus" NOT NULL DEFAULT 'NOT_PARSED',
    "parser_version" TEXT,
    "warning_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "raw_metadata" JSONB,
    "imported_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "containers" (
    "id" TEXT NOT NULL,
    "import_file_id" TEXT NOT NULL,
    "container_no" TEXT NOT NULL,
    "source_format" "FileFormat" NOT NULL DEFAULT 'UNKNOWN',
    "parser_version" TEXT,
    "dock_no" TEXT,
    "company" TEXT,
    "status" "ContainerStatus" NOT NULL DEFAULT 'IMPORTED',
    "raw_json" JSONB,
    "warnings" JSONB,
    "errors" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_lines" (
    "id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "destination_code" TEXT,
    "destination_type" TEXT,
    "cartons" INTEGER,
    "volume" DECIMAL(12,3),
    "raw_json" JSONB NOT NULL,
    "warnings" JSONB,
    "errors" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "container_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destination_rules" (
    "id" TEXT NOT NULL,
    "destination_code" TEXT NOT NULL,
    "destination_type" TEXT,
    "display_name" TEXT,
    "pallet_rule" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "destination_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_destinations" (
    "id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "destination_code" TEXT NOT NULL,
    "destination_type" TEXT,
    "cartons" INTEGER NOT NULL DEFAULT 0,
    "volume" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "calculated_pallets" INTEGER NOT NULL DEFAULT 0,
    "manual_pallets" INTEGER,
    "final_pallets" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "warnings" JSONB,
    "errors" JSONB,
    "destination_rule_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "container_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pallets" (
    "id" TEXT NOT NULL,
    "container_destination_id" TEXT NOT NULL,
    "pallet_no" INTEGER NOT NULL,
    "pallet_id" TEXT NOT NULL,
    "qr_payload" TEXT NOT NULL,
    "status" "PalletStatus" NOT NULL DEFAULT 'PLANNED',
    "label_printed_at" TIMESTAMP(3),
    "loaded_at" TIMESTAMP(3),
    "load_job_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_files" (
    "id" TEXT NOT NULL,
    "import_file_id" TEXT,
    "container_id" TEXT,
    "file_type" "GeneratedFileType" NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_sha256" TEXT,
    "mime_type" TEXT,
    "file_size_bytes" BIGINT,
    "status" "GeneratedFileStatus" NOT NULL DEFAULT 'GENERATED',
    "error_message" TEXT,
    "generated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "load_jobs" (
    "id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "job_no" TEXT,
    "status" "LoadJobStatus" NOT NULL DEFAULT 'PLANNED',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "load_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pallet_events" (
    "id" TEXT NOT NULL,
    "pallet_id" TEXT,
    "load_job_id" TEXT,
    "event_type" "PalletEventType" NOT NULL,
    "from_status" "PalletStatus",
    "to_status" "PalletStatus",
    "scan_payload" TEXT,
    "device_id" TEXT,
    "exception_reason" TEXT,
    "metadata" JSONB,
    "operator_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pallet_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_feedback" (
    "id" TEXT NOT NULL,
    "target_type" "CorrectionTargetType" NOT NULL,
    "import_file_id" TEXT,
    "container_id" TEXT,
    "container_line_id" TEXT,
    "container_destination_id" TEXT,
    "pallet_id" TEXT,
    "generated_file_id" TEXT,
    "field_name" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT,
    "note" TEXT,
    "corrected_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "correction_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "import_files_file_sha256_key" ON "import_files"("file_sha256");

-- CreateIndex
CREATE INDEX "import_files_format_idx" ON "import_files"("format");

-- CreateIndex
CREATE INDEX "import_files_import_status_idx" ON "import_files"("import_status");

-- CreateIndex
CREATE INDEX "import_files_parse_status_idx" ON "import_files"("parse_status");

-- CreateIndex
CREATE INDEX "import_files_created_at_idx" ON "import_files"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "containers_container_no_key" ON "containers"("container_no");

-- CreateIndex
CREATE INDEX "containers_import_file_id_idx" ON "containers"("import_file_id");

-- CreateIndex
CREATE INDEX "containers_status_idx" ON "containers"("status");

-- CreateIndex
CREATE INDEX "containers_created_at_idx" ON "containers"("created_at");

-- CreateIndex
CREATE INDEX "container_lines_container_id_idx" ON "container_lines"("container_id");

-- CreateIndex
CREATE INDEX "container_lines_destination_code_idx" ON "container_lines"("destination_code");

-- CreateIndex
CREATE UNIQUE INDEX "container_lines_container_id_line_no_key" ON "container_lines"("container_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "destination_rules_destination_code_key" ON "destination_rules"("destination_code");

-- CreateIndex
CREATE INDEX "destination_rules_is_active_idx" ON "destination_rules"("is_active");

-- CreateIndex
CREATE INDEX "container_destinations_container_id_idx" ON "container_destinations"("container_id");

-- CreateIndex
CREATE INDEX "container_destinations_destination_code_idx" ON "container_destinations"("destination_code");

-- CreateIndex
CREATE INDEX "container_destinations_destination_rule_id_idx" ON "container_destinations"("destination_rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "container_destinations_container_id_destination_code_destin_key" ON "container_destinations"("container_id", "destination_code", "destination_type");

-- CreateIndex
CREATE UNIQUE INDEX "pallets_pallet_id_key" ON "pallets"("pallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "pallets_qr_payload_key" ON "pallets"("qr_payload");

-- CreateIndex
CREATE INDEX "pallets_container_destination_id_idx" ON "pallets"("container_destination_id");

-- CreateIndex
CREATE INDEX "pallets_status_idx" ON "pallets"("status");

-- CreateIndex
CREATE INDEX "pallets_load_job_id_idx" ON "pallets"("load_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "pallets_container_destination_id_pallet_no_key" ON "pallets"("container_destination_id", "pallet_no");

-- CreateIndex
CREATE INDEX "generated_files_import_file_id_idx" ON "generated_files"("import_file_id");

-- CreateIndex
CREATE INDEX "generated_files_container_id_idx" ON "generated_files"("container_id");

-- CreateIndex
CREATE INDEX "generated_files_file_type_idx" ON "generated_files"("file_type");

-- CreateIndex
CREATE INDEX "generated_files_status_idx" ON "generated_files"("status");

-- CreateIndex
CREATE INDEX "generated_files_created_at_idx" ON "generated_files"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "load_jobs_job_no_key" ON "load_jobs"("job_no");

-- CreateIndex
CREATE INDEX "load_jobs_container_id_idx" ON "load_jobs"("container_id");

-- CreateIndex
CREATE INDEX "load_jobs_status_idx" ON "load_jobs"("status");

-- CreateIndex
CREATE INDEX "load_jobs_created_at_idx" ON "load_jobs"("created_at");

-- CreateIndex
CREATE INDEX "pallet_events_pallet_id_idx" ON "pallet_events"("pallet_id");

-- CreateIndex
CREATE INDEX "pallet_events_load_job_id_idx" ON "pallet_events"("load_job_id");

-- CreateIndex
CREATE INDEX "pallet_events_event_type_idx" ON "pallet_events"("event_type");

-- CreateIndex
CREATE INDEX "pallet_events_occurred_at_idx" ON "pallet_events"("occurred_at");

-- CreateIndex
CREATE INDEX "pallet_events_operator_id_idx" ON "pallet_events"("operator_id");

-- CreateIndex
CREATE INDEX "correction_feedback_target_type_idx" ON "correction_feedback"("target_type");

-- CreateIndex
CREATE INDEX "correction_feedback_import_file_id_idx" ON "correction_feedback"("import_file_id");

-- CreateIndex
CREATE INDEX "correction_feedback_container_id_idx" ON "correction_feedback"("container_id");

-- CreateIndex
CREATE INDEX "correction_feedback_container_line_id_idx" ON "correction_feedback"("container_line_id");

-- CreateIndex
CREATE INDEX "correction_feedback_container_destination_id_idx" ON "correction_feedback"("container_destination_id");

-- CreateIndex
CREATE INDEX "correction_feedback_pallet_id_idx" ON "correction_feedback"("pallet_id");

-- CreateIndex
CREATE INDEX "correction_feedback_generated_file_id_idx" ON "correction_feedback"("generated_file_id");

-- CreateIndex
CREATE INDEX "correction_feedback_corrected_by_id_idx" ON "correction_feedback"("corrected_by_id");

-- CreateIndex
CREATE INDEX "correction_feedback_created_at_idx" ON "correction_feedback"("created_at");

-- AddForeignKey
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "containers" ADD CONSTRAINT "containers_import_file_id_fkey" FOREIGN KEY ("import_file_id") REFERENCES "import_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_lines" ADD CONSTRAINT "container_lines_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_destinations" ADD CONSTRAINT "container_destinations_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_destinations" ADD CONSTRAINT "container_destinations_destination_rule_id_fkey" FOREIGN KEY ("destination_rule_id") REFERENCES "destination_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_container_destination_id_fkey" FOREIGN KEY ("container_destination_id") REFERENCES "container_destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_load_job_id_fkey" FOREIGN KEY ("load_job_id") REFERENCES "load_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_files" ADD CONSTRAINT "generated_files_import_file_id_fkey" FOREIGN KEY ("import_file_id") REFERENCES "import_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_files" ADD CONSTRAINT "generated_files_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_files" ADD CONSTRAINT "generated_files_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_jobs" ADD CONSTRAINT "load_jobs_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "load_jobs" ADD CONSTRAINT "load_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pallet_events" ADD CONSTRAINT "pallet_events_pallet_id_fkey" FOREIGN KEY ("pallet_id") REFERENCES "pallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pallet_events" ADD CONSTRAINT "pallet_events_load_job_id_fkey" FOREIGN KEY ("load_job_id") REFERENCES "load_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pallet_events" ADD CONSTRAINT "pallet_events_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_feedback" ADD CONSTRAINT "correction_feedback_import_file_id_fkey" FOREIGN KEY ("import_file_id") REFERENCES "import_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_feedback" ADD CONSTRAINT "correction_feedback_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_feedback" ADD CONSTRAINT "correction_feedback_container_line_id_fkey" FOREIGN KEY ("container_line_id") REFERENCES "container_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_feedback" ADD CONSTRAINT "correction_feedback_container_destination_id_fkey" FOREIGN KEY ("container_destination_id") REFERENCES "container_destinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_feedback" ADD CONSTRAINT "correction_feedback_pallet_id_fkey" FOREIGN KEY ("pallet_id") REFERENCES "pallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_feedback" ADD CONSTRAINT "correction_feedback_generated_file_id_fkey" FOREIGN KEY ("generated_file_id") REFERENCES "generated_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_feedback" ADD CONSTRAINT "correction_feedback_corrected_by_id_fkey" FOREIGN KEY ("corrected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
