-- CreateEnum
CREATE TYPE "AttendanceCalculationMethod" AS ENUM (
    'LEGACY_UNKNOWN',
    'NO_PUNCHES',
    'FIRST_LAST_FALLBACK',
    'PAIRED_INTERVALS'
);

-- AlterTable
-- Existing rows retain their historical numeric fields without inferring a method.
ALTER TABLE "attendance_rows"
ADD COLUMN "calculation_method" "AttendanceCalculationMethod" NOT NULL DEFAULT 'LEGACY_UNKNOWN',
ADD COLUMN "work_intervals" JSONB NOT NULL DEFAULT '[]';
