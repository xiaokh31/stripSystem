-- Split wage settlement permissions into dedicated manager roles.
-- Keep legacy users.role enum unchanged; new business roles live in roles /
-- user_roles and can be assigned by admins after migration.

WITH new_roles(id, code, display_name, description) AS (
  VALUES
    ('role_hr_manager', 'HR_MANAGER', 'Human Resources Manager', 'HR work hours settlement manager.'),
    ('role_warehouse_manager', 'WAREHOUSE_MANAGER', 'Warehouse Manager', 'Container unloading wage settlement manager.')
)
INSERT INTO "roles" ("id", "code", "display_name", "description", "is_system", "is_active", "created_at", "updated_at")
SELECT id, code, display_name, description, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM new_roles
ON CONFLICT ("code") DO UPDATE
SET
  "display_name" = EXCLUDED."display_name",
  "description" = EXCLUDED."description",
  "is_system" = true,
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;

DELETE FROM "role_permissions"
USING "roles", "permissions"
WHERE "role_permissions"."role_id" = "roles"."id"
  AND "role_permissions"."permission_id" = "permissions"."id"
  AND "roles"."code" = 'OFFICE'
  AND (
    "permissions"."code" LIKE 'attendance.%'
    OR "permissions"."code" LIKE 'unloading_wage.%'
  );

DELETE FROM "role_permissions"
USING "roles", "permissions"
WHERE "role_permissions"."role_id" = "roles"."id"
  AND "role_permissions"."permission_id" = "permissions"."id"
  AND "roles"."code" = 'WAREHOUSE'
  AND "permissions"."code" LIKE 'unloading_wage.%';

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
    ('HR_MANAGER', 'settings.read'),
    ('HR_MANAGER', 'attendance.read'),
    ('HR_MANAGER', 'attendance.create'),
    ('HR_MANAGER', 'attendance.parse'),
    ('HR_MANAGER', 'attendance.generate'),
    ('WAREHOUSE_MANAGER', 'settings.read'),
    ('WAREHOUSE_MANAGER', 'containers.read'),
    ('WAREHOUSE_MANAGER', 'corrections.create'),
    ('WAREHOUSE_MANAGER', 'unloading_wage.read'),
    ('WAREHOUSE_MANAGER', 'unloading_wage.classify'),
    ('WAREHOUSE_MANAGER', 'unloading_wage.complete'),
    ('WAREHOUSE_MANAGER', 'unloading_wage.settle'),
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
