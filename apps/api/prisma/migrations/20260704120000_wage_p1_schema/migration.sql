-- CreateEnum
CREATE TYPE "WageGeneratedFileType" AS ENUM ('ATTENDANCE_PARSED_JSON', 'WAGE_RECORD_XLS', 'TASK_REPORT_HTML', 'UNLOADING_WAGE_SETTLEMENT_JSON', 'UNLOADING_WAGE_TASK_REPORT_HTML');

-- CreateEnum
CREATE TYPE "ContainerPayClassification" AS ENUM ('OCEAN_CONTAINER', 'US_TO_CANADA_TRANSFER');

-- CreateEnum
CREATE TYPE "PayAllocationMethod" AS ENUM ('EQUAL_SPLIT', 'MANUAL_AMOUNT', 'MANUAL_PERCENT');

-- CreateEnum
CREATE TYPE "PayContainerStatus" AS ENUM ('DRAFT', 'COMPLETED', 'SETTLED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "UnloadingWageSettlementStatus" AS ENUM ('GENERATED', 'SUPERSEDED', 'NEEDS_REVIEW');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CorrectionTargetType" ADD VALUE 'ATTENDANCE_IMPORT';
ALTER TYPE "CorrectionTargetType" ADD VALUE 'PAY_CONTAINER';
ALTER TYPE "CorrectionTargetType" ADD VALUE 'UNLOADING_WAGE_SETTLEMENT';

-- AlterTable
ALTER TABLE "containers" ADD COLUMN     "pay_classification" "ContainerPayClassification",
ADD COLUMN     "pay_trailer_number" TEXT;

-- CreateTable
CREATE TABLE "attendance_imports" (
    "id" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "stored_path" TEXT NOT NULL,
    "file_sha256" TEXT NOT NULL,
    "mime_type" TEXT,
    "file_size_bytes" BIGINT,
    "import_status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "parse_status" "ParseStatus" NOT NULL DEFAULT 'NOT_PARSED',
    "parser_version" TEXT,
    "settlement_month" TEXT,
    "period_start" DATE,
    "period_end" DATE,
    "employee_count" INTEGER NOT NULL DEFAULT 0,
    "day_count" INTEGER NOT NULL DEFAULT 0,
    "warning_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "raw_metadata" JSONB,
    "imported_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_rows" (
    "id" TEXT NOT NULL,
    "attendance_import_id" TEXT NOT NULL,
    "row_key" TEXT NOT NULL,
    "employee_id" TEXT,
    "employee_name" TEXT,
    "department" TEXT,
    "work_date" DATE NOT NULL,
    "day_number" INTEGER NOT NULL,
    "punch_times" JSONB NOT NULL,
    "paired_gross_hours" DECIMAL(8,2),
    "lunch_hours" DECIMAL(8,2) NOT NULL DEFAULT 0.5,
    "calculated_hours" DECIMAL(8,2),
    "first_punch" TEXT,
    "last_punch" TEXT,
    "raw_json" JSONB NOT NULL,
    "warnings" JSONB,
    "errors" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wage_generated_files" (
    "id" TEXT NOT NULL,
    "attendance_import_id" TEXT,
    "unloading_wage_settlement_id" TEXT,
    "file_type" "WageGeneratedFileType" NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_sha256" TEXT,
    "mime_type" TEXT,
    "file_size_bytes" BIGINT,
    "status" "GeneratedFileStatus" NOT NULL DEFAULT 'GENERATED',
    "error_message" TEXT,
    "generated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wage_generated_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_containers" (
    "id" TEXT NOT NULL,
    "pay_container_no" TEXT NOT NULL,
    "classification" "ContainerPayClassification" NOT NULL,
    "trailer_number" TEXT,
    "status" "PayContainerStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "rate_amount" DECIMAL(10,2) NOT NULL,
    "allocation_method" "PayAllocationMethod" NOT NULL DEFAULT 'EQUAL_SPLIT',
    "completed_at" TIMESTAMP(3),
    "completed_by_id" TEXT,
    "completion_note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_container_containers" (
    "id" TEXT NOT NULL,
    "pay_container_id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "container_no" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_container_containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unloader_assignments" (
    "id" TEXT NOT NULL,
    "pay_container_id" TEXT NOT NULL,
    "worker_user_id" TEXT,
    "worker_code" TEXT NOT NULL,
    "worker_name" TEXT NOT NULL,
    "allocation_amount" DECIMAL(10,2),
    "allocation_percent" DECIMAL(7,4),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unloader_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unloading_wage_settlements" (
    "id" TEXT NOT NULL,
    "settlement_month" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "status" "UnloadingWageSettlementStatus" NOT NULL DEFAULT 'GENERATED',
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "warning_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "raw_json" JSONB,
    "generated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unloading_wage_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unloading_wage_worker_settlements" (
    "id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "worker_code" TEXT NOT NULL,
    "worker_name" TEXT NOT NULL,
    "pay_container_count" INTEGER NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unloading_wage_worker_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unloading_wage_settlement_lines" (
    "id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "worker_settlement_id" TEXT NOT NULL,
    "pay_container_id" TEXT,
    "pay_container_no" TEXT NOT NULL,
    "classification" "ContainerPayClassification" NOT NULL,
    "trailer_number" TEXT,
    "container_numbers" JSONB NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "rate_amount" DECIMAL(10,2) NOT NULL,
    "allocation_method" "PayAllocationMethod" NOT NULL,
    "worker_code" TEXT NOT NULL,
    "worker_name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unloading_wage_settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_imports_file_sha256_key" ON "attendance_imports"("file_sha256");

-- CreateIndex
CREATE INDEX "attendance_imports_parse_status_idx" ON "attendance_imports"("parse_status");

-- CreateIndex
CREATE INDEX "attendance_imports_settlement_month_idx" ON "attendance_imports"("settlement_month");

-- CreateIndex
CREATE INDEX "attendance_imports_imported_by_id_idx" ON "attendance_imports"("imported_by_id");

-- CreateIndex
CREATE INDEX "attendance_imports_created_at_idx" ON "attendance_imports"("created_at");

-- CreateIndex
CREATE INDEX "attendance_rows_attendance_import_id_idx" ON "attendance_rows"("attendance_import_id");

-- CreateIndex
CREATE INDEX "attendance_rows_employee_id_idx" ON "attendance_rows"("employee_id");

-- CreateIndex
CREATE INDEX "attendance_rows_employee_name_idx" ON "attendance_rows"("employee_name");

-- CreateIndex
CREATE INDEX "attendance_rows_work_date_idx" ON "attendance_rows"("work_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_rows_attendance_import_id_row_key_key" ON "attendance_rows"("attendance_import_id", "row_key");

-- CreateIndex
CREATE INDEX "wage_generated_files_attendance_import_id_idx" ON "wage_generated_files"("attendance_import_id");

-- CreateIndex
CREATE INDEX "wage_generated_files_unloading_wage_settlement_id_idx" ON "wage_generated_files"("unloading_wage_settlement_id");

-- CreateIndex
CREATE INDEX "wage_generated_files_file_type_idx" ON "wage_generated_files"("file_type");

-- CreateIndex
CREATE INDEX "wage_generated_files_status_idx" ON "wage_generated_files"("status");

-- CreateIndex
CREATE INDEX "wage_generated_files_generated_by_id_idx" ON "wage_generated_files"("generated_by_id");

-- CreateIndex
CREATE INDEX "wage_generated_files_created_at_idx" ON "wage_generated_files"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pay_containers_pay_container_no_key" ON "pay_containers"("pay_container_no");

-- CreateIndex
CREATE INDEX "pay_containers_classification_idx" ON "pay_containers"("classification");

-- CreateIndex
CREATE INDEX "pay_containers_trailer_number_idx" ON "pay_containers"("trailer_number");

-- CreateIndex
CREATE INDEX "pay_containers_status_idx" ON "pay_containers"("status");

-- CreateIndex
CREATE INDEX "pay_containers_completed_at_idx" ON "pay_containers"("completed_at");

-- CreateIndex
CREATE INDEX "pay_containers_completed_by_id_idx" ON "pay_containers"("completed_by_id");

-- CreateIndex
CREATE INDEX "pay_containers_created_by_id_idx" ON "pay_containers"("created_by_id");

-- CreateIndex
CREATE INDEX "pay_container_containers_pay_container_id_idx" ON "pay_container_containers"("pay_container_id");

-- CreateIndex
CREATE INDEX "pay_container_containers_container_no_idx" ON "pay_container_containers"("container_no");

-- CreateIndex
CREATE UNIQUE INDEX "pay_container_containers_pay_container_id_container_id_key" ON "pay_container_containers"("pay_container_id", "container_id");

-- CreateIndex
CREATE UNIQUE INDEX "pay_container_containers_container_id_key" ON "pay_container_containers"("container_id");

-- CreateIndex
CREATE INDEX "unloader_assignments_pay_container_id_idx" ON "unloader_assignments"("pay_container_id");

-- CreateIndex
CREATE INDEX "unloader_assignments_worker_user_id_idx" ON "unloader_assignments"("worker_user_id");

-- CreateIndex
CREATE INDEX "unloader_assignments_worker_code_idx" ON "unloader_assignments"("worker_code");

-- CreateIndex
CREATE UNIQUE INDEX "unloader_assignments_pay_container_id_worker_code_key" ON "unloader_assignments"("pay_container_id", "worker_code");

-- CreateIndex
CREATE INDEX "unloading_wage_settlements_settlement_month_status_idx" ON "unloading_wage_settlements"("settlement_month", "status");

-- CreateIndex
CREATE INDEX "unloading_wage_settlements_settlement_month_idx" ON "unloading_wage_settlements"("settlement_month");

-- CreateIndex
CREATE INDEX "unloading_wage_settlements_status_idx" ON "unloading_wage_settlements"("status");

-- CreateIndex
CREATE INDEX "unloading_wage_settlements_generated_by_id_idx" ON "unloading_wage_settlements"("generated_by_id");

-- CreateIndex
CREATE INDEX "unloading_wage_settlements_created_at_idx" ON "unloading_wage_settlements"("created_at");

-- CreateIndex
CREATE INDEX "unloading_wage_worker_settlements_settlement_id_idx" ON "unloading_wage_worker_settlements"("settlement_id");

-- CreateIndex
CREATE INDEX "unloading_wage_worker_settlements_worker_code_idx" ON "unloading_wage_worker_settlements"("worker_code");

-- CreateIndex
CREATE UNIQUE INDEX "unloading_wage_worker_settlements_settlement_id_worker_code_key" ON "unloading_wage_worker_settlements"("settlement_id", "worker_code");

-- CreateIndex
CREATE INDEX "unloading_wage_settlement_lines_settlement_id_idx" ON "unloading_wage_settlement_lines"("settlement_id");

-- CreateIndex
CREATE INDEX "unloading_wage_settlement_lines_worker_settlement_id_idx" ON "unloading_wage_settlement_lines"("worker_settlement_id");

-- CreateIndex
CREATE INDEX "unloading_wage_settlement_lines_pay_container_id_idx" ON "unloading_wage_settlement_lines"("pay_container_id");

-- CreateIndex
CREATE INDEX "unloading_wage_settlement_lines_worker_code_idx" ON "unloading_wage_settlement_lines"("worker_code");

-- CreateIndex
CREATE INDEX "unloading_wage_settlement_lines_pay_container_no_idx" ON "unloading_wage_settlement_lines"("pay_container_no");

-- CreateIndex
CREATE INDEX "containers_pay_classification_idx" ON "containers"("pay_classification");

-- CreateIndex
CREATE INDEX "containers_pay_trailer_number_idx" ON "containers"("pay_trailer_number");

-- AddForeignKey
ALTER TABLE "attendance_imports" ADD CONSTRAINT "attendance_imports_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_rows" ADD CONSTRAINT "attendance_rows_attendance_import_id_fkey" FOREIGN KEY ("attendance_import_id") REFERENCES "attendance_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_generated_files" ADD CONSTRAINT "wage_generated_files_attendance_import_id_fkey" FOREIGN KEY ("attendance_import_id") REFERENCES "attendance_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_generated_files" ADD CONSTRAINT "wage_generated_files_unloading_wage_settlement_id_fkey" FOREIGN KEY ("unloading_wage_settlement_id") REFERENCES "unloading_wage_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_generated_files" ADD CONSTRAINT "wage_generated_files_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_containers" ADD CONSTRAINT "pay_containers_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_containers" ADD CONSTRAINT "pay_containers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_container_containers" ADD CONSTRAINT "pay_container_containers_pay_container_id_fkey" FOREIGN KEY ("pay_container_id") REFERENCES "pay_containers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_container_containers" ADD CONSTRAINT "pay_container_containers_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unloader_assignments" ADD CONSTRAINT "unloader_assignments_pay_container_id_fkey" FOREIGN KEY ("pay_container_id") REFERENCES "pay_containers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unloader_assignments" ADD CONSTRAINT "unloader_assignments_worker_user_id_fkey" FOREIGN KEY ("worker_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unloading_wage_settlements" ADD CONSTRAINT "unloading_wage_settlements_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unloading_wage_worker_settlements" ADD CONSTRAINT "unloading_wage_worker_settlements_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "unloading_wage_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unloading_wage_settlement_lines" ADD CONSTRAINT "unloading_wage_settlement_lines_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "unloading_wage_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unloading_wage_settlement_lines" ADD CONSTRAINT "unloading_wage_settlement_lines_worker_settlement_id_fkey" FOREIGN KEY ("worker_settlement_id") REFERENCES "unloading_wage_worker_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unloading_wage_settlement_lines" ADD CONSTRAINT "unloading_wage_settlement_lines_pay_container_id_fkey" FOREIGN KEY ("pay_container_id") REFERENCES "pay_containers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
