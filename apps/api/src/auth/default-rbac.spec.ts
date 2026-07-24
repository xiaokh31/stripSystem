import {
  DEFAULT_PERMISSIONS,
  DEFAULT_ROLE_PERMISSION_CODES,
  DEFAULT_ROLES,
} from './default-rbac';
import { PERMISSIONS, ROLE_CODES } from './permissions';

describe('default RBAC seed data', () => {
  it('defines unique stable permission codes for every API permission constant', () => {
    const seededCodes = DEFAULT_PERMISSIONS.map(
      (permission) => permission.code,
    );
    const exportedCodes = permissionCodes(PERMISSIONS);

    expect([...new Set(seededCodes)].sort()).toEqual(seededCodes.sort());
    expect(seededCodes.sort()).toEqual(exportedCodes.sort());
  });

  it('grants ADMIN every default permission', () => {
    expect(DEFAULT_ROLE_PERMISSION_CODES[ROLE_CODES.admin].sort()).toEqual(
      DEFAULT_PERMISSIONS.map((permission) => permission.code).sort(),
    );
  });

  it('defines dedicated wage manager role records', () => {
    expect(DEFAULT_ROLES.map((role) => role.code).sort()).toEqual([
      ROLE_CODES.admin,
      ROLE_CODES.hrManager,
      ROLE_CODES.office,
      ROLE_CODES.system,
      ROLE_CODES.warehouse,
      ROLE_CODES.warehouseManager,
    ]);
  });

  it('grants OFFICE operating permissions without account-management access', () => {
    const officePermissions = new Set(
      DEFAULT_ROLE_PERMISSION_CODES[ROLE_CODES.office],
    );

    expect(officePermissions).toEqual(
      new Set([
        PERMISSIONS.imports.read,
        PERMISSIONS.imports.create,
        PERMISSIONS.imports.parse,
        PERMISSIONS.imports.delete,
        PERMISSIONS.containers.read,
        PERMISSIONS.containers.create,
        PERMISSIONS.containers.update,
        PERMISSIONS.corrections.read,
        PERMISSIONS.corrections.create,
        PERMISSIONS.reports.read,
        PERMISSIONS.reports.generate,
        PERMISSIONS.labels.generate,
        PERMISSIONS.labels.reprint,
        PERMISSIONS.inventory.read,
        PERMISSIONS.inventory.adjust,
        PERMISSIONS.loadJobs.read,
        PERMISSIONS.loadJobs.create,
        PERMISSIONS.loadJobs.update,
        PERMISSIONS.loadJobs.delete,
        PERMISSIONS.loadJobs.complete,
        PERMISSIONS.scan.create,
        PERMISSIONS.scan.override,
        PERMISSIONS.scan.reverse,
        PERMISSIONS.settings.read,
        PERMISSIONS.unloadingSummary.read,
        PERMISSIONS.unloadingSummary.export,
        PERMISSIONS.parserProfiles.read,
        PERMISSIONS.parserProfiles.train,
        PERMISSIONS.parserProfiles.review,
      ]),
    );
    expect(officePermissions.has(PERMISSIONS.users.manage)).toBe(false);
    expect(officePermissions.has(PERMISSIONS.roles.manage)).toBe(false);
    expect(officePermissions.has(PERMISSIONS.settings.update)).toBe(false);
    expect(hasAnyWagePermission(officePermissions)).toBe(false);
  });

  it('grants HR_MANAGER only work-hours settlement permissions', () => {
    const hrPermissions = new Set(
      DEFAULT_ROLE_PERMISSION_CODES[ROLE_CODES.hrManager],
    );

    expect(hrPermissions).toEqual(
      new Set([
        PERMISSIONS.settings.read,
        PERMISSIONS.attendance.read,
        PERMISSIONS.attendance.create,
        PERMISSIONS.attendance.parse,
        PERMISSIONS.attendance.generate,
        PERMISSIONS.attendance.deleteRows,
        PERMISSIONS.attendance.deleteImports,
      ]),
    );
    expect(hasAnyUnloadingWagePermission(hrPermissions)).toBe(false);
  });

  it('limits WAREHOUSE to scan, dock/job update, and inventory read access', () => {
    expect(
      new Set(DEFAULT_ROLE_PERMISSION_CODES[ROLE_CODES.warehouse]),
    ).toEqual(
      new Set([
        PERMISSIONS.loadJobs.read,
        PERMISSIONS.loadJobs.update,
        PERMISSIONS.loadJobs.complete,
        PERMISSIONS.scan.create,
        PERMISSIONS.scan.reverse,
        PERMISSIONS.inventory.read,
        PERMISSIONS.settings.read,
      ]),
    );
    expect(
      hasAnyUnloadingWagePermission(
        new Set(DEFAULT_ROLE_PERMISSION_CODES[ROLE_CODES.warehouse]),
      ),
    ).toBe(false);
    expect(
      new Set(DEFAULT_ROLE_PERMISSION_CODES[ROLE_CODES.warehouse]).has(
        PERMISSIONS.inventory.adjust,
      ),
    ).toBe(false);
  });

  it('grants WAREHOUSE_MANAGER unloading wage settlement and summary permissions', () => {
    const warehouseManagerPermissions = new Set(
      DEFAULT_ROLE_PERMISSION_CODES[ROLE_CODES.warehouseManager],
    );

    expect(warehouseManagerPermissions).toEqual(
      new Set([
        PERMISSIONS.settings.read,
        PERMISSIONS.containers.read,
        PERMISSIONS.corrections.create,
        PERMISSIONS.unloadingWage.read,
        PERMISSIONS.unloadingWage.classify,
        PERMISSIONS.unloadingWage.complete,
        PERMISSIONS.unloadingWage.settle,
        PERMISSIONS.unloadingSummary.read,
        PERMISSIONS.unloadingSummary.export,
      ]),
    );
    expect(hasAnyAttendancePermission(warehouseManagerPermissions)).toBe(false);
    expect(warehouseManagerPermissions.has(PERMISSIONS.inventory.adjust)).toBe(
      false,
    );
  });

  it('grants parser-profile permissions only to the approved default roles', () => {
    expect(parserProfilePermissions(ROLE_CODES.admin)).toEqual(
      new Set([
        PERMISSIONS.parserProfiles.read,
        PERMISSIONS.parserProfiles.train,
        PERMISSIONS.parserProfiles.review,
        PERMISSIONS.parserProfiles.approve,
      ]),
    );
    expect(parserProfilePermissions(ROLE_CODES.office)).toEqual(
      new Set([
        PERMISSIONS.parserProfiles.read,
        PERMISSIONS.parserProfiles.train,
        PERMISSIONS.parserProfiles.review,
      ]),
    );
    expect(parserProfilePermissions(ROLE_CODES.warehouse)).toEqual(new Set());
    expect(parserProfilePermissions(ROLE_CODES.hrManager)).toEqual(new Set());
    expect(parserProfilePermissions(ROLE_CODES.warehouseManager)).toEqual(
      new Set(),
    );
  });
});

function parserProfilePermissions(roleCode: string): Set<string> {
  return new Set(
    DEFAULT_ROLE_PERMISSION_CODES[
      roleCode as keyof typeof DEFAULT_ROLE_PERMISSION_CODES
    ].filter((permission) => permission.startsWith('parser_profiles.')),
  );
}

function permissionCodes(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.values(value).flatMap((item) => permissionCodes(item));
}

function hasAnyWagePermission(permissions: Set<string>): boolean {
  return (
    hasAnyAttendancePermission(permissions) ||
    hasAnyUnloadingWagePermission(permissions)
  );
}

function hasAnyAttendancePermission(permissions: Set<string>): boolean {
  return [...permissions].some((permission) =>
    permission.startsWith('attendance.'),
  );
}

function hasAnyUnloadingWagePermission(permissions: Set<string>): boolean {
  return [...permissions].some((permission) =>
    permission.startsWith('unloading_wage.'),
  );
}
