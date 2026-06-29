import type { AuthUserResponse } from "./api-client";

export const ADMIN_ROLE_CODE = "ADMIN";
export const USERS_MANAGE_PERMISSION = "users.manage";
export const ROLES_MANAGE_PERMISSION = "roles.manage";
export const LOAD_JOBS_READ_PERMISSION = "load_jobs.read";
export const LOAD_JOBS_CREATE_PERMISSION = "load_jobs.create";
export const LOAD_JOBS_UPDATE_PERMISSION = "load_jobs.update";
export const LABELS_REPRINT_PERMISSION = "labels.reprint";
export const SCAN_CREATE_PERMISSION = "scan.create";
export const SCAN_REVERSE_PERMISSION = "scan.reverse";

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

export function canViewMobileLoadJobs(
  user: AuthUserResponse | null,
): boolean {
  return hasPermission(user, LOAD_JOBS_READ_PERMISSION);
}

export function canManageOfficeLoadJobs(
  user: AuthUserResponse | null,
): boolean {
  return hasPermission(user, LOAD_JOBS_CREATE_PERMISSION);
}

export function canSaveMobileDock(user: AuthUserResponse | null): boolean {
  return hasPermission(user, LOAD_JOBS_UPDATE_PERMISSION);
}

export function canScanMobilePallets(user: AuthUserResponse | null): boolean {
  return hasPermission(user, SCAN_CREATE_PERMISSION);
}

export function canReverseMobileScans(
  user: AuthUserResponse | null,
): boolean {
  return hasPermission(user, SCAN_REVERSE_PERMISSION);
}

export function canReprintLabels(user: AuthUserResponse | null): boolean {
  return hasPermission(user, LABELS_REPRINT_PERMISSION);
}
