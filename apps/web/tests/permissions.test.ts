import test from "node:test";
import assert from "node:assert/strict";
import type { AuthUserResponse } from "../src/lib/api-client";
import {
  canManageAccounts,
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
