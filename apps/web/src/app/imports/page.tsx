import Link from "next/link";

export default function ImportsPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">
              Office
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
              Imports
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
              Upload real .xlsx unloading files. Import history and parse
              details are handled in later P2 tasks.
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
            href="/imports/new"
          >
            New import
          </Link>
        </div>
      </section>
    </main>
  );
}
