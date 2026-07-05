import test from "node:test";
import assert from "node:assert/strict";
import type { AuthUserResponse } from "../src/lib/api-client";
import {
  canManageAccounts,
  canClassifyUnloadingWage,
  canDeleteImports,
  canCompleteUnloadingWage,
  canManageContainerUnloadingWage,
  canManageOfficeLoadJobs,
  canCompleteMobileLoadJob,
  canReprintLabels,
  canReviewUnloadingWage,
  canReviewWorkHours,
  canGenerateWorkHours,
  canParseWorkHours,
  canReverseMobileScans,
  canSaveMobileDock,
  canScanMobilePallets,
  canSettleUnloadingWage,
  canSupervisorOverrideScans,
  canUpdateSettings,
  canUploadWorkHours,
  canViewMobileLoadJobs,
  hasAllPermissions,
  hasPermission,
  hasRole,
} from "../src/lib/permissions";

const officeUser: AuthUserResponse = {
  id: "office-1",
  email: "office@example.com",
  name: "Office",
  roles: ["OFFICE"],
  permissions: ["imports.read", "containers.read"],
};

test("admin role can manage accounts even when token permissions are compact", () => {
  const adminUser: AuthUserResponse = {
    id: "admin-1",
    email: "admin@example.com",
    name: "Admin",
    roles: ["ADMIN"],
    permissions: [],
  };

  assert.equal(hasRole(adminUser, "ADMIN"), true);
  assert.equal(hasPermission(adminUser, "users.manage"), true);
  assert.equal(canManageAccounts(adminUser), true);
});

test("account management UI is limited to ADMIN role", () => {
  const delegatedUser: AuthUserResponse = {
    id: "delegated-1",
    email: "delegated@example.com",
    name: "Delegated",
    roles: ["OFFICE"],
    permissions: ["users.manage", "roles.manage"],
  };

  assert.equal(hasAllPermissions(delegatedUser, ["users.manage"]), true);
  assert.equal(canManageAccounts(delegatedUser), false);
  assert.equal(canManageAccounts(officeUser), false);
  assert.equal(hasPermission(null, "users.manage"), false);
});

test("mobile warehouse permissions allow scanning without account management", () => {
  const warehouseUser: AuthUserResponse = {
    id: "warehouse-1",
    email: "warehouse@example.com",
    name: "Warehouse",
    roles: ["WAREHOUSE"],
    permissions: [
      "load_jobs.read",
      "load_jobs.update",
      "load_jobs.complete",
      "scan.create",
      "scan.reverse",
      "inventory.read",
    ],
  };

  assert.equal(canViewMobileLoadJobs(warehouseUser), true);
  assert.equal(canSaveMobileDock(warehouseUser), true);
  assert.equal(canCompleteMobileLoadJob(warehouseUser), true);
  assert.equal(canScanMobilePallets(warehouseUser), true);
  assert.equal(canSupervisorOverrideScans(warehouseUser), false);
  assert.equal(canReverseMobileScans(warehouseUser), true);
  assert.equal(canManageOfficeLoadJobs(warehouseUser), false);
  assert.equal(canManageAccounts(warehouseUser), false);
});

test("mobile scan permissions are based on granted permissions", () => {
  const mobileOfficeUser: AuthUserResponse = {
    id: "office-mobile-1",
    email: "office-mobile@example.com",
    name: "Office Mobile",
    roles: ["OFFICE"],
    permissions: ["load_jobs.read", "scan.create"],
  };

  assert.equal(canViewMobileLoadJobs(mobileOfficeUser), true);
  assert.equal(canSaveMobileDock(mobileOfficeUser), false);
  assert.equal(canCompleteMobileLoadJob(mobileOfficeUser), false);
  assert.equal(canScanMobilePallets(mobileOfficeUser), true);
  assert.equal(canSupervisorOverrideScans(mobileOfficeUser), false);
  assert.equal(canReverseMobileScans(mobileOfficeUser), false);
  assert.equal(canViewMobileLoadJobs(null), false);
});

test("supervisor scan override requires explicit permission or admin role", () => {
  const supervisorUser: AuthUserResponse = {
    id: "supervisor-1",
    email: "supervisor@example.com",
    name: "Supervisor",
    roles: ["OFFICE"],
    permissions: ["scan.create", "scan.override"],
  };
  const adminUser: AuthUserResponse = {
    id: "admin-1",
    email: "admin@example.com",
    name: "Admin",
    roles: ["ADMIN"],
    permissions: [],
  };

  assert.equal(canSupervisorOverrideScans(supervisorUser), true);
  assert.equal(canSupervisorOverrideScans(adminUser), true);
  assert.equal(canSupervisorOverrideScans(null), false);
});

test("office load job management requires load job create permission", () => {
  const officePlanner: AuthUserResponse = {
    id: "office-planner-1",
    email: "planner@example.com",
    name: "Office Planner",
    roles: ["OFFICE"],
    permissions: ["load_jobs.create", "load_jobs.read"],
  };
  const readOnlyWarehouse: AuthUserResponse = {
    id: "warehouse-read-1",
    email: "warehouse-read@example.com",
    name: "Warehouse Read",
    roles: ["WAREHOUSE"],
    permissions: ["load_jobs.read", "load_jobs.update", "scan.create"],
  };
  const adminUser: AuthUserResponse = {
    id: "admin-load-1",
    email: "admin-load@example.com",
    name: "Admin Load",
    roles: ["ADMIN"],
    permissions: [],
  };

  assert.equal(canManageOfficeLoadJobs(officePlanner), true);
  assert.equal(canManageOfficeLoadJobs(adminUser), true);
  assert.equal(canManageOfficeLoadJobs(readOnlyWarehouse), false);
  assert.equal(canManageOfficeLoadJobs(null), false);
});

test("import deletion requires explicit import delete permission", () => {
  const officeImporter: AuthUserResponse = {
    id: "office-importer-1",
    email: "importer@example.com",
    name: "Office Importer",
    roles: ["OFFICE"],
    permissions: ["imports.read", "imports.create", "imports.delete"],
  };
  const warehouseUser: AuthUserResponse = {
    id: "warehouse-import-1",
    email: "warehouse-import@example.com",
    name: "Warehouse Import",
    roles: ["WAREHOUSE"],
    permissions: ["imports.read"],
  };
  const adminUser: AuthUserResponse = {
    id: "admin-import-1",
    email: "admin-import@example.com",
    name: "Admin Import",
    roles: ["ADMIN"],
    permissions: [],
  };

  assert.equal(canDeleteImports(officeImporter), true);
  assert.equal(canDeleteImports(adminUser), true);
  assert.equal(canDeleteImports(warehouseUser), false);
  assert.equal(canDeleteImports(null), false);
});

test("label reprint permission is not granted to warehouse by default", () => {
  const officeUser: AuthUserResponse = {
    id: "office-reprint-1",
    email: "office-reprint@example.com",
    name: "Office Reprint",
    roles: ["OFFICE"],
    permissions: ["labels.reprint"],
  };
  const warehouseUser: AuthUserResponse = {
    id: "warehouse-reprint-1",
    email: "warehouse-reprint@example.com",
    name: "Warehouse Reprint",
    roles: ["WAREHOUSE"],
    permissions: ["load_jobs.read", "scan.create", "scan.reverse"],
  };
  const adminUser: AuthUserResponse = {
    id: "admin-reprint-1",
    email: "admin-reprint@example.com",
    name: "Admin Reprint",
    roles: ["ADMIN"],
    permissions: [],
  };

  assert.equal(canReprintLabels(officeUser), true);
  assert.equal(canReprintLabels(adminUser), true);
  assert.equal(canReprintLabels(warehouseUser), false);
  assert.equal(canReprintLabels(null), false);
});

test("settings updates require explicit settings update permission", () => {
  const officeUser: AuthUserResponse = {
    id: "office-settings-1",
    email: "office-settings@example.com",
    name: "Office Settings",
    roles: ["OFFICE"],
    permissions: ["settings.read"],
  };
  const settingsAdmin: AuthUserResponse = {
    id: "settings-admin-1",
    email: "settings-admin@example.com",
    name: "Settings Admin",
    roles: ["OFFICE"],
    permissions: ["settings.read", "settings.update"],
  };
  const adminUser: AuthUserResponse = {
    id: "admin-settings-1",
    email: "admin-settings@example.com",
    name: "Admin Settings",
    roles: ["ADMIN"],
    permissions: [],
  };

  assert.equal(canUpdateSettings(officeUser), false);
  assert.equal(canUpdateSettings(settingsAdmin), true);
  assert.equal(canUpdateSettings(adminUser), true);
  assert.equal(canUpdateSettings(null), false);
});

test("wage review navigation follows attendance and unloading wage permissions", () => {
  const hrManagerUser: AuthUserResponse = {
    id: "hr-manager-1",
    email: "hr-manager@example.com",
    name: "HR Manager",
    roles: ["HR_MANAGER"],
    permissions: [
      "attendance.read",
      "attendance.create",
      "attendance.parse",
      "attendance.generate",
    ],
  };
  const warehouseManagerUser: AuthUserResponse = {
    id: "warehouse-manager-1",
    email: "warehouse-manager@example.com",
    name: "Warehouse Manager",
    roles: ["WAREHOUSE_MANAGER"],
    permissions: [
      "containers.read",
      "corrections.create",
      "unloading_wage.read",
      "unloading_wage.classify",
      "unloading_wage.complete",
      "unloading_wage.settle",
    ],
  };
  const ordinaryWarehouseUser: AuthUserResponse = {
    id: "warehouse-wage-1",
    email: "warehouse-wage@example.com",
    name: "Warehouse Wage",
    roles: ["WAREHOUSE"],
    permissions: ["load_jobs.read", "inventory.read", "scan.create"],
  };
  const warehouseUser: AuthUserResponse = {
    id: "warehouse-custom-1",
    email: "warehouse-custom@example.com",
    name: "Warehouse Custom",
    roles: ["WAREHOUSE_MANAGER"],
    permissions: ["unloading_wage.read", "unloading_wage.complete"],
  };
  const adminUser: AuthUserResponse = {
    id: "admin-wage-1",
    email: "admin-wage@example.com",
    name: "Admin Wage",
    roles: ["ADMIN"],
    permissions: [],
  };

  assert.equal(canReviewWorkHours(hrManagerUser), true);
  assert.equal(canUploadWorkHours(hrManagerUser), true);
  assert.equal(canParseWorkHours(hrManagerUser), true);
  assert.equal(canGenerateWorkHours(hrManagerUser), true);
  assert.equal(canReviewUnloadingWage(hrManagerUser), false);
  assert.equal(canSettleUnloadingWage(hrManagerUser), false);
  assert.equal(canManageContainerUnloadingWage(hrManagerUser), false);

  assert.equal(canReviewWorkHours(warehouseManagerUser), false);
  assert.equal(canUploadWorkHours(warehouseManagerUser), false);
  assert.equal(canParseWorkHours(warehouseManagerUser), false);
  assert.equal(canGenerateWorkHours(warehouseManagerUser), false);
  assert.equal(canReviewUnloadingWage(warehouseManagerUser), true);
  assert.equal(canClassifyUnloadingWage(warehouseManagerUser), true);
  assert.equal(canCompleteUnloadingWage(warehouseManagerUser), true);
  assert.equal(canSettleUnloadingWage(warehouseManagerUser), true);
  assert.equal(canManageContainerUnloadingWage(warehouseManagerUser), true);

  assert.equal(canReviewWorkHours(officeUser), false);
  assert.equal(canReviewUnloadingWage(officeUser), false);
  assert.equal(canReviewWorkHours(ordinaryWarehouseUser), false);
  assert.equal(canReviewUnloadingWage(ordinaryWarehouseUser), false);

  assert.equal(canReviewUnloadingWage(warehouseUser), true);
  assert.equal(canSettleUnloadingWage(warehouseUser), false);
  assert.equal(canManageContainerUnloadingWage(warehouseUser), false);
  assert.equal(canManageContainerUnloadingWage(adminUser), true);
});

test("work hours actions follow attendance action permissions independently", () => {
  const readOnlyHrUser: AuthUserResponse = {
    id: "hr-readonly-1",
    email: "hr-readonly@example.com",
    name: "HR Readonly",
    roles: ["OFFICE"],
    permissions: ["attendance.read"],
  };
  const parseOnlyHrUser: AuthUserResponse = {
    id: "hr-parse-1",
    email: "hr-parse@example.com",
    name: "HR Parse",
    roles: ["OFFICE"],
    permissions: ["attendance.read", "attendance.parse"],
  };
  const adminUser: AuthUserResponse = {
    id: "admin-work-hours-1",
    email: "admin-work-hours@example.com",
    name: "Admin Work Hours",
    roles: ["ADMIN"],
    permissions: [],
  };

  assert.equal(canReviewWorkHours(readOnlyHrUser), true);
  assert.equal(canUploadWorkHours(readOnlyHrUser), false);
  assert.equal(canParseWorkHours(readOnlyHrUser), false);
  assert.equal(canGenerateWorkHours(readOnlyHrUser), false);
  assert.equal(canParseWorkHours(parseOnlyHrUser), true);
  assert.equal(canGenerateWorkHours(parseOnlyHrUser), false);
  assert.equal(canUploadWorkHours(adminUser), true);
  assert.equal(canParseWorkHours(adminUser), true);
  assert.equal(canGenerateWorkHours(adminUser), true);
});
