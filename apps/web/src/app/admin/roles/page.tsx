import {
  AdminApiErrorPanel,
  AdminPageShell,
  adminAccessDeniedError,
  toAdminApiError,
} from "@/components/admin/admin-page-shell";
import { RolePermissionMatrix } from "@/components/admin/role-permission-matrix";
import { listPermissions, listRoles } from "@/lib/api-client";
import { canManageAccounts } from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export default async function AdminRolesPage() {
  const currentUser = await getServerCurrentUser();
  if (!canManageAccounts(currentUser)) {
    return (
      <AdminPageShell title="Roles and permissions">
        <AdminApiErrorPanel error={adminAccessDeniedError()} />
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
      <AdminPageShell title="Roles and permissions">
        <AdminApiErrorPanel error={toAdminApiError(rolesResult.reason)} />
      </AdminPageShell>
    );
  }

  if (permissionsResult.status === "rejected") {
    return (
      <AdminPageShell title="Roles and permissions">
        <AdminApiErrorPanel error={toAdminApiError(permissionsResult.reason)} />
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell title="Roles and permissions">
      <RolePermissionMatrix
        permissions={permissionsResult.value.items}
        roles={rolesResult.value.items}
      />
    </AdminPageShell>
  );
}
