import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('attendance import deletion migration', () => {
  const migration = readFileSync(
    resolve(
      process.cwd(),
      'prisma',
      'migrations',
      '20260723193000_attendance_import_audited_deletion',
      'migration.sql',
    ),
    'utf8',
  );

  it('replaces global SHA uniqueness with an active-only PostgreSQL constraint', () => {
    expect(migration).toContain(
      'DROP INDEX "attendance_imports_file_sha256_key"',
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "attendance_imports_active_file_sha256_key"[\s\S]+WHERE "deleted_at" IS NULL/,
    );
  });

  it('preserves import audit events and grants deletion only to HR and admin defaults', () => {
    expect(migration).toContain(
      'REFERENCES "attendance_imports"("id") ON DELETE RESTRICT',
    );
    expect(migration).toContain("'attendance.imports.delete'");
    expect(migration).toContain(
      `WHERE roles."code" IN ('ADMIN', 'HR_MANAGER')`,
    );
    expect(migration).toContain(
      `"roles"."code" IN ('SYSTEM', 'WAREHOUSE_MANAGER', 'OFFICE', 'WAREHOUSE')`,
    );
  });
});
