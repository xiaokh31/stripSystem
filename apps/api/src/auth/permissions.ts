export const ROLE_CODES = {
  admin: 'ADMIN',
  office: 'OFFICE',
  warehouse: 'WAREHOUSE',
  system: 'SYSTEM',
} as const;

export const PERMISSIONS = {
  imports: {
    read: 'imports.read',
    create: 'imports.create',
    parse: 'imports.parse',
    delete: 'imports.delete',
  },
  containers: {
    read: 'containers.read',
    create: 'containers.create',
    update: 'containers.update',
  },
  corrections: {
    read: 'corrections.read',
    create: 'corrections.create',
  },
  reports: {
    read: 'reports.read',
    generate: 'reports.generate',
  },
  labels: {
    generate: 'labels.generate',
    reprint: 'labels.reprint',
  },
  inventory: {
    read: 'inventory.read',
  },
  loadJobs: {
    read: 'load_jobs.read',
    create: 'load_jobs.create',
    update: 'load_jobs.update',
    delete: 'load_jobs.delete',
    complete: 'load_jobs.complete',
  },
  scan: {
    create: 'scan.create',
    reverse: 'scan.reverse',
  },
  users: {
    manage: 'users.manage',
  },
  roles: {
    manage: 'roles.manage',
  },
  settings: {
    read: 'settings.read',
    update: 'settings.update',
  },
} as const;

export type PermissionCode = LeafValues<typeof PERMISSIONS>;
export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

type LeafValues<T> = T extends string
  ? T
  : {
      [K in keyof T]: LeafValues<T[K]>;
    }[keyof T];
