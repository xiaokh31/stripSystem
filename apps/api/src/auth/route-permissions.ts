import { PERMISSIONS } from './permissions';

export const ROUTE_PERMISSIONS = {
  imports: {
    upload: [PERMISSIONS.imports.create],
    list: [PERMISSIONS.imports.read],
    getById: [PERMISSIONS.imports.read],
    parse: [PERMISSIONS.imports.parse],
    getParseResult: [PERMISSIONS.imports.read],
  },
  containers: {
    createManual: [
      PERMISSIONS.containers.create,
      PERMISSIONS.corrections.create,
    ],
    read: [PERMISSIONS.containers.read],
    update: [PERMISSIONS.containers.update, PERMISSIONS.corrections.create],
    createDestination: [
      PERMISSIONS.containers.update,
      PERMISSIONS.corrections.create,
    ],
  },
  containerDestinations: {
    delete: [PERMISSIONS.containers.update, PERMISSIONS.corrections.create],
    update: [PERMISSIONS.containers.update, PERMISSIONS.corrections.create],
  },
  corrections: {
    create: [PERMISSIONS.corrections.create],
    list: [PERMISSIONS.corrections.read],
  },
  reports: {
    generate: [PERMISSIONS.reports.generate],
    listFiles: [PERMISSIONS.reports.read],
    downloadFile: [PERMISSIONS.reports.read],
  },
  labels: {
    generate: [PERMISSIONS.labels.generate],
    listPallets: [PERMISSIONS.inventory.read],
    reprint: [PERMISSIONS.labels.reprint],
  },
  inventory: {
    read: [PERMISSIONS.inventory.read],
  },
  loadJobs: {
    create: [PERMISSIONS.loadJobs.create],
    read: [PERMISSIONS.loadJobs.read],
    update: [PERMISSIONS.loadJobs.update],
    delete: [PERMISSIONS.loadJobs.delete],
    complete: [PERMISSIONS.loadJobs.complete],
    scan: [PERMISSIONS.scan.create],
    reverseScan: [PERMISSIONS.scan.reverse],
  },
  users: {
    manage: [PERMISSIONS.users.manage],
  },
  roles: {
    manage: [PERMISSIONS.roles.manage],
  },
  permissions: {
    manage: [PERMISSIONS.roles.manage],
  },
} as const;
