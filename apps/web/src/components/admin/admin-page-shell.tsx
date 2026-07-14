import Link from "next/link";
import type { ReactNode } from "react";
import { ApiClientError } from "@/lib/api-client";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { createTranslator } from "@/lib/i18n/translator";

export function AdminPageShell({
  children,
  locale,
  title,
}: {
  children: ReactNode;
  locale: Locale;
  title: string;
}) {
  const { t } = createTranslator(locale);

  return (
    <main className="office-main-content flex flex-1 flex-col gap-4 py-6">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              {t("Admin")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              {title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              {t(
                "Manage real account records through the protected API. The API permission guard remains the source of truth for access.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
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
      {children}
    </main>
  );
}

export function AdminApiErrorPanel({
  error,
  locale,
}: {
  error: ApiClientError;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);
  const message = t(adminApiErrorMessageKey(error.code));

  return (
    <section className="border border-red-200 bg-red-50 p-5 text-red-900 shadow-sm">
      <p className="text-sm font-semibold uppercase">{t("Admin API error")}</p>
      <h2 className="mt-2 text-xl font-semibold">
        {error.status === 403 ? t("Permission denied") : t("Request failed")}
      </h2>
      <p className="mt-3 text-sm leading-6">{message}</p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
        <dt className="font-semibold">{t("Status")}</dt>
        <dd data-i18n-ignore="true">{error.status}</dd>
        <dt className="font-semibold">{t("Code")}</dt>
        <dd data-i18n-ignore="true">{error.code}</dd>
      </dl>
    </section>
  );
}

function adminApiErrorMessageKey(code: string): MessageKey {
  return code === "FORBIDDEN"
    ? "Only ADMIN users can access account administration."
    : "The admin API request failed.";
}

export function toAdminApiError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "ADMIN_API_ERROR",
    message: "The admin API request failed.",
    status: 0,
  });
}

export function adminAccessDeniedError(): ApiClientError {
  return new ApiClientError({
    code: "FORBIDDEN",
    message: "Only ADMIN users can access account administration.",
    status: 403,
  });
}
