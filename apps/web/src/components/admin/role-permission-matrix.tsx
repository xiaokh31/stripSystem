"use client";

import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import {
  ApiClientError,
  updateRolePermissions,
  type PermissionResponse,
  type RoleResponse,
} from "@/lib/api-client";

interface RolePermissionMatrixProps {
  permissions: PermissionResponse[];
  roles: RoleResponse[];
}

type RolePermissionDrafts = Record<string, string[]>;

export function RolePermissionMatrix({
  permissions,
  roles,
}: RolePermissionMatrixProps) {
  const router = useRouter();
  const groupedPermissions = useMemo(
    () => groupPermissionsByCategory(permissions),
    [permissions],
  );
  const [drafts, setDrafts] = useState<RolePermissionDrafts>(() =>
    Object.fromEntries(
      roles.map((role) => [
        role.id,
        role.permissions.map((permission) => permission.code),
      ]),
    ),
  );
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function togglePermission(
    roleId: string,
    permissionCode: string,
    checked: boolean,
  ) {
    setDrafts((current) => ({
      ...current,
      [roleId]: toggleValue(current[roleId] ?? [], permissionCode, checked),
    }));
  }

  async function saveRole(role: RoleResponse) {
    setPendingRoleId(role.id);
    setNotice(null);
    setError(null);

    try {
      await updateRolePermissions(role.id, {
        permissionCodes: drafts[role.id] ?? [],
      });
      setNotice(`${role.code} permissions saved. Data was refreshed from API.`);
      router.refresh();
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setPendingRoleId(null);
    }
  }

  return (
    <div className="grid gap-4">
      {(notice || error) && (
        <section
          className={`border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error ?? notice}
        </section>
      )}

      <section className="overflow-x-auto border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-[980px] w-full border-collapse text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="sticky left-0 z-10 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                Permission
              </th>
              {roles.map((role) => (
                <th
                  className="border-b border-zinc-200 px-4 py-3"
                  key={role.id}
                >
                  <div className="grid gap-1">
                    <span className="font-semibold text-zinc-700">
                      {role.code}
                    </span>
                    <span className="normal-case text-zinc-500">
                      {role.displayName}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedPermissions.map((group) => (
              <Fragment key={group.category}>
                <tr>
                  <td
                    className="border-b border-zinc-200 bg-zinc-100 px-4 py-2 text-xs font-semibold uppercase text-zinc-600"
                    colSpan={roles.length + 1}
                  >
                    {group.category}
                  </td>
                </tr>
                {group.permissions.map((permission) => (
                  <tr key={permission.id}>
                    <td className="sticky left-0 border-b border-zinc-100 bg-white px-4 py-3">
                      <p className="font-semibold text-zinc-950">
                        {permission.code}
                      </p>
                      <p className="mt-1 max-w-md text-xs leading-5 text-zinc-500">
                        {permission.description ?? "No description"}
                      </p>
                    </td>
                    {roles.map((role) => {
                      const checked = (drafts[role.id] ?? []).includes(
                        permission.code,
                      );

                      return (
                        <td
                          className="border-b border-zinc-100 px-4 py-3"
                          key={`${role.id}-${permission.id}`}
                        >
                          <label className="inline-flex min-h-9 min-w-9 items-center justify-center border border-zinc-300 bg-white">
                            <input
                              aria-label={`${role.code} ${permission.code}`}
                              checked={checked}
                              onChange={(event) =>
                                togglePermission(
                                  role.id,
                                  permission.code,
                                  event.target.checked,
                                )
                              }
                              type="checkbox"
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase text-zinc-500">
                Save
              </td>
              {roles.map((role) => (
                <td
                  className="border-t border-zinc-200 bg-zinc-50 px-4 py-3"
                  key={`${role.id}-save`}
                >
                  <button
                    className="min-h-9 border border-teal-700 bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={pendingRoleId !== null}
                    onClick={() => saveRole(role)}
                    type="button"
                  >
                    {pendingRoleId === role.id ? "Saving" : "Save"}
                  </button>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}

function groupPermissionsByCategory(permissions: PermissionResponse[]) {
  const groups = new Map<string, PermissionResponse[]>();

  for (const permission of permissions) {
    const category = permission.category ?? "uncategorized";
    groups.set(category, [...(groups.get(category) ?? []), permission]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, items]) => ({
      category,
      permissions: items.sort((left, right) =>
        left.code.localeCompare(right.code),
      ),
    }));
}

function toggleValue(values: string[], value: string, checked: boolean) {
  if (checked) {
    return [...new Set([...values, value])].sort();
  }

  return values.filter((item) => item !== value);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.status} ${error.code}: ${error.message}`;
  }

  return error instanceof Error ? error.message : "The request failed.";
}
