import {
  ApiClientError,
  getApiBaseUrl,
  getApiHealth,
  type ApiHealthResponse,
} from "@/lib/api-client";

export const dynamic = "force-dynamic";

type HealthState =
  | {
      ok: true;
      data: ApiHealthResponse;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        status: number;
      };
    };

async function loadHealth(): Promise<HealthState> {
  try {
    return {
      ok: true,
      data: await getApiHealth(),
    };
  } catch (error) {
    if (error instanceof ApiClientError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          status: error.status,
        },
      };
    }

    return {
      ok: false,
      error: {
        code: "WEB_API_ERROR",
        message: error instanceof Error ? error.message : "Unknown API error",
        status: 0,
      },
    };
  }
}

function StatusBadge({ status }: { status: string }) {
  const isOk = status === "ok" || status === "up";

  return (
    <span
      className={[
        "inline-flex min-h-7 items-center rounded px-2.5 text-xs font-semibold uppercase tracking-normal",
        isOk
          ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border border-amber-200 bg-amber-50 text-amber-800",
      ].join(" ")}
    >
      {status}
    </span>
  );
}

export default async function Home() {
  const health = await loadHealth();
  const apiBaseUrl = getApiBaseUrl();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase text-teal-700">
            Dashboard
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
            Bestar warehouse office
          </h1>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="border-l-4 border-teal-600 bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase text-zinc-500">
                System
              </p>
              <p className="mt-1 text-base font-semibold text-zinc-950">
                Office console
              </p>
            </div>
            <div className="border-l-4 border-amber-500 bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase text-zinc-500">
                Data source
              </p>
              <p className="mt-1 text-base font-semibold text-zinc-950">
                Live API
              </p>
            </div>
            <div className="border-l-4 border-cyan-600 bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase text-zinc-500">
                Phase
              </p>
              <p className="mt-1 text-base font-semibold text-zinc-950">
                P2 Office
              </p>
            </div>
          </div>
        </div>

        <div className="border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase text-zinc-500">
                API connection
              </p>
              <p className="mt-1 break-all text-sm text-zinc-700">
                {apiBaseUrl}
              </p>
            </div>
            {health.ok ? (
              <StatusBadge status={health.data.status} />
            ) : (
              <StatusBadge status="error" />
            )}
          </div>

          {health.ok ? (
            <dl className="mt-5 grid gap-3 text-sm">
              <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
                <dt className="text-zinc-500">API version</dt>
                <dd className="font-medium text-zinc-950">
                  {health.data.version}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
                <dt className="text-zinc-500">Database</dt>
                <dd>
                  <StatusBadge status={health.data.database.status} />
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
                <dt className="text-zinc-500">Checked at</dt>
                <dd className="font-medium text-zinc-950">
                  {health.data.timestamp}
                </dd>
              </div>
            </dl>
          ) : (
            <div
              className="mt-5 border border-red-200 bg-red-50 p-4 text-sm text-red-900"
              role="alert"
            >
              <p className="font-semibold">
                {health.error.code}
                {health.error.status ? ` (${health.error.status})` : ""}
              </p>
              <p className="mt-1">{health.error.message}</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
