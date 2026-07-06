ALTER TYPE "GeneratedFileType" ADD VALUE 'MONTHLY_UNLOADING_SUMMARY_XLSX';

WITH new_permissions(id, code, category, description) AS (
  VALUES
    ('perm_unloading_summary_read', 'unloading_summary.read', 'unloading_summary', 'Read monthly unloading data summaries.'),
    ('perm_unloading_summary_export', 'unloading_summary.export', 'unloading_summary', 'Export monthly unloading data summary workbooks.')
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
    ('ADMIN', 'unloading_summary.read'),
    ('ADMIN', 'unloading_summary.export'),
    ('OFFICE', 'unloading_summary.read'),
    ('OFFICE', 'unloading_summary.export'),
    ('WAREHOUSE_MANAGER', 'unloading_summary.read'),
    ('WAREHOUSE_MANAGER', 'unloading_summary.export')
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
