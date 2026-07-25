import { unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { expect } from "@playwright/test";

const storageRoot = "/workspace/storage/unloading_wage_settlements/";

export function cleanupUnloadingWageFixture(prefix: string): void {
  const pattern = `%${prefix}%`;
  const paths = runSql(
    String.raw`
SELECT storage_path
FROM wage_generated_files
WHERE unloading_wage_settlement_id IN (
  SELECT DISTINCT settlement_id
  FROM unloading_wage_settlement_lines
  WHERE pay_container_id IN (
    SELECT id FROM pay_containers
    WHERE trailer_number LIKE :'pattern'
  )
)
ORDER BY storage_path;
`,
    ["-v", `pattern=${pattern}`],
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  for (const path of paths) {
    expect(
      path.startsWith(storageRoot) &&
        !path.includes("..") &&
        /\/settlement(-report)?\.(json|html)$/.test(path),
      `unsafe unloading-wage fixture path: ${path}`,
    ).toBe(true);
    try {
      unlinkSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  runSql(
    String.raw`
BEGIN;
CREATE TEMP TABLE target_pay ON COMMIT DROP AS
  SELECT id FROM pay_containers WHERE trailer_number LIKE :'pattern';
CREATE TEMP TABLE target_containers ON COMMIT DROP AS
  SELECT container_id AS id FROM pay_container_containers
  WHERE pay_container_id IN (SELECT id FROM target_pay);
CREATE TEMP TABLE target_destinations ON COMMIT DROP AS
  SELECT id FROM container_destinations
  WHERE container_id IN (SELECT id FROM target_containers);
CREATE TEMP TABLE target_pallets ON COMMIT DROP AS
  SELECT id FROM pallets
  WHERE container_destination_id IN (SELECT id FROM target_destinations);
CREATE TEMP TABLE target_settlements ON COMMIT DROP AS
  SELECT DISTINCT settlement_id AS id FROM unloading_wage_settlement_lines
  WHERE pay_container_id IN (SELECT id FROM target_pay);
CREATE TEMP TABLE target_workers ON COMMIT DROP AS
  SELECT id FROM unloading_workers WHERE worker_code LIKE :'pattern';
CREATE TEMP TABLE target_users ON COMMIT DROP AS
  SELECT id FROM users WHERE email LIKE :'pattern';
CREATE TEMP TABLE target_wage_files ON COMMIT DROP AS
  SELECT id FROM wage_generated_files
  WHERE unloading_wage_settlement_id IN (SELECT id FROM target_settlements);

DELETE FROM correction_feedback
WHERE pay_container_id IN (SELECT id FROM target_pay)
   OR container_id IN (SELECT id FROM target_containers)
   OR container_destination_id IN (SELECT id FROM target_destinations)
   OR pallet_id IN (SELECT id FROM target_pallets)
   OR unloading_wage_settlement_id IN (SELECT id FROM target_settlements)
   OR corrected_by_id IN (SELECT id FROM target_users);
DELETE FROM pallet_events
WHERE pallet_id IN (SELECT id FROM target_pallets)
   OR operator_id IN (SELECT id FROM target_users);
DELETE FROM inventory_adjustments
WHERE container_id IN (SELECT id FROM target_containers)
   OR container_destination_id IN (SELECT id FROM target_destinations)
   OR created_by_id IN (SELECT id FROM target_users);
DELETE FROM async_jobs
WHERE container_id IN (SELECT id FROM target_containers)
   OR wage_generated_file_id IN (SELECT id FROM target_wage_files)
   OR actor_user_id IN (SELECT id FROM target_users);
DELETE FROM wage_generated_files WHERE id IN (SELECT id FROM target_wage_files);
DELETE FROM unloading_wage_settlements WHERE id IN (SELECT id FROM target_settlements);
DELETE FROM unloader_assignments WHERE pay_container_id IN (SELECT id FROM target_pay);
DELETE FROM pay_container_containers WHERE pay_container_id IN (SELECT id FROM target_pay);
DELETE FROM pay_containers WHERE id IN (SELECT id FROM target_pay);
DELETE FROM unloading_workers WHERE id IN (SELECT id FROM target_workers);
DELETE FROM pallet_events WHERE pallet_id IN (SELECT id FROM target_pallets);
DELETE FROM pallets WHERE id IN (SELECT id FROM target_pallets);
DELETE FROM container_lines WHERE container_id IN (SELECT id FROM target_containers);
DELETE FROM generated_files WHERE container_id IN (SELECT id FROM target_containers);
DELETE FROM container_destinations WHERE id IN (SELECT id FROM target_destinations);
DELETE FROM containers WHERE id IN (SELECT id FROM target_containers);
DELETE FROM auth_audit_events
WHERE user_id IN (SELECT id FROM target_users)
   OR actor_user_id IN (SELECT id FROM target_users);
DELETE FROM native_auth_sessions
WHERE user_id IN (SELECT id FROM target_users)
   OR revoked_by_user_id IN (SELECT id FROM target_users);
DELETE FROM user_roles
WHERE user_id IN (SELECT id FROM target_users)
   OR assigned_by_id IN (SELECT id FROM target_users);
DELETE FROM users WHERE id IN (SELECT id FROM target_users);
COMMIT;
`,
    ["-v", `pattern=${pattern}`],
  );
}

export function unloadingWageFixtureCount(prefix: string): number {
  const pattern = `%${prefix}%`;
  const output = runSql(
    String.raw`
COPY (
  SELECT
    (SELECT COUNT(*) FROM pay_containers WHERE trailer_number LIKE :'pattern') +
    (SELECT COUNT(*) FROM containers WHERE container_no LIKE :'pattern') +
    (SELECT COUNT(*) FROM unloading_workers WHERE worker_code LIKE :'pattern') +
    (SELECT COUNT(*) FROM users WHERE email LIKE :'pattern') +
    (SELECT COUNT(*) FROM unloading_wage_settlements s WHERE EXISTS (
      SELECT 1 FROM unloading_wage_settlement_lines l
      JOIN pay_containers pc ON pc.id = l.pay_container_id
      WHERE l.settlement_id = s.id AND pc.trailer_number LIKE :'pattern'
    ))
) TO STDOUT;
`,
    ["-v", `pattern=${pattern}`],
  );
  return Number(output.trim());
}

function runSql(sql: string, variables: string[]): string {
  const result = spawnSync(
    "psql",
    [
      "-h",
      requiredEnv("POSTGRES_HOST"),
      "-U",
      requiredEnv("POSTGRES_USER"),
      "-d",
      requiredEnv("POSTGRES_DB"),
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      ...variables,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PGPASSWORD: requiredEnv("POSTGRES_PASSWORD"),
      },
      input: sql,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for WEB-DASHBOARD-09.`);
  return value;
}
