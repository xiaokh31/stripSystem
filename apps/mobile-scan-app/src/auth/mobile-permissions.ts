import type { AuthUser } from "./auth-types";

export const adminRoleCode = "ADMIN";
export const loadJobsCompletePermission = "load_jobs.complete";
export const loadJobsReadPermission = "load_jobs.read";
export const loadJobsUpdatePermission = "load_jobs.update";
export const scanCreatePermission = "scan.create";
export const scanOverridePermission = "scan.override";

const mobileScanPermissions = [loadJobsReadPermission, scanCreatePermission];

export function hasRole(user: AuthUser | null, roleCode: string): boolean {
  return Boolean(
    user?.roles.some((role) => role.toUpperCase() === roleCode.toUpperCase()),
  );
}

export function hasPermission(
  user: AuthUser | null,
  permissionCode: string,
): boolean {
  if (!user) {
    return false;
  }

  if (hasRole(user, adminRoleCode)) {
    return true;
  }

  return user.permissions.includes(permissionCode);
}

export function canUseMobileScan(user: AuthUser | null): boolean {
  return mobileScanPermissions.every((permission) =>
    hasPermission(user, permission),
  );
}

export function canSupervisorOverrideScans(user: AuthUser | null): boolean {
  return hasPermission(user, scanOverridePermission);
}

export function canUpdateMobileDock(user: AuthUser | null): boolean {
  return hasPermission(user, loadJobsUpdatePermission);
}

export function canCompleteMobileLoadJob(user: AuthUser | null): boolean {
  return hasPermission(user, loadJobsCompletePermission);
}
