import Link from "next/link";
import type { ReactNode } from "react";
import { ApiClientError } from "@/lib/api-client";

export function AdminPageShell({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              Admin
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              {title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              Manage real account records through the protected API. The API
              permission guard remains the source of truth for access.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
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
      {children}
    </main>
  );
}

export function AdminApiErrorPanel({ error }: { error: ApiClientError }) {
  return (
    <section className="border border-red-200 bg-red-50 p-5 text-red-900 shadow-sm">
      <p className="text-sm font-semibold uppercase">Admin API error</p>
      <h2 className="mt-2 text-xl font-semibold">
        {error.status === 403 ? "Permission denied" : "Request failed"}
      </h2>
      <p className="mt-3 text-sm leading-6">{error.message}</p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
        <dt className="font-semibold">Status</dt>
        <dd>{error.status}</dd>
        <dt className="font-semibold">Code</dt>
        <dd>{error.code}</dd>
      </dl>
    </section>
  );
}

export function toAdminApiError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error;
  }

  return new ApiClientError({
    code: "ADMIN_API_ERROR",
    message:
      error instanceof Error
        ? error.message
        : "The admin API request failed.",
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
