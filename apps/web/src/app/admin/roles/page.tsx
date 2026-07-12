import {
  AdminApiErrorPanel,
  AdminPageShell,
  adminAccessDeniedError,
  toAdminApiError,
} from "@/components/admin/admin-page-shell";
import { RolePermissionMatrix } from "@/components/admin/role-permission-matrix";
import { listPermissions, listRoles } from "@/lib/api-client";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import { canManageAccounts } from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  const [currentUser, locale] = await Promise.all([
    getServerCurrentUser(),
    getServerLocale(),
  ]);
  const { t } = createTranslator(locale);

  if (!canManageAccounts(currentUser)) {
    return (
      <AdminPageShell locale={locale} title={t("Roles and permissions")}>
        <AdminApiErrorPanel error={adminAccessDeniedError()} locale={locale} />
      </AdminPageShell>
    );
  }

  const options = await getServerApiOptions();
  const [rolesResult, permissionsResult] = await Promise.allSettled([
    listRoles(options),
    listPermissions(options),
  ]);

  if (rolesResult.status === "rejected") {
    return (
      <AdminPageShell locale={locale} title={t("Roles and permissions")}>
        <AdminApiErrorPanel error={toAdminApiError(rolesResult.reason)} locale={locale} />
      </AdminPageShell>
    );
  }

  if (permissionsResult.status === "rejected") {
    return (
      <AdminPageShell locale={locale} title={t("Roles and permissions")}>
        <AdminApiErrorPanel error={toAdminApiError(permissionsResult.reason)} locale={locale} />
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell locale={locale} title={t("Roles and permissions")}>
      <RolePermissionMatrix
        permissions={permissionsResult.value.items}
        roles={rolesResult.value.items}
      />
    </AdminPageShell>
  );
}
