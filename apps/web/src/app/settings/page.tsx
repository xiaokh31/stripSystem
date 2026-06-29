import Link from "next/link";
import { OPERATIONAL_TIME_ZONE_DESCRIPTION } from "@/lib/date-time";
import { canManageAccounts } from "@/lib/permissions";
import { getServerCurrentUser } from "@/lib/server-auth";

const settingsSections = [
  {
    title: "Operational profile",
    rows: [
      { label: "Delivery phase", value: "P5 Pilot Ready" },
      { label: "Data source", value: "Live API" },
      {
        label: "Operational time zone",
        value: OPERATIONAL_TIME_ZONE_DESCRIPTION,
      },
    ],
  },
  {
    title: "Warehouse rules",
    rows: [
      { label: "Original uploads", value: "Preserved for every import" },
      { label: "Duplicate imports", value: "Detected by SHA-256" },
      { label: "Manual correction", value: "Stored with audit feedback" },
      { label: "Inventory source", value: "Calculated from backend state" },
    ],
  },
  {
    title: "Generated files",
    rows: [
      { label: "Unloading report", value: "Company Excel template" },
      { label: "Pallet labels", value: "150mm x 100mm PDF" },
      { label: "QR target size", value: "25mm x 25mm" },
      { label: "Generation record", value: "Recorded for reports and labels" },
    ],
  },
  {
    title: "Deployment",
    rows: [
      { label: "Runtime", value: "Docker Compose full stack" },
      { label: "Database", value: "PostgreSQL with backup scripts" },
      { label: "Storage", value: "Persistent upload, report, and label files" },
    ],
  },
];

export default async function SettingsPage() {
  const currentUser = await getServerCurrentUser();
  const showAdmin = canManageAccounts(currentUser);

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
              Current pilot configuration for unloading imports, report
              generation, pallet labels, inventory, loading scans, and local
              deployment.
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

      <section className="grid gap-4 lg:grid-cols-2">
        {settingsSections.map((section) => (
          <article
            className="border border-zinc-200 bg-white p-5 shadow-sm"
            key={section.title}
          >
            <h2 className="text-base font-semibold text-zinc-950">
              {section.title}
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              {section.rows.map((row) => (
                <div
                  className="grid gap-1 border-t border-zinc-100 pt-3 sm:grid-cols-[180px_minmax(0,1fr)]"
                  key={row.label}
                >
                  <dt className="font-medium text-zinc-500">{row.label}</dt>
                  <dd className="break-words font-semibold text-zinc-950">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </section>
    </main>
  );
}
