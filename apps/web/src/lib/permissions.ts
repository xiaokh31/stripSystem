import type { AuthUserResponse } from "./api-client";

export const ADMIN_ROLE_CODE = "ADMIN";
export const USERS_MANAGE_PERMISSION = "users.manage";
export const ROLES_MANAGE_PERMISSION = "roles.manage";

export function hasRole(
  user: AuthUserResponse | null,
  roleCode: string,
): boolean {
  return Boolean(
    user?.roles.some((role) => role.toUpperCase() === roleCode.toUpperCase()),
  );
}

export function hasPermission(
  user: AuthUserResponse | null,
  permissionCode: string,
): boolean {
  if (!user) {
    return false;
  }

  if (hasRole(user, ADMIN_ROLE_CODE)) {
    return true;
  }

  return user.permissions.includes(permissionCode);
}

export function hasAllPermissions(
  user: AuthUserResponse | null,
  permissionCodes: string[],
): boolean {
  return permissionCodes.every((permission) => hasPermission(user, permission));
}

export function canManageAccounts(user: AuthUserResponse | null): boolean {
  return hasRole(user, ADMIN_ROLE_CODE);
}
