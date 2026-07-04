import test from "node:test";
import assert from "node:assert/strict";
import type { AuthUserResponse } from "../src/lib/api-client";
import {
  canManageAccounts,
  canDeleteImports,
  canManageOfficeLoadJobs,
  canCompleteMobileLoadJob,
  canReprintLabels,
  canReviewUnloadingWage,
  canReviewWorkHours,
  canReverseMobileScans,
  canSaveMobileDock,
  canScanMobilePallets,
  canSettleUnloadingWage,
  canSupervisorOverrideScans,
  canUpdateSettings,
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
  const officeWageUser: AuthUserResponse = {
    id: "office-wage-1",
    email: "office-wage@example.com",
    name: "Office Wage",
    roles: ["OFFICE"],
    permissions: [
      "attendance.read",
      "attendance.create",
      "unloading_wage.read",
      "unloading_wage.settle",
    ],
  };
  const warehouseUser: AuthUserResponse = {
    id: "warehouse-wage-1",
    email: "warehouse-wage@example.com",
    name: "Warehouse Wage",
    roles: ["WAREHOUSE"],
    permissions: ["unloading_wage.read", "unloading_wage.complete"],
  };

  assert.equal(canReviewWorkHours(officeWageUser), true);
  assert.equal(canReviewUnloadingWage(officeWageUser), true);
  assert.equal(canSettleUnloadingWage(officeWageUser), true);
  assert.equal(canReviewWorkHours(warehouseUser), false);
  assert.equal(canReviewUnloadingWage(warehouseUser), true);
  assert.equal(canSettleUnloadingWage(warehouseUser), false);
});
