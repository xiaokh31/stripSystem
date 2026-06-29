import test from "node:test";
import assert from "node:assert/strict";
import type { AuthUserResponse } from "../src/lib/api-client";
import {
  canManageAccounts,
  canManageOfficeLoadJobs,
  canReverseMobileScans,
  canSaveMobileDock,
  canScanMobilePallets,
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
      "scan.create",
      "scan.reverse",
      "inventory.read",
    ],
  };

  assert.equal(canViewMobileLoadJobs(warehouseUser), true);
  assert.equal(canSaveMobileDock(warehouseUser), true);
  assert.equal(canScanMobilePallets(warehouseUser), true);
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
  assert.equal(canScanMobilePallets(mobileOfficeUser), true);
  assert.equal(canReverseMobileScans(mobileOfficeUser), false);
  assert.equal(canViewMobileLoadJobs(null), false);
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
