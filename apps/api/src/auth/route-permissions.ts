import { PERMISSIONS } from './permissions';

export const ROUTE_PERMISSIONS = {
  imports: {
    upload: [PERMISSIONS.imports.create],
    list: [PERMISSIONS.imports.read],
    getById: [PERMISSIONS.imports.read],
    parse: [PERMISSIONS.imports.parse],
    delete: [PERMISSIONS.imports.delete],
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
    adjust: [PERMISSIONS.inventory.adjust],
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
  settings: {
    read: [PERMISSIONS.settings.read],
    update: [PERMISSIONS.settings.update],
  },
  attendance: {
    upload: [PERMISSIONS.attendance.create],
    list: [PERMISSIONS.attendance.read],
    getById: [PERMISSIONS.attendance.read],
    parse: [PERMISSIONS.attendance.parse],
    getParseResult: [PERMISSIONS.attendance.read],
    deleteRow: [PERMISSIONS.attendance.deleteRows],
    rowHistory: [PERMISSIONS.attendance.read],
    generateWageRecord: [PERMISSIONS.attendance.generate],
    listFiles: [PERMISSIONS.attendance.read],
  },
  unloadingWage: {
    listWorkers: [PERMISSIONS.unloadingWage.read],
    manageWorkers: [PERMISSIONS.unloadingWage.complete],
    classifyContainer: [
      PERMISSIONS.unloadingWage.classify,
      PERMISSIONS.corrections.create,
    ],
    createPayContainer: [PERMISSIONS.unloadingWage.classify],
    listPayContainers: [PERMISSIONS.unloadingWage.read],
    readPayContainer: [PERMISSIONS.unloadingWage.read],
    completePayContainer: [
      PERMISSIONS.unloadingWage.complete,
      PERMISSIONS.corrections.create,
    ],
    generateSettlement: [PERMISSIONS.unloadingWage.settle],
    listSettlements: [PERMISSIONS.unloadingWage.read],
    getSettlement: [PERMISSIONS.unloadingWage.read],
  },
  unloadingSummary: {
    read: [PERMISSIONS.unloadingSummary.read],
    export: [PERMISSIONS.unloadingSummary.export],
    downloadExport: [PERMISSIONS.unloadingSummary.read],
  },
  parserLearningCases: {
    read: [PERMISSIONS.parserProfiles.read],
    train: [PERMISSIONS.parserProfiles.train],
  },
  parserProfiles: {
    read: [PERMISSIONS.parserProfiles.read],
    train: [PERMISSIONS.parserProfiles.train],
    approve: [PERMISSIONS.parserProfiles.approve],
  },
} as const;
