"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  ApiClientError,
  createUser,
  resetUserPassword,
  updateUser,
  updateUserRoles,
  updateUserStatus,
  type RoleResponse,
  type UserResponse,
} from "@/lib/api-client";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  userAssignableRoleOptions,
  userCreateRoleOptions,
} from "@/lib/admin-role-options";
import { formatOperationalDateTime } from "@/lib/date-time";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { roleDisplayLabel } from "@/lib/i18n/status-labels";
import { createTranslator } from "@/lib/i18n/translator";

const PASSWORD_MIN_LENGTH = 6;

interface UserManagementPanelProps {
  roles: RoleResponse[];
  users: UserResponse[];
}

interface CreateUserDraft {
  email: string;
  name: string;
  password: string;
  roleCodes: string[];
}

type UserDrafts = Record<
  string,
  {
    email: string;
    name: string;
    password: string;
    roleCodes: string[];
  }
>;

export function UserManagementPanel({
  roles,
  users,
}: UserManagementPanelProps) {
  const router = useRouter();
  const { format, locale, t } = useI18n();
  const createRoles = useMemo(
    () => userCreateRoleOptions(roles),
    [roles],
  );
  const assignableRoles = useMemo(
    () => userAssignableRoleOptions(roles),
    [roles],
  );
  const [createDraft, setCreateDraft] = useState<CreateUserDraft>({
    email: "",
    name: "",
    password: "",
    roleCodes: createRoles[0] ? [createRoles[0].code] : [],
  });
  const [drafts, setDrafts] = useState<UserDrafts>(() =>
    Object.fromEntries(
      users.map((user) => [
        user.id,
        {
          email: user.email ?? "",
          name: user.name ?? "",
          password: "",
          roleCodes: user.roles.map((role) => role.code),
        },
      ]),
    ),
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(label: MessageKey, action: () => Promise<unknown>) {
    setPendingAction(label);
    setNotice(null);
    setError(null);

    try {
      await action();
      setNotice(format("i18n.admin.actionSaved", { action: t(label) }));
      router.refresh();
    } catch (caught) {
      setError(toErrorMessage(caught, locale));
    } finally {
      setPendingAction(null);
    }
  }

  function toggleCreateRole(roleCode: string, checked: boolean) {
    setCreateDraft((current) => ({
      ...current,
      roleCodes: toggleValue(current.roleCodes, roleCode, checked),
    }));
  }

  function toggleUserRole(userId: string, roleCode: string, checked: boolean) {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        roleCodes: toggleValue(current[userId]?.roleCodes ?? [], roleCode, checked),
      },
    }));
  }

  function updateUserDraft(
    userId: string,
    field: "email" | "name" | "password",
    value: string,
  ) {
    setDrafts((current) => ({
      ...current,
      [userId]: updateDraftField(
        current[userId] ?? {
          email: "",
          name: "",
          password: "",
          roleCodes: [],
        },
        field,
        value,
      ),
    }));
  }

  function updateDraftField(
    draft: UserDrafts[string],
    field: "email" | "name" | "password",
    value: string,
  ): UserDrafts[string] {
    return {
      ...draft,
      [field]: value,
    };
  }

  function ensureUserDraft(userId: string): UserDrafts[string] {
    return (
      drafts[userId] ?? {
        email: "",
        name: "",
        password: "",
        roleCodes: [],
      }
    );
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("Create user", () =>
      createUser({
        email: createDraft.email,
        name: createDraft.name.trim() || null,
        password: createDraft.password,
        roleCodes: createDraft.roleCodes,
      }),
    );
  }

  return (
    <div className="grid gap-4">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
          <h2 className="text-base font-semibold text-zinc-950">
              {t("Create user")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
              {t("i18n.admin.userManagementDescription")}
            </p>
          </div>
          <StatusNotice error={error} notice={notice} />
        </div>

        <form
          className="mt-4 grid gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(160px,0.8fr)_minmax(160px,0.8fr)_minmax(180px,1fr)_auto]"
          onSubmit={handleCreateUser}
        >
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            {t("Email")}
            <input
              className="min-h-10 border border-zinc-300 px-3 text-sm text-zinc-950"
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              required
              type="email"
              value={createDraft.email}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            {t("Name")}
            <input
              className="min-h-10 border border-zinc-300 px-3 text-sm text-zinc-950"
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              type="text"
              value={createDraft.name}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            {t("Initial password")}
            <input
              className="min-h-10 border border-zinc-300 px-3 text-sm text-zinc-950"
              minLength={PASSWORD_MIN_LENGTH}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              required
              type="password"
              value={createDraft.password}
            />
          </label>
          <fieldset className="grid gap-2 text-sm font-medium text-zinc-700">
            <legend>{t("Roles")}</legend>
            <div className="flex min-h-10 flex-wrap items-center gap-3">
              {createRoles.map((role) => (
                <label
                  className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-700"
                  key={role.id}
                >
                  <input
                    checked={createDraft.roleCodes.includes(role.code)}
                    onChange={(event) =>
                      toggleCreateRole(role.code, event.target.checked)
                    }
                    type="checkbox"
                  />
                  {roleDisplayLabel(role.code, locale)}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            className="min-h-10 self-end border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              pendingAction !== null || createDraft.roleCodes.length === 0
            }
            type="submit"
          >
            {t("Create")}
          </button>
        </form>
      </section>

      <section className="overflow-x-auto border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="border-b border-zinc-200 px-4 py-3">{t("User")}</th>
              <th className="border-b border-zinc-200 px-4 py-3">{t("Status")}</th>
              <th className="border-b border-zinc-200 px-4 py-3">{t("Roles")}</th>
              <th className="border-b border-zinc-200 px-4 py-3">
                {t("Last login")}
              </th>
              <th className="border-b border-zinc-200 px-4 py-3">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const draft = drafts[user.id] ?? {
                ...ensureUserDraft(user.id),
                email: user.email ?? "",
                name: user.name ?? "",
                roleCodes: user.roles.map((role) => role.code),
              };

              return (
                <tr className="align-top" key={user.id}>
                  <td className="border-b border-zinc-100 px-4 py-4">
                    <div className="grid gap-2">
                      <input
                        className="min-h-10 border border-zinc-300 px-3 font-semibold text-zinc-950"
                        onChange={(event) =>
                          updateUserDraft(user.id, "email", event.target.value)
                        }
                        type="email"
                        value={draft.email}
                      />
                      <input
                        className="min-h-10 border border-zinc-300 px-3 text-zinc-700"
                        onChange={(event) =>
                          updateUserDraft(user.id, "name", event.target.value)
                        }
                        placeholder={t("Name")}
                        type="text"
                        value={draft.name}
                      />
                    </div>
                  </td>
                  <td className="border-b border-zinc-100 px-4 py-4">
                    <span
                      className={`inline-flex min-h-7 items-center px-2 text-xs font-semibold uppercase ${
                        user.isActive
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-zinc-200 text-zinc-700"
                      }`}
                    >
                      {user.isActive ? t("Active") : t("Inactive")}
                    </span>
                  </td>
                  <td className="border-b border-zinc-100 px-4 py-4">
                    <div className="grid gap-2">
                      {assignableRoles.map((role) => (
                        <label
                          className="inline-flex items-start gap-2 text-sm text-zinc-700"
                          key={role.id}
                        >
                          <input
                            checked={draft.roleCodes.includes(role.code)}
                            onChange={(event) =>
                              toggleUserRole(
                                user.id,
                                role.code,
                                event.target.checked,
                              )
                            }
                            type="checkbox"
                          />
                          <span>
                            <span className="font-semibold">
                              {roleDisplayLabel(role.code, locale)}
                            </span>
                            <span
                              className="ml-2 text-xs text-zinc-500"
                              data-i18n-ignore="true"
                            >
                              {role.code}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="border-b border-zinc-100 px-4 py-4 text-zinc-600">
                    {formatDateTime(user.lastLoginAt, locale)}
                  </td>
                  <td className="border-b border-zinc-100 px-4 py-4">
                    <div className="grid gap-2">
                      <button
                        className="min-h-9 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={pendingAction !== null}
                        onClick={() =>
                          runAction("i18n.admin.action.updateUser", () =>
                            updateUser(user.id, {
                              email: draft.email,
                              name: draft.name.trim() || null,
                            }),
                          )
                        }
                        type="button"
                      >
                        {t("Save profile")}
                      </button>
                      <button
                        className="min-h-9 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={
                          pendingAction !== null || draft.roleCodes.length === 0
                        }
                        onClick={() =>
                          runAction("i18n.admin.action.updateRoles", () =>
                            updateUserRoles(user.id, {
                              roleCodes: draft.roleCodes,
                            }),
                          )
                        }
                        type="button"
                      >
                        {t("Save roles")}
                      </button>
                      <button
                        className="min-h-9 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={pendingAction !== null}
                        onClick={() =>
                          runAction(
                            user.isActive
                              ? "i18n.admin.action.disableUser"
                              : "i18n.admin.action.enableUser",
                            () =>
                              updateUserStatus(user.id, {
                                isActive: !user.isActive,
                              }),
                          )
                        }
                        type="button"
                      >
                        {user.isActive ? t("Disable") : t("Enable")}
                      </button>
                      <div className="grid gap-2">
                        <input
                          className="min-h-9 border border-zinc-300 px-3 text-sm text-zinc-950"
                          minLength={PASSWORD_MIN_LENGTH}
                          onChange={(event) =>
                            updateUserDraft(
                              user.id,
                              "password",
                              event.target.value,
                            )
                          }
                          placeholder={t("New password")}
                          type="password"
                          value={draft.password}
                        />
                        <button
                          className="min-h-9 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            pendingAction !== null ||
                            draft.password.length < PASSWORD_MIN_LENGTH
                          }
                          onClick={() =>
                            runAction("i18n.admin.action.resetPassword", () =>
                              resetUserPassword(user.id, {
                                password: draft.password,
                              }),
                            )
                          }
                          type="button"
                        >
                        {t("Reset password")}
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function StatusNotice({
  error,
  notice,
}: {
  error: string | null;
  notice: string | null;
}) {
  if (!error && !notice) {
    return null;
  }

  return (
    <div
      className={`max-w-xl border px-3 py-2 text-sm ${
        error
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {error ?? notice}
    </div>
  );
}

function toggleValue(values: string[], value: string, checked: boolean) {
  if (checked) {
    return [...new Set([...values, value])].sort();
  }

  return values.filter((item) => item !== value);
}

function formatDateTime(value: string | null, locale: Locale): string {
  if (!value) {
    return createTranslator(locale).t("Never");
  }

  return formatOperationalDateTime(value);
}

function toErrorMessage(error: unknown, locale: Locale): string {
  const { t } = createTranslator(locale);
  return t(
    error instanceof ApiClientError && error.code === "FORBIDDEN"
      ? "Permission denied"
      : "User management request failed.",
  );
}
