import Link from "next/link";
import { OperationalSettingsForm } from "@/components/settings/operational-settings-form";
import {
  ApiClientError,
  getOperationalSettings,
  type OperationalSettingsResponse,
} from "@/lib/api-client";
import { canManageAccounts, canUpdateSettings } from "@/lib/permissions";
import { getServerApiOptions, getServerCurrentUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type SettingsState =
  | {
      ok: true;
      settings: OperationalSettingsResponse;
    }
  | {
      error: ApiClientError;
      ok: false;
    };

export default async function SettingsPage() {
  const currentUser = await getServerCurrentUser();
  const showAdmin = canManageAccounts(currentUser);
  const canEditSettings = canUpdateSettings(currentUser);
  const state = await loadSettings();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              Settings
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Operational settings
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              Configure the live operational profile used by office and
              warehouse workflows. Values are read from and saved to the
              backend Settings API.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {showAdmin ? (
              <Link
                className="inline-flex min-h-10 items-center border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                href="/admin/users"
              >
                Manage users
              </Link>
            ) : null}
            <Link
              className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
              href="/"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </section>

      {showAdmin ? (
        <section className="border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">
                Account administration
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
                Manage real API users, role assignments, and role permission
                mappings. Changes are saved through the protected admin API.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
                href="/admin/users"
              >
                Users
              </Link>
              <Link
                className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50"
                href="/admin/roles"
              >
                Roles and permissions
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {state.ok ? (
        <OperationalSettingsForm
          canEdit={canEditSettings}
          initialSettings={state.settings}
        />
      ) : (
        <SettingsErrorPanel error={state.error} />
      )}
    </main>
  );
}

async function loadSettings(): Promise<SettingsState> {
  try {
    return {
      ok: true,
      settings: await getOperationalSettings(await getServerApiOptions()),
    };
  } catch (error) {
    return {
      error: toApiClientError(error),
      ok: false,
    };
  }
}

function SettingsErrorPanel({ error }: { error: ApiClientError }) {
  return (
    <section
      className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm"
      role="alert"
    >
      <h2 className="text-base font-semibold">Settings could not be loaded</h2>
      <p className="mt-2 text-sm leading-6">{error.message}</p>
      <p className="mt-2 text-xs font-semibold uppercase">
        {error.code}
        {error.status ? ` (${error.status})` : ""}
      </p>
    </section>
  );
}

function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "SETTINGS_LOAD_FAILED",
    message:
      error instanceof Error
        ? error.message
        : "Operational settings could not be loaded.",
    status: 0,
  });
}
