import { spawnSync } from "node:child_process";
import { expect } from "@playwright/test";

export interface DashboardClockIntegrityFixture {
  futureContainerId: string;
  futureContainerNo: string;
  futurePayContainerId: string;
  historicalContainerId: string;
}

export function seedDashboardClockIntegrityFixture(
  prefix: string,
): DashboardClockIntegrityFixture {
  const fixture = {
    futureContainerId: `${prefix}-container-future`,
    futureContainerNo: `${prefix}-FUTURE`,
    futurePayContainerId: `${prefix}-pay-future`,
    historicalContainerId: `${prefix}-container-history`,
  };
  cleanupDashboardClockIntegrityFixture(prefix);
  runSql(
    String.raw`
BEGIN;
INSERT INTO containers
  (id, container_no, company, source_format, status, created_at, updated_at)
VALUES
  (:'history_container_id', :'prefix' || '-HISTORY', 'WEB-DASHBOARD-09 E2E',
   'UNKNOWN', 'UNLOADED', NOW(), NOW()),
  (:'future_container_id', :'future_container_no', 'WEB-DASHBOARD-09 E2E',
   'UNKNOWN', 'UNLOADED', NOW(), NOW());
INSERT INTO container_destinations
  (id, container_id, destination_code, destination_type, package_type, cartons,
   volume, calculated_pallets, final_pallets, note, created_at, updated_at)
VALUES
  (:'prefix' || '-destination-history', :'history_container_id', 'WD09-HISTORY',
   'WAREHOUSE', 'CARTON', 10, 1, 1, 1, 'WEB-DASHBOARD-09 fixture', NOW(), NOW()),
  (:'prefix' || '-destination-future', :'future_container_id', 'WD09-FUTURE',
   'WAREHOUSE', 'CARTON', 10, 1, 1, 1, 'WEB-DASHBOARD-09 fixture', NOW(), NOW());
INSERT INTO pay_containers
  (id, pay_container_no, classification, trailer_number, status, currency,
   rate_amount, completed_at, completion_note, created_at, updated_at)
VALUES
  (:'prefix' || '-pay-history', :'prefix' || '-PAY-HISTORY',
   'OCEAN_CONTAINER', :'prefix' || '-TRAILER-HISTORY', 'COMPLETED', 'CAD', 300,
   TIMESTAMPTZ '2000-12-18T20:30:00Z', 'WEB-DASHBOARD-09 historical fixture',
   NOW(), NOW()),
  (:'future_pay_id', :'prefix' || '-PAY-FUTURE',
   'OCEAN_CONTAINER', :'prefix' || '-TRAILER-FUTURE', 'COMPLETED', 'CAD', 300,
   TIMESTAMPTZ '2099-06-18T20:30:00Z', 'WEB-DASHBOARD-09 future fixture',
   NOW(), NOW());
INSERT INTO pay_container_containers
  (id, pay_container_id, container_id, container_no, created_at, updated_at)
VALUES
  (:'prefix' || '-link-history', :'prefix' || '-pay-history',
   :'history_container_id', :'prefix' || '-HISTORY', NOW(), NOW()),
  (:'prefix' || '-link-future', :'future_pay_id',
   :'future_container_id', :'future_container_no', NOW(), NOW());
COMMIT;
`,
    [
      "-v", `prefix=${prefix}`,
      "-v", `history_container_id=${fixture.historicalContainerId}`,
      "-v", `future_container_id=${fixture.futureContainerId}`,
      "-v", `future_container_no=${fixture.futureContainerNo}`,
      "-v", `future_pay_id=${fixture.futurePayContainerId}`,
    ],
  );
  return fixture;
}

export function cleanupDashboardClockIntegrityFixture(prefix: string): void {
  const pattern = `${prefix}%`;
  runSql(
    String.raw`
BEGIN;
DELETE FROM correction_feedback
WHERE pay_container_id IN (SELECT id FROM pay_containers WHERE id LIKE :'pattern')
   OR container_id IN (SELECT id FROM containers WHERE id LIKE :'pattern')
   OR container_destination_id IN (
     SELECT id FROM container_destinations WHERE id LIKE :'pattern'
   );
DELETE FROM pay_container_containers WHERE id LIKE :'pattern';
DELETE FROM pay_containers WHERE id LIKE :'pattern';
DELETE FROM pallets
WHERE container_destination_id IN (
  SELECT id FROM container_destinations WHERE id LIKE :'pattern'
);
DELETE FROM container_lines WHERE container_id IN (
  SELECT id FROM containers WHERE id LIKE :'pattern'
);
DELETE FROM container_destinations WHERE id LIKE :'pattern';
DELETE FROM containers WHERE id LIKE :'pattern';
COMMIT;
`,
    ["-v", `pattern=${pattern}`],
  );
}

export function dashboardClockIntegrityFixtureCount(prefix: string): number {
  const output = runSql(
    String.raw`
SELECT
  (SELECT COUNT(*) FROM containers WHERE id LIKE :'pattern') +
  (SELECT COUNT(*) FROM container_destinations WHERE id LIKE :'pattern') +
  (SELECT COUNT(*) FROM pay_containers WHERE id LIKE :'pattern') +
  (SELECT COUNT(*) FROM pay_container_containers WHERE id LIKE :'pattern');
`,
    ["-v", `pattern=${prefix}%`],
  );
  return Number(output.trim());
}

export function dashboardClockIntegrityWriteSnapshot(prefix: string): string {
  return runSql(
    String.raw`
SELECT json_build_object(
  'containers', (
    SELECT json_agg(json_build_array(id, status, updated_at) ORDER BY id)
    FROM containers WHERE id LIKE :'pattern'
  ),
  'payContainers', (
    SELECT json_agg(json_build_array(id, status, completed_at, updated_at) ORDER BY id)
    FROM pay_containers WHERE id LIKE :'pattern'
  ),
  'corrections', (
    SELECT COUNT(*) FROM correction_feedback
    WHERE container_id IN (SELECT id FROM containers WHERE id LIKE :'pattern')
       OR pay_container_id IN (SELECT id FROM pay_containers WHERE id LIKE :'pattern')
  ),
  'inventoryAdjustments', (
    SELECT COUNT(*) FROM inventory_adjustments
    WHERE container_id IN (SELECT id FROM containers WHERE id LIKE :'pattern')
  )
)::text;
`,
    ["-v", `pattern=${prefix}%`],
  ).trim();
}

function runSql(sql: string, variables: string[]): string {
  const result = spawnSync(
    "psql",
    [
      "-h", requiredEnv("POSTGRES_HOST"),
      "-U", requiredEnv("POSTGRES_USER"),
      "-d", requiredEnv("POSTGRES_DB"),
      "-At",
      "-v", "ON_ERROR_STOP=1",
      ...variables,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: requiredEnv("POSTGRES_PASSWORD") },
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
