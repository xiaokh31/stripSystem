import type { RoleResponse } from "./api-client";

const ASSIGNABLE_USER_ROLE_CODES = new Set([
  "ADMIN",
  "HR_MANAGER",
  "OFFICE",
  "WAREHOUSE",
  "WAREHOUSE_MANAGER",
]);
const CREATE_USER_ROLE_CODES = new Set([
  "HR_MANAGER",
  "OFFICE",
  "WAREHOUSE",
  "WAREHOUSE_MANAGER",
]);

export function userCreateRoleOptions(roles: RoleResponse[]): RoleResponse[] {
  return roles.filter(
    (role) => role.isActive && CREATE_USER_ROLE_CODES.has(role.code),
  );
}

export function userAssignableRoleOptions(
  roles: RoleResponse[],
): RoleResponse[] {
  return roles.filter(
    (role) => role.isActive && ASSIGNABLE_USER_ROLE_CODES.has(role.code),
  );
}
