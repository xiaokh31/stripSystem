import {
  AdminApiErrorPanel,
  AdminPageShell,
  adminAccessDeniedError,
  toAdminApiError,
} from "@/components/admin/admin-page-shell";
import { UserManagementPanel } from "@/components/admin/user-management-panel";
import { listRoles, listUsers } from "@/lib/api-client";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import { canManageAccounts } from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const [currentUser, locale] = await Promise.all([
    getServerCurrentUser(),
    getServerLocale(),
  ]);
  const { t } = createTranslator(locale);

  if (!canManageAccounts(currentUser)) {
    return (
      <AdminPageShell locale={locale} title={t("User management")}>
        <AdminApiErrorPanel error={adminAccessDeniedError()} locale={locale} />
      </AdminPageShell>
    );
  }

  const options = await getServerApiOptions();
  const [usersResult, rolesResult] = await Promise.allSettled([
    listUsers(options),
    listRoles(options),
  ]);

  if (usersResult.status === "rejected") {
    return (
      <AdminPageShell locale={locale} title={t("User management")}>
        <AdminApiErrorPanel error={toAdminApiError(usersResult.reason)} locale={locale} />
      </AdminPageShell>
    );
  }

  if (rolesResult.status === "rejected") {
    return (
      <AdminPageShell locale={locale} title={t("User management")}>
        <AdminApiErrorPanel error={toAdminApiError(rolesResult.reason)} locale={locale} />
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell locale={locale} title={t("User management")}>
      <UserManagementPanel
        roles={rolesResult.value.items}
        users={usersResult.value.items}
      />
    </AdminPageShell>
  );
}
