import Link from "next/link";

export default function ReportsPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase text-teal-700">Reports</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
          Warehouse reports
        </h1>
      </section>

      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-950">
              Inventory report
            </h2>
          </div>
          <Link
            className="inline-flex min-h-10 items-center border border-teal-800 bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
            href="/reports/inventory"
          >
            Open report
          </Link>
        </div>
      </section>
    </main>
  );
}
