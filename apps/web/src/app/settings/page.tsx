import Link from "next/link";
import { OperationalSettingsForm } from "@/components/settings/operational-settings-form";
import {
  ApiClientError,
  getOperationalSettings,
  getPalletPolicy,
  type OperationalSettingsResponse,
  type PalletPolicySnapshotResponse,
} from "@/lib/api-client";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import { canManageAccounts, canUpdateSettings } from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type SettingsState =
  | {
      ok: true;
      settings: OperationalSettingsResponse;
      policy: PalletPolicySnapshotResponse;
    }
  | {
      error: ApiClientError;
      ok: false;
    };

export default async function SettingsPage() {
  const [currentUser, locale, state] = await Promise.all([
    getServerCurrentUser(),
    getServerLocale(),
    loadSettings(),
  ]);
  const { t } = createTranslator(locale);
  const showAdmin = canManageAccounts(currentUser);
  const canEditSettings = canUpdateSettings(currentUser);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              {t("Settings")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              {t("Operational settings")}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              {t(
                "Configure the live operational profile used by office and warehouse workflows. Values are read from and saved to the backend Settings API.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {showAdmin ? (
              <Link
                className="inline-flex min-h-10 items-center border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                href="/admin/users"
              >
                {t("Manage users")}
              </Link>
            ) : null}
            <Link
              className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href="/"
            >
              {t("Dashboard")}
            </Link>
          </div>
        </div>
      </section>

      {showAdmin ? (
        <section className="border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">
                {t("Account administration")}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
                {t(
                  "Manage real API users, role assignments, and role permission mappings. Changes are saved through the protected admin API.",
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
                href="/admin/users"
              >
                {t("Users")}
              </Link>
              <Link
                className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
                href="/admin/roles"
              >
                {t("Roles and permissions")}
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {state.ok ? (
        <OperationalSettingsForm
          canEdit={canEditSettings}
          initialSettings={state.settings}
          palletPolicy={state.policy}
        />
      ) : (
        <SettingsErrorPanel error={state.error} locale={locale} />
      )}
    </main>
  );
}

async function loadSettings(): Promise<SettingsState> {
  try {
    const options = await getServerApiOptions();
    const [settings, policy] = await Promise.all([
      getOperationalSettings(options),
      getPalletPolicy(options),
    ]);
    return {
      ok: true,
      policy,
      settings,
    };
  } catch (error) {
    return {
      error: toApiClientError(error),
      ok: false,
    };
  }
}

function SettingsErrorPanel({
  error,
  locale,
}: {
  error: ApiClientError;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);

  return (
    <section
      className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
      role="alert"
    >
      <h2 className="text-base font-semibold">
        {t("Settings could not be loaded")}
      </h2>
      <p className="mt-2 text-sm leading-6">
        {t(settingsErrorMessageKey(error.code))}
      </p>
      <p
        className="mt-2 text-xs font-semibold uppercase"
        data-i18n-ignore="true"
      >
        {error.code}
        {error.status ? ` (${error.status})` : ""}
      </p>
    </section>
  );
}

function settingsErrorMessageKey(code: string): MessageKey {
  return code === "FORBIDDEN"
    ? "Permission denied"
    : "Operational settings could not be loaded.";
}

function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "SETTINGS_LOAD_FAILED",
    message: "Operational settings could not be loaded.",
    status: 0,
  });
}
