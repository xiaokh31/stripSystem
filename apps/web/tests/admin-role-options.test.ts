import assert from "node:assert/strict";
import test from "node:test";
import type { RoleResponse } from "../src/lib/api-client";
import {
  userAssignableRoleOptions,
  userCreateRoleOptions,
} from "../src/lib/admin-role-options";

test("user create role options include wage manager browser-login roles", () => {
  assert.deepEqual(roleCodes(userCreateRoleOptions(sampleRoles())), [
    "HR_MANAGER",
    "OFFICE",
    "WAREHOUSE",
    "WAREHOUSE_MANAGER",
  ]);
});

test("user assignable role options include admin and wage manager roles", () => {
  assert.deepEqual(roleCodes(userAssignableRoleOptions(sampleRoles())), [
    "ADMIN",
    "HR_MANAGER",
    "OFFICE",
    "WAREHOUSE",
    "WAREHOUSE_MANAGER",
  ]);
});

test("user role options exclude inactive, system, and e2e-only roles", () => {
  const roles = [
    role("SYSTEM"),
    role("E2E_ATTENDANCE_READ_123"),
    role("HR_MANAGER", { isActive: false }),
    role("WAREHOUSE_MANAGER", { isActive: false }),
  ];

  assert.deepEqual(userCreateRoleOptions(roles), []);
  assert.deepEqual(userAssignableRoleOptions(roles), []);
});

function sampleRoles(): RoleResponse[] {
  return [
    role("ADMIN"),
    role("HR_MANAGER"),
    role("OFFICE"),
    role("WAREHOUSE"),
    role("WAREHOUSE_MANAGER"),
    role("SYSTEM"),
    role("E2E_ATTENDANCE_READ_123"),
  ];
}

function role(
  code: string,
  overrides: Partial<RoleResponse> = {},
): RoleResponse {
  return {
    id: `role-${code.toLowerCase()}`,
    code,
    displayName: code,
    description: null,
    isSystem: code === "SYSTEM",
    isActive: true,
    permissions: [],
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
    ...overrides,
  };
}

function roleCodes(roles: RoleResponse[]): string[] {
  return roles.map((item) => item.code);
}
