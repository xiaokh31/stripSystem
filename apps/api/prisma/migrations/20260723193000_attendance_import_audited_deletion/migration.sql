CREATE TYPE "AttendanceImportAuditEventCode" AS ENUM ('DELETED');

ALTER TABLE "attendance_imports"
ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT,
ADD COLUMN "deletion_reason" TEXT;

DROP INDEX "attendance_imports_file_sha256_key";

CREATE UNIQUE INDEX "attendance_imports_active_file_sha256_key"
ON "attendance_imports"("file_sha256")
WHERE "deleted_at" IS NULL;

CREATE INDEX "attendance_imports_file_sha256_idx"
ON "attendance_imports"("file_sha256");
CREATE INDEX "attendance_imports_deleted_at_created_at_idx"
ON "attendance_imports"("deleted_at", "created_at");
DROP INDEX "attendance_imports_parse_status_idx";
CREATE INDEX "attendance_imports_parse_status_deleted_at_idx"
ON "attendance_imports"("parse_status", "deleted_at");
CREATE INDEX "attendance_imports_deleted_by_id_idx"
ON "attendance_imports"("deleted_by_id");

CREATE TABLE "attendance_import_audit_events" (
  "id" TEXT NOT NULL,
  "attendance_import_id" TEXT NOT NULL,
  "event_code" "AttendanceImportAuditEventCode" NOT NULL,
  "original_filename" TEXT NOT NULL,
  "file_sha256" TEXT NOT NULL,
  "import_status_snapshot" "ImportStatus" NOT NULL,
  "parse_status_snapshot" "ParseStatus" NOT NULL,
  "settlement_month" TEXT,
  "period_start" DATE,
  "period_end" DATE,
  "employee_count" INTEGER NOT NULL,
  "day_count" INTEGER NOT NULL,
  "active_row_count" INTEGER NOT NULL,
  "deleted_row_count" INTEGER NOT NULL,
  "warning_count" INTEGER NOT NULL,
  "error_count" INTEGER NOT NULL,
  "generated_files_snapshot" JSONB NOT NULL,
  "actor_user_id" TEXT,
  "actor_display_snapshot" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_import_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_import_audit_events_attendance_import_id_event_code_key"
ON "attendance_import_audit_events"("attendance_import_id", "event_code");
CREATE INDEX "attendance_import_audit_events_occurred_at_idx"
ON "attendance_import_audit_events"("occurred_at");
CREATE INDEX "attendance_import_audit_events_actor_user_id_occurred_at_idx"
ON "attendance_import_audit_events"("actor_user_id", "occurred_at");
CREATE INDEX "attendance_import_audit_events_file_sha256_idx"
ON "attendance_import_audit_events"("file_sha256");

ALTER TABLE "attendance_imports"
ADD CONSTRAINT "attendance_imports_deleted_by_id_fkey"
FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_import_audit_events"
ADD CONSTRAINT "attendance_import_audit_events_attendance_import_id_fkey"
FOREIGN KEY ("attendance_import_id") REFERENCES "attendance_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_import_audit_events"
ADD CONSTRAINT "attendance_import_audit_events_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" (
  "id", "code", "category", "description", "is_system", "created_at", "updated_at"
) VALUES (
  'perm_attendance_imports_delete',
  'attendance.imports.delete',
  'attendance',
  'Soft-delete attendance imports with an immutable audit event.',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "category" = EXCLUDED."category",
  "description" = EXCLUDED."description",
  "is_system" = true,
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" (
  "id", "role_id", "permission_id", "created_at", "updated_at"
)
SELECT
  'rp_' || md5(roles."code" || ':attendance.imports.delete'),
  roles."id",
  permissions."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "roles" roles
JOIN "permissions" permissions ON permissions."code" = 'attendance.imports.delete'
WHERE roles."code" IN ('ADMIN', 'HR_MANAGER')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

DELETE FROM "role_permissions"
USING "roles", "permissions"
WHERE "role_permissions"."role_id" = "roles"."id"
  AND "role_permissions"."permission_id" = "permissions"."id"
  AND "permissions"."code" = 'attendance.imports.delete'
  AND "roles"."code" IN ('SYSTEM', 'WAREHOUSE_MANAGER', 'OFFICE', 'WAREHOUSE');
