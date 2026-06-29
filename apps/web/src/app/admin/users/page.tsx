import {
  AdminApiErrorPanel,
  AdminPageShell,
  adminAccessDeniedError,
  toAdminApiError,
} from "@/components/admin/admin-page-shell";
import { UserManagementPanel } from "@/components/admin/user-management-panel";
import { listRoles, listUsers } from "@/lib/api-client";
import { canManageAccounts } from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export default async function AdminUsersPage() {
  const currentUser = await getServerCurrentUser();
  if (!canManageAccounts(currentUser)) {
    return (
      <AdminPageShell title="User management">
        <AdminApiErrorPanel error={adminAccessDeniedError()} />
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
      <AdminPageShell title="User management">
        <AdminApiErrorPanel error={toAdminApiError(usersResult.reason)} />
      </AdminPageShell>
    );
  }

  if (rolesResult.status === "rejected") {
    return (
      <AdminPageShell title="User management">
        <AdminApiErrorPanel error={toAdminApiError(rolesResult.reason)} />
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell title="User management">
      <UserManagementPanel
        roles={rolesResult.value.items}
        users={usersResult.value.items}
      />
    </AdminPageShell>
  );
}
