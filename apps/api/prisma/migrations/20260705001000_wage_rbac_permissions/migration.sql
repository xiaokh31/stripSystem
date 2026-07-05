-- Add wage settlement RBAC permissions introduced after the original auth seed.
-- This migration is intentionally idempotent for long-lived local/production
-- databases that already contain a subset of these codes.

WITH new_permissions(id, code, category, description) AS (
  VALUES
    ('perm_attendance_read', 'attendance.read', 'attendance', 'Read attendance imports and parse results.'),
    ('perm_attendance_create', 'attendance.create', 'attendance', 'Upload attendance files.'),
    ('perm_attendance_parse', 'attendance.parse', 'attendance', 'Parse attendance files.'),
    ('perm_attendance_generate', 'attendance.generate', 'attendance', 'Generate wage record workbooks.'),
    ('perm_unloading_wage_read', 'unloading_wage.read', 'unloading_wage', 'Read unloading wage pay containers and settlements.'),
    ('perm_unloading_wage_classify', 'unloading_wage.classify', 'unloading_wage', 'Classify containers for unloading wage settlement.'),
    ('perm_unloading_wage_complete', 'unloading_wage.complete', 'unloading_wage', 'Complete unloading work and assign unloaders.'),
    ('perm_unloading_wage_settle', 'unloading_wage.settle', 'unloading_wage', 'Generate monthly unloading wage settlements.')
)
INSERT INTO "permissions" ("id", "code", "category", "description", "is_system", "created_at", "updated_at")
SELECT id, code, category, description, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM new_permissions
ON CONFLICT ("code") DO UPDATE
SET
  "category" = EXCLUDED."category",
  "description" = EXCLUDED."description",
  "is_system" = true,
  "updated_at" = CURRENT_TIMESTAMP;

WITH role_permission_codes(role_code, permission_code) AS (
  VALUES
    ('ADMIN', 'attendance.read'),
    ('ADMIN', 'attendance.create'),
    ('ADMIN', 'attendance.parse'),
    ('ADMIN', 'attendance.generate'),
    ('ADMIN', 'unloading_wage.read'),
    ('ADMIN', 'unloading_wage.classify'),
    ('ADMIN', 'unloading_wage.complete'),
    ('ADMIN', 'unloading_wage.settle'),
    ('OFFICE', 'attendance.read'),
    ('OFFICE', 'attendance.create'),
    ('OFFICE', 'attendance.parse'),
    ('OFFICE', 'attendance.generate'),
    ('OFFICE', 'unloading_wage.read'),
    ('OFFICE', 'unloading_wage.classify'),
    ('OFFICE', 'unloading_wage.complete'),
    ('OFFICE', 'unloading_wage.settle'),
    ('WAREHOUSE', 'unloading_wage.read'),
    ('WAREHOUSE', 'unloading_wage.complete'),
    ('SYSTEM', 'attendance.parse'),
    ('SYSTEM', 'attendance.generate'),
    ('SYSTEM', 'unloading_wage.settle')
)
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at", "updated_at")
SELECT
  'rp_' || md5(role_permission_codes.role_code || ':' || role_permission_codes.permission_code),
  roles."id",
  permissions."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM role_permission_codes
JOIN "roles" roles ON roles."code" = role_permission_codes.role_code
JOIN "permissions" permissions ON permissions."code" = role_permission_codes.permission_code
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
