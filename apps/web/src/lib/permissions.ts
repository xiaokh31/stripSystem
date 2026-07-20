import type { AuthUserResponse } from "./api-client";

export const ADMIN_ROLE_CODE = "ADMIN";
export const USERS_MANAGE_PERMISSION = "users.manage";
export const ROLES_MANAGE_PERMISSION = "roles.manage";
export const IMPORTS_DELETE_PERMISSION = "imports.delete";
export const INVENTORY_READ_PERMISSION = "inventory.read";
export const INVENTORY_ADJUST_PERMISSION = "inventory.adjust";
export const LOAD_JOBS_READ_PERMISSION = "load_jobs.read";
export const LOAD_JOBS_CREATE_PERMISSION = "load_jobs.create";
export const LOAD_JOBS_UPDATE_PERMISSION = "load_jobs.update";
export const LOAD_JOBS_COMPLETE_PERMISSION = "load_jobs.complete";
export const LABELS_REPRINT_PERMISSION = "labels.reprint";
export const SCAN_CREATE_PERMISSION = "scan.create";
export const SCAN_OVERRIDE_PERMISSION = "scan.override";
export const SCAN_REVERSE_PERMISSION = "scan.reverse";
export const SETTINGS_UPDATE_PERMISSION = "settings.update";
export const ATTENDANCE_READ_PERMISSION = "attendance.read";
export const ATTENDANCE_CREATE_PERMISSION = "attendance.create";
export const ATTENDANCE_PARSE_PERMISSION = "attendance.parse";
export const ATTENDANCE_GENERATE_PERMISSION = "attendance.generate";
export const CORRECTIONS_CREATE_PERMISSION = "corrections.create";
export const CONTAINERS_UPDATE_PERMISSION = "containers.update";
export const UNLOADING_WAGE_READ_PERMISSION = "unloading_wage.read";
export const UNLOADING_WAGE_CLASSIFY_PERMISSION = "unloading_wage.classify";
export const UNLOADING_WAGE_COMPLETE_PERMISSION = "unloading_wage.complete";
export const UNLOADING_WAGE_SETTLE_PERMISSION = "unloading_wage.settle";
export const UNLOADING_SUMMARY_READ_PERMISSION = "unloading_summary.read";
export const UNLOADING_SUMMARY_EXPORT_PERMISSION = "unloading_summary.export";
export const PARSER_PROFILES_READ_PERMISSION = "parser_profiles.read";
export const PARSER_PROFILES_TRAIN_PERMISSION = "parser_profiles.train";
export const PARSER_PROFILES_REVIEW_PERMISSION = "parser_profiles.review";
export const PARSER_PROFILES_APPROVE_PERMISSION = "parser_profiles.approve";

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

export function canDeleteImports(user: AuthUserResponse | null): boolean {
  return hasPermission(user, IMPORTS_DELETE_PERMISSION);
}

export function canAdjustInventory(user: AuthUserResponse | null): boolean {
  return hasPermission(user, INVENTORY_ADJUST_PERMISSION);
}

export function canSaveMobileDock(user: AuthUserResponse | null): boolean {
  return hasPermission(user, LOAD_JOBS_UPDATE_PERMISSION);
}

export function canCompleteMobileLoadJob(
  user: AuthUserResponse | null,
): boolean {
  return hasPermission(user, LOAD_JOBS_COMPLETE_PERMISSION);
}

export function canScanMobilePallets(user: AuthUserResponse | null): boolean {
  return hasPermission(user, SCAN_CREATE_PERMISSION);
}

export function canSupervisorOverrideScans(
  user: AuthUserResponse | null,
): boolean {
  return hasPermission(user, SCAN_OVERRIDE_PERMISSION);
}

export function canReverseMobileScans(
  user: AuthUserResponse | null,
): boolean {
  return hasPermission(user, SCAN_REVERSE_PERMISSION);
}

export function canReprintLabels(user: AuthUserResponse | null): boolean {
  return hasPermission(user, LABELS_REPRINT_PERMISSION);
}

export function canUpdateSettings(user: AuthUserResponse | null): boolean {
  return hasPermission(user, SETTINGS_UPDATE_PERMISSION);
}

export function canReviewWorkHours(user: AuthUserResponse | null): boolean {
  return hasPermission(user, ATTENDANCE_READ_PERMISSION);
}

export function canUploadWorkHours(user: AuthUserResponse | null): boolean {
  return hasPermission(user, ATTENDANCE_CREATE_PERMISSION);
}

export function canParseWorkHours(user: AuthUserResponse | null): boolean {
  return hasPermission(user, ATTENDANCE_PARSE_PERMISSION);
}

export function canGenerateWorkHours(user: AuthUserResponse | null): boolean {
  return hasPermission(user, ATTENDANCE_GENERATE_PERMISSION);
}

export function canReviewUnloadingWage(
  user: AuthUserResponse | null,
): boolean {
  return hasPermission(user, UNLOADING_WAGE_READ_PERMISSION);
}

export function canClassifyUnloadingWage(
  user: AuthUserResponse | null,
): boolean {
  return hasPermission(user, UNLOADING_WAGE_CLASSIFY_PERMISSION);
}

export function canCompleteUnloadingWage(
  user: AuthUserResponse | null,
): boolean {
  return hasPermission(user, UNLOADING_WAGE_COMPLETE_PERMISSION);
}

export function canSettleUnloadingWage(
  user: AuthUserResponse | null,
): boolean {
  return hasPermission(user, UNLOADING_WAGE_SETTLE_PERMISSION);
}

export function canReviewUnloadingSummary(
  user: AuthUserResponse | null,
): boolean {
  return hasPermission(user, UNLOADING_SUMMARY_READ_PERMISSION);
}

export function canExportUnloadingSummary(
  user: AuthUserResponse | null,
): boolean {
  return hasPermission(user, UNLOADING_SUMMARY_EXPORT_PERMISSION);
}

export function canManageContainerUnloadingWage(
  user: AuthUserResponse | null,
): boolean {
  return hasAllPermissions(user, [
    CORRECTIONS_CREATE_PERMISSION,
    UNLOADING_WAGE_CLASSIFY_PERMISSION,
    UNLOADING_WAGE_COMPLETE_PERMISSION,
  ]);
}

export function canReadParserProfiles(user: AuthUserResponse | null): boolean {
  return hasPermission(user, PARSER_PROFILES_READ_PERMISSION);
}

export function canTrainParserProfiles(user: AuthUserResponse | null): boolean {
  return hasPermission(user, PARSER_PROFILES_TRAIN_PERMISSION);
}

export function canReviewParserProfiles(user: AuthUserResponse | null): boolean {
  return hasPermission(user, PARSER_PROFILES_REVIEW_PERMISSION);
}

export function canDecideParserProfileReviews(
  user: AuthUserResponse | null,
): boolean {
  return hasAllPermissions(user, [
    PARSER_PROFILES_REVIEW_PERMISSION,
    CONTAINERS_UPDATE_PERMISSION,
    CORRECTIONS_CREATE_PERMISSION,
  ]);
}

export function canApproveParserProfiles(user: AuthUserResponse | null): boolean {
  return hasPermission(user, PARSER_PROFILES_APPROVE_PERMISSION);
}
