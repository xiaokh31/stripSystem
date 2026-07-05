import Link from "next/link";
import {
  INVENTORY_READ_PERMISSION,
  canReviewUnloadingWage,
  canReviewWorkHours,
  hasPermission,
} from "@/lib/permissions";
import { getServerCurrentUser } from "@/lib/server-auth";

export default async function ReportsPage() {
  const currentUser = await getServerCurrentUser();
  const showInventory = hasPermission(currentUser, INVENTORY_READ_PERMISSION);
  const showWorkHours = canReviewWorkHours(currentUser);
  const showUnloadingWage = canReviewUnloadingWage(currentUser);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase text-teal-700">Reports</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
          Warehouse reports
        </h1>
      </section>

      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3">
          {showInventory ? (
            <ReportLink href="/reports/inventory" title="Inventory report" />
          ) : null}
          {showWorkHours ? (
            <ReportLink href="/work-hours" title="HR Work Hours Settlement" />
          ) : null}
          {showUnloadingWage ? (
            <ReportLink
              href="/unloading-wage"
              title="Warehouse Unloading Wage Settlement"
            />
          ) : null}
          {!showInventory && !showWorkHours && !showUnloadingWage ? (
            <p className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              No report permission is assigned to the current account.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function ReportLink({ href, title }: { href: string; title: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 py-3 last:border-0">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <Link
        className="inline-flex min-h-10 items-center border border-teal-800 bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
        href={href}
      >
        Open report
      </Link>
    </div>
  );
}
