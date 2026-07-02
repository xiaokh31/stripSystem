import {
  PERMISSIONS,
  ROLE_CODES,
  PermissionCode,
  RoleCode,
} from './permissions';

export interface DefaultPermission {
  code: PermissionCode;
  category: string;
  description: string;
}

export interface DefaultRole {
  code: RoleCode;
  displayName: string;
  description: string;
  isSystem: boolean;
}

export const DEFAULT_PERMISSIONS: DefaultPermission[] = [
  permission(PERMISSIONS.imports.read, 'imports', 'Read import files.'),
  permission(PERMISSIONS.imports.create, 'imports', 'Upload import files.'),
  permission(PERMISSIONS.imports.parse, 'imports', 'Parse import files.'),
  permission(PERMISSIONS.imports.delete, 'imports', 'Delete bad imports.'),
  permission(PERMISSIONS.containers.read, 'containers', 'Read containers.'),
  permission(
    PERMISSIONS.containers.create,
    'containers',
    'Create manual containers.',
  ),
  permission(
    PERMISSIONS.containers.update,
    'containers',
    'Update containers and destinations.',
  ),
  permission(
    PERMISSIONS.corrections.read,
    'corrections',
    'Read correction feedback.',
  ),
  permission(
    PERMISSIONS.corrections.create,
    'corrections',
    'Create correction feedback.',
  ),
  permission(PERMISSIONS.reports.read, 'reports', 'Read generated files.'),
  permission(
    PERMISSIONS.reports.generate,
    'reports',
    'Generate unloading reports.',
  ),
  permission(
    PERMISSIONS.labels.generate,
    'labels',
    'Generate pallet label PDFs.',
  ),
  permission(PERMISSIONS.labels.reprint, 'labels', 'Reprint pallet labels.'),
  permission(
    PERMISSIONS.inventory.read,
    'inventory',
    'Read inventory and progress.',
  ),
  permission(PERMISSIONS.loadJobs.read, 'load_jobs', 'Read load jobs.'),
  permission(PERMISSIONS.loadJobs.create, 'load_jobs', 'Create load jobs.'),
  permission(PERMISSIONS.loadJobs.update, 'load_jobs', 'Update load jobs.'),
  permission(PERMISSIONS.loadJobs.delete, 'load_jobs', 'Delete load jobs.'),
  permission(PERMISSIONS.loadJobs.complete, 'load_jobs', 'Complete load jobs.'),
  permission(PERMISSIONS.scan.create, 'scan', 'Scan pallets into load jobs.'),
  permission(PERMISSIONS.scan.reverse, 'scan', 'Reverse pallet scans.'),
  permission(PERMISSIONS.users.manage, 'users', 'Manage users.'),
  permission(
    PERMISSIONS.roles.manage,
    'roles',
    'Manage roles and permissions.',
  ),
];

export const DEFAULT_ROLES: DefaultRole[] = [
  role(ROLE_CODES.admin, 'Administrator', 'Full system access.', true),
  role(ROLE_CODES.office, 'Office Staff', 'Office unloading operations.', true),
  role(
    ROLE_CODES.warehouse,
    'Warehouse Staff',
    'Warehouse loading and scan operations.',
    true,
  ),
  role(ROLE_CODES.system, 'System Service', 'Non-human worker account.', true),
];

export const DEFAULT_ROLE_PERMISSION_CODES: Record<RoleCode, PermissionCode[]> =
  {
    [ROLE_CODES.admin]: DEFAULT_PERMISSIONS.map((item) => item.code),
    [ROLE_CODES.office]: [
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
      PERMISSIONS.loadJobs.read,
      PERMISSIONS.loadJobs.create,
      PERMISSIONS.loadJobs.update,
      PERMISSIONS.loadJobs.delete,
      PERMISSIONS.loadJobs.complete,
      PERMISSIONS.scan.create,
      PERMISSIONS.scan.reverse,
    ],
    [ROLE_CODES.warehouse]: [
      PERMISSIONS.loadJobs.read,
      PERMISSIONS.loadJobs.update,
      PERMISSIONS.loadJobs.complete,
      PERMISSIONS.scan.create,
      PERMISSIONS.scan.reverse,
      PERMISSIONS.inventory.read,
    ],
    [ROLE_CODES.system]: [
      PERMISSIONS.imports.parse,
      PERMISSIONS.reports.generate,
      PERMISSIONS.labels.generate,
      PERMISSIONS.inventory.read,
    ],
  };

function permission(
  code: PermissionCode,
  category: string,
  description: string,
): DefaultPermission {
  return { code, category, description };
}

function role(
  code: RoleCode,
  displayName: string,
  description: string,
  isSystem: boolean,
): DefaultRole {
  return { code, displayName, description, isSystem };
}
