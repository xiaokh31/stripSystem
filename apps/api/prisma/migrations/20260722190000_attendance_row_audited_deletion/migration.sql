CREATE TYPE "AttendanceRowAuditEventCode" AS ENUM ('DELETED');

ALTER TABLE "attendance_imports"
ADD COLUMN "data_revision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "attendance_rows"
ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT,
ADD COLUMN "deletion_reason" TEXT;

CREATE TABLE "attendance_row_audit_events" (
  "id" TEXT NOT NULL,
  "attendance_import_id" TEXT NOT NULL,
  "attendance_row_id" TEXT,
  "row_key" TEXT NOT NULL,
  "event_code" "AttendanceRowAuditEventCode" NOT NULL,
  "employee_id" TEXT,
  "employee_name" TEXT,
  "department" TEXT,
  "work_date" DATE NOT NULL,
  "row_snapshot" JSONB NOT NULL,
  "actor_user_id" TEXT,
  "actor_display_snapshot" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_row_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_rows_attendance_import_id_deleted_at_idx"
ON "attendance_rows"("attendance_import_id", "deleted_at");
CREATE INDEX "attendance_rows_deleted_by_id_idx"
ON "attendance_rows"("deleted_by_id");
CREATE INDEX "attendance_row_audit_events_attendance_import_id_occurred_at_idx"
ON "attendance_row_audit_events"("attendance_import_id", "occurred_at");
CREATE INDEX "attendance_row_audit_events_attendance_row_id_idx"
ON "attendance_row_audit_events"("attendance_row_id");
CREATE INDEX "attendance_row_audit_events_actor_user_id_idx"
ON "attendance_row_audit_events"("actor_user_id");
CREATE UNIQUE INDEX "attendance_row_audit_events_attendance_import_id_row_key_event_code_key"
ON "attendance_row_audit_events"("attendance_import_id", "row_key", "event_code");

ALTER TABLE "attendance_rows"
ADD CONSTRAINT "attendance_rows_deleted_by_id_fkey"
FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_row_audit_events"
ADD CONSTRAINT "attendance_row_audit_events_attendance_import_id_fkey"
FOREIGN KEY ("attendance_import_id") REFERENCES "attendance_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_row_audit_events"
ADD CONSTRAINT "attendance_row_audit_events_attendance_row_id_fkey"
FOREIGN KEY ("attendance_row_id") REFERENCES "attendance_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_row_audit_events"
ADD CONSTRAINT "attendance_row_audit_events_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" (
  "id", "code", "category", "description", "is_system", "created_at", "updated_at"
) VALUES (
  'perm_attendance_rows_delete',
  'attendance.rows.delete',
  'attendance',
  'Soft-delete attendance employee-day rows with an immutable audit event.',
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
  'rp_' || md5(roles."code" || ':attendance.rows.delete'),
  roles."id",
  permissions."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "roles" roles
JOIN "permissions" permissions ON permissions."code" = 'attendance.rows.delete'
WHERE roles."code" IN ('ADMIN', 'HR_MANAGER')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

DELETE FROM "role_permissions"
USING "roles", "permissions"
WHERE "role_permissions"."role_id" = "roles"."id"
  AND "role_permissions"."permission_id" = "permissions"."id"
  AND "permissions"."code" = 'attendance.rows.delete'
  AND "roles"."code" IN ('SYSTEM', 'WAREHOUSE_MANAGER', 'OFFICE', 'WAREHOUSE');
